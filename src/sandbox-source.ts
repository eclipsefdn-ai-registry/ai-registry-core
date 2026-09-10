import { execFileSync } from "node:child_process";
import { readFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, join, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { computeContentHash } from "./skill-source.js";
import type {
  SandboxExtensionEntry,
  PendingSandboxExtension,
} from "./consolidate.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// --- Types ---

export type SandboxKind = "sandbox" | "mixin";

export interface SandboxSpec {
  name: string;
  displayName: string | undefined;
  description: string;
  kind: SandboxKind | undefined;
}

export interface SandboxExtensionMetadata {
  kind: SandboxKind;
  name: string;
  extensionName: string;
  description: string;
  contentHash: string;
}

// The registry publishes sandbox extensions found at exactly these two
// prefixes, with the kind fixed by the prefix. Enclave itself is laxer — it
// scans any layout up to 8 directories deep and takes the kind from the spec
// alone (docs/extensions/installing.md, "Discovery") — but its *install*
// destination is `tools/<name>` and `features/<name>`, and every kit
// repository in the wild follows that in the source too. Requiring it here
// keeps discovery to one cheap ls-tree per prefix instead of a second
// implementation of Enclave's scanner that would drift from the Go original.
// The cost is that a repo laid out differently publishes nothing, which
// discoverSandboxExtensions warns about rather than passing over in silence.
export const KIND_DIRS: Record<string, SandboxKind> = {
  tools: "sandbox",
  features: "mixin",
};

const SPEC_FILENAMES = ["spec.yaml", "spec.json"];

// --- Spec parsing ---

function stringField(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/**
 * Parse a `spec.yaml` or `spec.json` document. `filename` selects the parser;
 * both formats are valid to Enclave, and YAML is a superset of JSON in
 * practice, but parsing JSON as JSON keeps the error messages honest.
 *
 * `kind` is left undefined for anything that isn't one of the two known
 * values, so the caller reports "unknown kind" rather than silently treating a
 * typo as the kind its directory implies.
 */
export function parseSandboxSpec(
  content: string,
  filename: string,
): SandboxSpec {
  const data = (
    filename.endsWith(".json") ? JSON.parse(content) : parseYaml(content)
  ) as Record<string, unknown> | null;

  if (!data || typeof data !== "object") {
    return {
      name: "",
      displayName: undefined,
      description: "",
      kind: undefined,
    };
  }

  const rawKind = stringField(data.kind);
  const displayName = stringField(data.displayName);

  return {
    name: stringField(data.name),
    displayName: displayName || undefined,
    description: stringField(data.description),
    kind: rawKind === "sandbox" || rawKind === "mixin" ? rawKind : undefined,
  };
}

// --- Repository fetching ---

// Keyed on url + ref so one approval's repository is cloned once and reused
// across every extension found in it, while the same repository approved at
// two different refs still gets two checkouts.
export function sandboxCloneKey(sourceUrl: string, ref?: string): string {
  return createHash("sha256")
    .update(`${sourceUrl}|${ref ?? ""}`)
    .digest("hex")
    .slice(0, 8);
}

function cloneSandboxRepo(
  sourceUrl: string,
  tmpDir: string,
  ref?: string,
): string {
  const cloneDir = join(tmpDir, `sandbox-${sandboxCloneKey(sourceUrl, ref)}`);
  if (existsSync(cloneDir)) return cloneDir;

  const token = process.env.GH_TOKEN;
  const repoUrl = token
    ? sourceUrl.replace("https://", `https://x-access-token:${token}@`)
    : sourceUrl;

  const cloneArgs = ["clone", "--depth", "1", "--filter=blob:none", "--sparse"];
  // --branch accepts a tag or branch name, not an arbitrary commit sha. The
  // schema can't tell those apart, so a commit-only ref fails the clone and
  // the whole approval is skipped with the message below — the same outcome as
  // any other unreachable source, and visible rather than silently ignored.
  if (ref) cloneArgs.push("--branch", ref);
  cloneArgs.push(repoUrl, cloneDir);

  try {
    execFileSync("git", cloneArgs, { stdio: "pipe" });
  } catch {
    throw new Error(
      `Failed to clone ${sourceUrl}${ref ? ` at ref "${ref}"` : ""}`,
    );
  }

  return cloneDir;
}

// --- Discovery ---

function lsTree(cloneDir: string, args: string[]): string[] {
  try {
    const out = execFileSync("git", ["-C", cloneDir, "ls-tree", ...args], {
      stdio: "pipe",
      encoding: "utf-8",
      // The stray-spec scan below is a recursive listing of every path in the
      // repository, which overruns the 1 MB default on a large monorepo.
      // execFileSync surfaces that as a throw, which this catch would turn
      // into "no strays found" — the warning would go missing exactly on the
      // repositories most likely to have one. ls-tree takes pathspecs but not
      // the :(glob) magic that would narrow it, so the room is bought here.
      maxBuffer: 64 * 1024 * 1024,
    }).trim();
    return out ? out.split("\n").filter(Boolean) : [];
  } catch {
    return [];
  }
}

export interface DiscoveredExtension {
  path: string;
  kind: SandboxKind;
  specFile: string;
}

/**
 * List the extension directories under `tools/` and `features/`, in the order
 * a reader would expect (features before tools, then alphabetical), along with
 * the kind their prefix fixes and which spec file they carry.
 *
 * Reads only tree metadata, so it stays cheap on the blobless clone above.
 */
export function discoverSandboxExtensions(cloneDir: string): {
  discovered: DiscoveredExtension[];
  warnings: string[];
} {
  const discovered: DiscoveredExtension[] = [];
  const warnings: string[] = [];

  for (const [dir, kind] of Object.entries(KIND_DIRS)) {
    for (const childPath of lsTree(cloneDir, [
      "--name-only",
      "HEAD",
      `${dir}/`,
    ])) {
      if (childPath.split("/").pop()!.startsWith(".")) continue;
      const specFile = SPEC_FILENAMES.find(
        (f) => lsTree(cloneDir, ["HEAD", `${childPath}/${f}`]).length > 0,
      );
      if (specFile) discovered.push({ path: childPath, kind, specFile });
    }
  }

  // Enclave's own discovery scans the whole repository, so a spec we don't
  // publish is still one `enclave add --name` can match — and two directories
  // declaring the same name are a hard error there, naming both. Say so rather
  // than publishing a command that fails on someone else's machine.
  const strays = lsTree(cloneDir, ["-r", "--name-only", "HEAD"]).filter(
    (p) =>
      SPEC_FILENAMES.includes(p.split("/").pop()!) &&
      !Object.keys(KIND_DIRS).some((d) => p.startsWith(`${d}/`)),
  );
  if (strays.length > 0) {
    warnings.push(
      `found ${strays.length} spec file(s) outside tools/ and features/ (${strays.join(", ")}) — not published, but still visible to "enclave add", where a duplicate extension name is a hard error`,
    );
  }

  return {
    discovered: discovered.sort((a, b) => a.path.localeCompare(b.path)),
    warnings,
  };
}

// --- Per-extension metadata ---

/**
 * Read one discovered extension: materialize its directory, parse the spec,
 * check it against the two rules the registry enforces, and hash the contents.
 *
 * Throws (caller skips the entry with a warning) when the spec is unreadable,
 * declares an unknown kind, contradicts its prefix, or names something other
 * than its own directory — Enclave's own name/directory rule, which is what
 * makes the last path segment usable as the `--name` argument.
 */
export function fetchSandboxExtensionMetadata(
  cloneDir: string,
  extension: DiscoveredExtension,
): SandboxExtensionMetadata {
  // extension.path comes from ls-tree output rather than an approval file,
  // but it still names a directory in someone else's repository. Check that it
  // resolves inside the clone before handing it to git at all, and pass it as
  // its own argv entry (execFileSync, no shell) — the same defense
  // plugin-source.ts applies to its vendor-supplied path.
  const resolvedCloneDir = resolve(cloneDir);
  const extensionDir = resolve(cloneDir, extension.path);
  if (!extensionDir.startsWith(resolvedCloneDir + sep)) {
    throw new Error(`Path "${extension.path}" escapes the cloned repository`);
  }

  // Widening the cone is what materializes file content on the blobless
  // sparse clone enrichment creates. A failure here isn't fatal on its own —
  // a full (non-sparse) checkout already has the files, and git refuses the
  // command outright on one — so let the spec-file check below decide whether
  // the content actually arrived.
  try {
    execFileSync(
      "git",
      ["-C", cloneDir, "sparse-checkout", "add", extension.path],
      { stdio: "pipe" },
    );
  } catch {
    // fall through to the existence check
  }

  const specPath = join(extensionDir, extension.specFile);
  if (!existsSync(specPath)) {
    throw new Error(
      `${extension.specFile} could not be read at "${extension.path}"`,
    );
  }

  let spec: SandboxSpec;
  try {
    spec = parseSandboxSpec(
      readFileSync(specPath, "utf-8"),
      extension.specFile,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(
      `could not parse ${extension.path}/${extension.specFile}: ${message}`,
    );
  }

  if (!spec.kind) {
    throw new Error(
      `${extension.path}/${extension.specFile} declares no valid kind (expected "sandbox" or "mixin")`,
    );
  }
  if (spec.kind !== extension.kind) {
    throw new Error(
      `${extension.path} declares kind "${spec.kind}" but sits under a "${extension.kind}" directory`,
    );
  }

  const dirName = extension.path.split("/").pop()!;
  if (spec.name !== dirName) {
    throw new Error(
      `${extension.path}/${extension.specFile} declares name "${spec.name}" but sits in directory "${dirName}"`,
    );
  }

  return {
    kind: spec.kind,
    name: spec.displayName || spec.name,
    extensionName: spec.name,
    description: spec.description,
    contentHash: computeContentHash(extensionDir),
  };
}

// --- Enrichment (called by consolidate.ts) ---

function entryFor(
  pending: PendingSandboxExtension,
  extension: DiscoveredExtension,
  metadata: SandboxExtensionMetadata,
): SandboxExtensionEntry {
  const source: SandboxExtensionEntry["source"] = {
    url: pending.source.url,
    path: extension.path,
  };
  if (pending.source.ref !== undefined) source.ref = pending.source.ref;

  return {
    sandboxExtensionId: `${pending.sandboxExtensionId}/${extension.path}`,
    kind: metadata.kind,
    name: metadata.name,
    extensionName: metadata.extensionName,
    description: metadata.description,
    source,
    contentHash: metadata.contentHash,
    approvals: pending.approvals.map((a) => ({ ...a })),
  };
}

/**
 * Expand every approved repository into its individual extensions, split by
 * kind. A repository that can't be cloned is skipped whole; a single extension
 * that fails its checks is skipped on its own, so one bad spec never costs a
 * repository its other extensions.
 */
export function enrichSandboxExtensions(pending: PendingSandboxExtension[]): {
  sandboxTools: SandboxExtensionEntry[];
  sandboxFeatures: SandboxExtensionEntry[];
} {
  const sandboxTools: SandboxExtensionEntry[] = [];
  const sandboxFeatures: SandboxExtensionEntry[] = [];
  if (pending.length === 0) return { sandboxTools, sandboxFeatures };

  console.log("Enriching sandbox extensions with source metadata...\n");

  const tmpDir = resolve(ROOT, ".tmp-sandbox-extensions");
  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true });
  mkdirSync(tmpDir, { recursive: true });

  try {
    for (const entry of pending) {
      let cloneDir: string;
      try {
        cloneDir = cloneSandboxRepo(entry.source.url, tmpDir, entry.source.ref);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`  WARNING: ${entry.sandboxExtensionId} — skipped`);
        console.warn(`    ${message}`);
        continue;
      }

      const { discovered, warnings } = discoverSandboxExtensions(cloneDir);
      for (const w of warnings) {
        console.warn(`  WARNING: ${entry.sandboxExtensionId} — ${w}`);
      }
      if (discovered.length === 0) {
        console.warn(
          `  WARNING: ${entry.sandboxExtensionId} — no sandbox extensions found under tools/ or features/`,
        );
        continue;
      }

      for (const extension of discovered) {
        try {
          const metadata = fetchSandboxExtensionMetadata(cloneDir, extension);
          const enriched = entryFor(entry, extension, metadata);
          (metadata.kind === "sandbox" ? sandboxTools : sandboxFeatures).push(
            enriched,
          );
          console.log(`  Enriched: ${enriched.sandboxExtensionId}`);
          console.log(`    Name: ${enriched.name}`);
          console.log(`    Hash: ${enriched.contentHash}`);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.warn(
            `  WARNING: ${entry.sandboxExtensionId} — ${extension.path} skipped`,
          );
          console.warn(`    ${message}`);
        }
      }
    }
  } finally {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true });
  }

  return { sandboxTools, sandboxFeatures };
}
