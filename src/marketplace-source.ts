import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { authenticatedRepoUrl } from "./git-source.js";

// --- Types ---

export interface CodexMarketplaceEntry {
  name: string;
  source: unknown;
}

export interface ResolvedPluginSource {
  url: string;
  path?: string;
  ref?: string;
  // "local" paths are authored directly within the marketplace-hosting
  // repo (e.g. a monorepo's own plugins/<name> folder) and are reliably
  // descriptive of the plugin. "git-subdir" paths point into an
  // *external* repo's internal folder structure, which is often a
  // generic implementation detail (e.g. "plugin", "src") rather than a
  // meaningful name — so only descriptive paths are used for ID
  // derivation; everything else falls back to the resolved repo's own
  // name instead.
  pathIsDescriptive?: boolean;
}

// --- Codex format parsing ---

export function parseCodexMarketplace(
  content: string,
): CodexMarketplaceEntry[] {
  const data = JSON.parse(content) as { plugins?: unknown };
  if (!Array.isArray(data.plugins)) return [];

  return data.plugins
    .filter(
      (p): p is { name: unknown; source: unknown } =>
        typeof p === "object" && p !== null,
    )
    .filter((p) => typeof p.name === "string")
    .map((p) => ({ name: p.name as string, source: p.source }));
}

// --- GitHub shorthand normalization ---

// A bare "owner/repo" (no scheme, exactly one slash, valid GitHub identifier
// characters on each side) is shorthand for a GitHub URL — expand it so
// downstream git clone and ID derivation both get a real, clonable URL.
// Anything else (already a full URL, or not shaped like owner/repo at all)
// is returned unchanged; deriveRepoNamespace's own validation is what
// ultimately rejects genuinely malformed input.
export function normalizeGithubShorthand(url: string): string {
  if (/^[\w.-]+\/[\w.-]+$/.test(url)) {
    return `https://github.com/${url}.git`;
  }
  return url;
}

// --- ID derivation ---

// Same pattern as plugin-approval.schema.json's pluginId, so a derived ID is
// held to the rule a hand-authored one is.
const PLUGIN_ID_RE =
  /^(?!.*\.\.)[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*$/;

// Splits an https git URL into the reverse-domain namespace a plugin ID
// starts with and the repository's own name. GitHub keeps its established
// io.github.<owner> form; every other host reverses its domain and appends
// the top-level group, the convention direct approvals already use
// (gitlab.com/gitlab-org/ai/gitlab-duo-plugins -> com.gitlab.gitlab-org).
// Nested groups between the top level and the repository don't enter the ID.
export function deriveRepoNamespace(url: string): {
  namespace: string;
  repo: string;
} {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    throw new Error(`Cannot derive a plugin namespace from URL "${url}"`);
  }
  const segments = parsed.pathname
    .replace(/\.git\/?$/, "")
    .split("/")
    .filter((s) => s.length > 0);
  if (
    (parsed.protocol !== "https:" && parsed.protocol !== "http:") ||
    segments.length < 2
  ) {
    throw new Error(`Cannot derive a plugin namespace from URL "${url}"`);
  }

  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  const owner = segments[0].toLowerCase();
  const repo = segments[segments.length - 1];
  const hostPrefix =
    host === "github.com" ? "io.github" : host.split(".").reverse().join(".");
  return { namespace: `${hostPrefix}.${owner}`, repo };
}

// Known limitation: two git-subdir entries pointing at different
// subdirectories of the *same* external repo (both non-descriptive paths)
// derive the identical repo-based ID here, and the second is then dropped
// as an apparent duplicate by expandMarketplaceApprovals' dedup guard. Not
// exercised by any currently-known real marketplace (each lists at most one
// git-subdir entry per external repo) — accepted as a scope limit rather
// than adding a disambiguation scheme for a case with no real data yet.
// The same holds across repositories: nested groups don't enter the ID
// (see deriveRepoNamespace), so gitlab.com/org/a/plugins and
// gitlab.com/org/b/plugins derive the same ID too, as direct approvals of
// them already would.
export function derivePluginIdFromSource(
  resolved: ResolvedPluginSource,
): string {
  const { namespace, repo } = deriveRepoNamespace(resolved.url);
  const name =
    resolved.path && resolved.pathIsDescriptive
      ? resolved.path.split("/").pop()!
      : repo;
  const pluginId = `${namespace}/${name}`;
  if (!PLUGIN_ID_RE.test(pluginId)) {
    throw new Error(
      `Derived plugin ID "${pluginId}" from URL "${resolved.url}" is not a valid pluginId`,
    );
  }
  return pluginId;
}

// --- Codex source resolution ---

interface StructuredCodexSource {
  source?: unknown;
  url?: unknown;
  path?: unknown;
  ref?: unknown;
  sha?: unknown;
}

function isStructuredSource(value: unknown): value is StructuredCodexSource {
  return typeof value === "object" && value !== null;
}

// Same pattern as plugin-approval.schema.json's source.path — copied
// verbatim rather than loaded from the schema file, since this module has
// no other dependency on schema JSON and a resolved marketplace path must
// be just as safe as a hand-authored one before it ever reaches
// clonePluginRepo's sparse-checkout call.
const SAFE_PATH_RE =
  /^(?!\.\.?(?:\/|$))[A-Za-z0-9._-]+(?:\/(?!\.\.?(?:\/|$))[A-Za-z0-9._-]+)*$/;

function isSafePath(path: string): boolean {
  return SAFE_PATH_RE.test(path);
}

// Resolves the ref/sha portion of a structured source. Returns `undefined`
// to mean "unsupported" — a sha-only pin, which git clone --branch cannot
// check out (it only accepts a tag or branch name, not an arbitrary commit
// sha). An entry with a real `ref` uses it regardless of whether `sha` is
// also present (ref is what --branch can act on); an entry with neither is
// valid and means "track the default branch", per this registry's own
// plugin schema — it must NOT be treated as unsupported.
function resolveEntryRef(
  source: StructuredCodexSource,
): { ref?: string } | undefined {
  if (typeof source.ref === "string") return { ref: source.ref };
  if (typeof source.sha === "string") return undefined;
  return {};
}

export function resolveCodexEntry(
  marketplaceRepoUrl: string,
  entry: CodexMarketplaceEntry,
): ResolvedPluginSource | undefined {
  const { source } = entry;

  // Bare string ("./plugins/x") is shorthand for a local path.
  if (typeof source === "string") {
    const path = source.replace(/^\.\//, "");
    if (!isSafePath(path)) return undefined;
    return {
      url: marketplaceRepoUrl,
      path,
      pathIsDescriptive: true,
    };
  }

  if (!isStructuredSource(source)) return undefined;

  const kind = source.source;

  if (kind === "local" && typeof source.path === "string") {
    const path = source.path.replace(/^\.\//, "");
    if (!isSafePath(path)) return undefined;
    return {
      url: marketplaceRepoUrl,
      path,
      pathIsDescriptive: true,
    };
  }

  if (kind === "url" && typeof source.url === "string") {
    const refResult = resolveEntryRef(source);
    if (!refResult) return undefined;

    const resolved: ResolvedPluginSource = {
      url: normalizeGithubShorthand(source.url),
      ...refResult,
    };
    // The "url" source kind optionally carries a subdirectory path too
    // (upstream Codex's RawMarketplaceManifestPluginSourceObject::Url has
    // an optional path field) — without it, an entry like
    // {"source":"url","url":"...","path":"plugin"} silently resolved to
    // the repo root instead of the intended subdirectory.
    if (typeof source.path === "string") {
      const path = source.path.replace(/^\.\//, "");
      if (!isSafePath(path)) return undefined;
      resolved.path = path;
    }
    return resolved;
  }

  if (
    kind === "git-subdir" &&
    typeof source.url === "string" &&
    typeof source.path === "string"
  ) {
    const refResult = resolveEntryRef(source);
    if (!refResult) return undefined;

    const path = source.path.replace(/^\.\//, "");
    if (!isSafePath(path)) return undefined;
    return {
      url: normalizeGithubShorthand(source.url),
      path,
      ...refResult,
    };
  }

  // "npm" and anything else unrecognized: unsupported.
  return undefined;
}

// --- Format registry ---

interface MarketplaceFormat {
  defaultPath: string;
  parse: (content: string) => CodexMarketplaceEntry[];
  resolve: (
    marketplaceRepoUrl: string,
    entry: CodexMarketplaceEntry,
  ) => ResolvedPluginSource | undefined;
}

const marketplaceFormats: Record<string, MarketplaceFormat> = {
  codex: {
    defaultPath: ".agents/plugins/marketplace.json",
    parse: parseCodexMarketplace,
    resolve: resolveCodexEntry,
  },
};

// --- Fetching (network: clones the marketplace-hosting repo) ---

function marketplaceCloneKey(sourceUrl: string): string {
  return createHash("sha256").update(sourceUrl).digest("hex").slice(0, 8);
}

function cloneMarketplaceRepo(sourceUrl: string, tmpDir: string): string {
  const cloneDir = join(
    tmpDir,
    `marketplace-${marketplaceCloneKey(sourceUrl)}`,
  );

  if (!existsSync(cloneDir)) {
    const repoUrl = authenticatedRepoUrl(sourceUrl);

    try {
      execFileSync(
        "git",
        [
          "clone",
          "--depth",
          "1",
          "--filter=blob:none",
          "--sparse",
          repoUrl,
          cloneDir,
        ],
        { stdio: "pipe" },
      );
    } catch {
      throw new Error(`Failed to clone ${sourceUrl}`);
    }
  }

  return cloneDir;
}

export function fetchMarketplaceEntries(
  sourceUrl: string,
  format: string,
  sourcePath: string | undefined,
  tmpDir: string,
): {
  entries: { name: string; resolved: ResolvedPluginSource }[];
  warnings: string[];
} {
  const fmt = marketplaceFormats[format];
  if (!fmt) {
    throw new Error(`Unknown marketplace format "${format}"`);
  }

  const effectivePath = sourcePath ?? fmt.defaultPath;
  const cloneDir = cloneMarketplaceRepo(sourceUrl, tmpDir);

  // Add the marketplace file to sparse-checkout. --skip-checks is needed because
  // cone-mode sparse-checkout rejects a file (non-directory) pathspec without it.
  try {
    execFileSync(
      "git",
      [
        "-C",
        cloneDir,
        "sparse-checkout",
        "add",
        "--skip-checks",
        effectivePath,
      ],
      { stdio: "pipe" },
    );
  } catch {
    throw new Error(
      `Failed to check out marketplace file "${effectivePath}" in ${sourceUrl}`,
    );
  }

  const filePath = join(cloneDir, effectivePath);
  if (!existsSync(filePath)) {
    throw new Error(
      `Marketplace file not found at "${effectivePath}" in ${sourceUrl}`,
    );
  }

  const rawEntries = fmt.parse(readFileSync(filePath, "utf-8"));

  const entries: { name: string; resolved: ResolvedPluginSource }[] = [];
  const warnings: string[] = [];
  for (const raw of rawEntries) {
    const resolved = fmt.resolve(sourceUrl, raw);
    if (!resolved) {
      warnings.push(
        `entry "${raw.name}" has an unsupported source type — skipped`,
      );
      continue;
    }
    entries.push({ name: raw.name, resolved });
  }

  return { entries, warnings };
}
