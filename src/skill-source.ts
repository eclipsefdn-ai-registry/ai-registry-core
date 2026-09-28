import { execFileSync } from "node:child_process";
import {
  readFileSync,
  readdirSync,
  statSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { resolve, join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import {
  checkedOutCommit,
  cloneAtRef,
  needsDefaultBranchFetch,
  resolveInsideRepo,
  type RemoteBranchesLookup,
} from "./git-source.js";
import type { SkillEntry } from "./consolidate.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// --- Types ---

export interface SkillMetadata {
  name: string;
  description: string;
  contentHash: string;
  commit: string;
}

// --- Frontmatter parsing ---

export function parseSkillFrontmatter(content: string): {
  name: string;
  description: string;
} {
  try {
    const { data } = matter(content);
    const name = typeof data.name === "string" ? data.name : "";
    const description =
      typeof data.description === "string" ? data.description : "";
    return { name, description };
  } catch {
    return { name: "", description: "" };
  }
}

// --- Content hashing ---

function collectFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith(".")) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      results.push(...collectFiles(full));
    } else {
      results.push(full);
    }
  }
  return results;
}

export function computeContentHash(skillDir: string): string {
  const hash = createHash("sha256");
  const files = collectFiles(skillDir).sort();

  for (const filePath of files) {
    const relPath = relative(skillDir, filePath);
    hash.update(relPath);
    hash.update(readFileSync(filePath));
  }

  return hash.digest("hex").slice(0, 12);
}

// --- Skill source fetching ---

// Keyed on url + ref, not url + path like plugins: every skill approval
// pointing at the same repo shares one clone directory, with successive
// approvals' paths added to its sparse-checkout cone one at a time (the
// `sparse-checkout add` branch below) rather than each approval getting its
// own independent checkout the way clonePluginRepo does. Keying on path too
// would break that sharing — a repo with many skill paths would get a
// separate clone per path instead of one clone with a wide cone. Ref still
// needs to be part of the key, though: two approvals of the same repo at
// different refs must not land in the same directory.
export function skillCloneKey(sourceUrl: string, ref?: string): string {
  return createHash("sha256")
    .update(`${sourceUrl}|${ref ?? ""}`)
    .digest("hex")
    .slice(0, 8);
}

/**
 * The clone every skill approval of `sourceUrl` at `ref` shares, made on
 * first use. A fresh clone has only the repository's top-level files checked
 * out; glob discovery reads the tree without widening that, and
 * cloneSkillFolder widens it to each path it reads.
 */
function sharedSkillClone(
  sourceUrl: string,
  tmpDir: string,
  ref?: string,
): { cloneDir: string; commit: string } {
  const cloneDir = join(tmpDir, `skill-${skillCloneKey(sourceUrl, ref)}`);
  if (existsSync(cloneDir)) {
    // Every path read from this clone reports the commit it was cloned at.
    // That's correct, not a shortcut: those paths were hashed at that commit.
    return { cloneDir, commit: checkedOutCommit(cloneDir) };
  }
  return { cloneDir, commit: cloneAtRef(sourceUrl, cloneDir, ref) };
}

function isSparseCheckout(cloneDir: string): boolean {
  try {
    return (
      execFileSync(
        "git",
        ["-C", cloneDir, "config", "--bool", "core.sparseCheckout"],
        { stdio: "pipe", encoding: "utf-8" },
      ).trim() === "true"
    );
  } catch {
    // Unset, which git reports by exiting non-zero.
    return false;
  }
}

function cloneSkillFolder(
  sourceUrl: string,
  sourcePath: string | undefined,
  tmpDir: string,
  ref?: string,
): { dir: string; commit: string } {
  const { cloneDir, commit } = sharedSkillClone(sourceUrl, tmpDir, ref);

  // A skill at a path is added to the sparse-checkout cone, next to whatever
  // earlier approvals of this clone added — "add" rather than "set", which
  // would drop theirs, and which is no different on a fresh --sparse clone.
  //
  // A skill at the repository root is the whole tree, and in cone mode no
  // sparse-checkout path gets that ("set ." materializes only root-level
  // files), so sparse checkout is disabled instead, as clonePluginRepo does
  // for a root plugin. Otherwise its contentHash would cover only top-level
  // files and never match a client hashing the full tree at source.commit.
  // Once disabled, every path is already checked out and "add" refuses to run
  // ("no sparse-checkout to add to"), so a later path needs no step at all.
  //
  // sourcePath is a real repository path, but still vendor-supplied — pass it
  // as its own argv entry (execFileSync, no shell) rather than interpolating
  // into a shell string, so a path like "a; rm -rf /" can't execute anything.
  let sparseArgs: string[] | undefined;
  if (!sourcePath) sparseArgs = ["disable"];
  else if (isSparseCheckout(cloneDir)) sparseArgs = ["add", sourcePath];
  if (sparseArgs) {
    try {
      execFileSync("git", ["-C", cloneDir, "sparse-checkout", ...sparseArgs], {
        stdio: "pipe",
      });
    } catch {
      throw new Error(
        `Failed to check out skill contents ${sourcePath ? `at path "${sourcePath}" ` : ""}in ${sourceUrl}`,
      );
    }
  }

  const dir = sourcePath
    ? resolveInsideRepo(cloneDir, sourcePath, "Skill path")
    : cloneDir;
  return { dir, commit };
}

export function fetchSkillMetadata(
  sourceUrl: string,
  sourcePath?: string,
  tmpDir?: string,
  ref?: string,
): SkillMetadata {
  const dir = tmpDir ?? join(ROOT, ".tmp-skills");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const { dir: skillDir, commit } = cloneSkillFolder(
    sourceUrl,
    sourcePath,
    dir,
    ref,
  );
  const skillMdPath = join(skillDir, "SKILL.md");

  if (!existsSync(skillMdPath)) {
    const location = sourcePath
      ? `path "${sourcePath}" in ${sourceUrl}`
      : sourceUrl;
    throw new Error(`SKILL.md not found at ${location}`);
  }

  const content = readFileSync(skillMdPath, "utf-8");
  const { name, description } = parseSkillFrontmatter(content);
  const contentHash = computeContentHash(skillDir);

  return {
    name: name || sourcePath?.split("/").pop() || "",
    description,
    contentHash,
    commit,
  };
}

// --- Multi-path expansion ---

const MAX_DISCOVERY = 100;

export function isGlobPattern(path: string): boolean {
  return path === "*" || path.endsWith("/*");
}

export function discoverSkillPaths(
  cloneDir: string,
  pattern: string,
): string[] {
  const prefix = pattern === "*" ? "" : pattern.replace(/\/?\*$/, "");
  const treePath = prefix || ".";

  let lsOutput: string;
  try {
    lsOutput = execFileSync(
      "git",
      ["-C", cloneDir, "ls-tree", "--name-only", "HEAD", `${treePath}/`],
      { stdio: "pipe", encoding: "utf-8" },
    ).trim();
  } catch {
    return [];
  }

  if (!lsOutput) return [];

  const children = lsOutput.split("\n").filter(Boolean);
  const skillPaths: string[] = [];

  // childPath is a real file/directory name read out of the cloned repo, not
  // vendor-approval-file content the schema can constrain — pass it as its
  // own argv entry (execFileSync, no shell) so a maliciously-named folder in
  // the source repo can't get command-substituted before git even runs.
  for (const childPath of children) {
    if (childPath.split("/").pop()!.startsWith(".")) continue;
    try {
      const result = execFileSync(
        "git",
        ["-C", cloneDir, "ls-tree", "HEAD", `${childPath}/SKILL.md`],
        { stdio: "pipe", encoding: "utf-8" },
      ).trim();
      if (result) {
        skillPaths.push(childPath);
      }
    } catch {
      // No SKILL.md in this child — skip
    }
  }

  const sorted = skillPaths.sort();

  if (sorted.length > MAX_DISCOVERY) {
    console.warn(
      `  WARNING: glob "${pattern}" matched ${sorted.length} paths (>${MAX_DISCOVERY}). All included, but consider a narrower pattern.`,
    );
  }

  return sorted;
}

function expandedEntry(template: SkillEntry, path: string): SkillEntry {
  const pathSuffix = path.split("/").pop()!;
  const source: SkillEntry["source"] = { url: template.source.url, path };
  if (template.source.ref !== undefined) source.ref = template.source.ref;
  return {
    skillId: `${template.skillId}/${pathSuffix}`,
    name: "",
    description: "",
    source,
    contentHash: "",
    approvals: template.approvals.map((a) => ({ ...a })),
  };
}

/**
 * Resolve skill paths, expanding any glob patterns to concrete paths.
 * Non-glob paths are returned as-is. Glob patterns are expanded by cloning
 * the repo and discovering child folders that contain SKILL.md.
 */
export function resolveSkillPaths(
  sourceUrl: string,
  path: string | string[],
  tmpDir: string,
  ref?: string,
): { resolved: string[]; warnings: string[] } {
  const rawPaths = typeof path === "string" ? [path] : path;
  const warnings: string[] = [];

  // No globs — return paths as-is
  if (!rawPaths.some(isGlobPattern)) {
    return { resolved: [...rawPaths], warnings };
  }

  // Clone repo for glob discovery, at the requested ref — so a glob expands
  // against the folders that exist there, not against whatever the default
  // branch happens to have. Discovery reads the tree with ls-tree, so the
  // checkout stays as narrow as the clone left it.
  const { cloneDir } = sharedSkillClone(sourceUrl, tmpDir, ref);

  const allPaths: string[] = [];
  for (const p of rawPaths) {
    if (isGlobPattern(p)) {
      const discovered = discoverSkillPaths(cloneDir, p);
      if (discovered.length === 0) {
        warnings.push(`glob "${p}" matched no skill folders`);
      }
      allPaths.push(...discovered);
    } else {
      allPaths.push(p);
    }
  }

  const uniquePaths = [...new Set(allPaths)];
  if (uniquePaths.length !== allPaths.length) {
    warnings.push("duplicate paths removed");
  }

  return { resolved: uniquePaths, warnings };
}

export function expandSkillEntry(
  entry: SkillEntry,
  tmpDir: string,
): SkillEntry[] {
  const { source, skillId } = entry;

  // No path or single non-glob string — no expansion
  if (source.path === undefined) return [entry];
  if (typeof source.path === "string" && !isGlobPattern(source.path)) {
    return [entry];
  }

  const { resolved, warnings } = resolveSkillPaths(
    source.url,
    source.path,
    tmpDir,
    source.ref,
  );
  for (const w of warnings) {
    console.warn(`  WARNING: ${skillId} — ${w}`);
  }
  if (resolved.length === 0) return [];
  return resolved.map((p) => expandedEntry(entry, p));
}

// --- Latest (what the default branch ships now) ---

/**
 * Sets latestCommit and latestHash on an entry that has just been resolved.
 *
 * The resolved values are reused unless the entry is pinned and the default
 * branch has moved (see needsDefaultBranchFetch). Only then is the same path
 * fetched again with no ref, so the hash is computed by exactly the code that
 * computed contentHash, and the two can be compared. That second fetch reuses
 * the clone skills tracking the default branch of the same repository
 * already share.
 *
 * A failure costs the entry only these two fields, never the entry itself:
 * what it resolved to is still what was approved.
 */
function recordLatest(
  entry: SkillEntry,
  path: string | undefined,
  resolved: SkillMetadata,
  tmpDir: string,
  remote: RemoteBranchesLookup,
): void {
  try {
    const latest = needsDefaultBranchFetch(
      entry.source.ref,
      resolved.commit,
      () => remote(entry.source.url),
    )
      ? fetchSkillMetadata(entry.source.url, path, tmpDir)
      : resolved;
    entry.latestCommit = latest.commit;
    entry.latestHash = latest.contentHash;
    if (latest.contentHash !== resolved.contentHash) {
      console.log(`    Latest hash: ${latest.contentHash} (default branch)`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(
      `  WARNING: ${entry.skillId} — could not tell what the default branch ships now, published without latestCommit/latestHash`,
    );
    console.warn(`    ${message}`);
  }
}

// --- Enrichment (called by consolidate.ts) ---

/**
 * `remote`, when given, also sets latestCommit and latestHash on every entry
 * (see recordLatest). Without it they are left unset.
 */
export function enrichSkillMetadata(
  skills: SkillEntry[],
  remote?: RemoteBranchesLookup,
): SkillEntry[] {
  if (skills.length === 0) return skills;

  console.log("Enriching skills with source metadata...\n");

  // A unique directory per call, for the reason enrichSandboxExtensions
  // gives: two overlapping runs sharing one fixed path would each delete the
  // clones the other is reading.
  const tmpDir = mkdtempSync(resolve(ROOT, ".tmp-skills-"));

  const enriched: SkillEntry[] = [];

  try {
    // Phase 1: Expand multi-path and glob entries
    const expanded: SkillEntry[] = [];
    for (const entry of skills) {
      try {
        expanded.push(...expandSkillEntry(entry, tmpDir));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`  WARNING: ${entry.skillId} — expansion failed, skipped`);
        console.warn(`    ${message}`);
      }
    }

    // Phase 2: Enrich each expanded entry
    for (const entry of expanded) {
      try {
        const path =
          typeof entry.source.path === "string" ? entry.source.path : undefined;
        const metadata = fetchSkillMetadata(
          entry.source.url,
          path,
          tmpDir,
          entry.source.ref,
        );
        entry.name = metadata.name;
        entry.description = metadata.description;
        entry.contentHash = metadata.contentHash;
        entry.source = { ...entry.source, commit: metadata.commit };
        console.log(`  Enriched: ${entry.skillId}`);
        console.log(`    Name: ${metadata.name}`);
        console.log(`    Hash: ${metadata.contentHash}`);
        if (remote) recordLatest(entry, path, metadata, tmpDir, remote);
        enriched.push(entry);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`  WARNING: ${entry.skillId} — skipped`);
        console.warn(`    ${message}`);
      }
    }
  } finally {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true });
  }

  return enriched;
}
