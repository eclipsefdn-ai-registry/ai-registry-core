import { execFileSync } from "node:child_process";
import {
  readFileSync,
  readdirSync,
  statSync,
  existsSync,
  mkdirSync,
  rmSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { resolve, join, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import {
  checkedOutCommit,
  cloneAtRef,
  resolveInsideRepo,
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

function cloneSkillFolder(
  sourceUrl: string,
  sourcePath: string | undefined,
  tmpDir: string,
  ref?: string,
): { dir: string; commit: string } {
  const cloneDir = join(tmpDir, `skill-${skillCloneKey(sourceUrl, ref)}`);

  let commit: string;
  if (!existsSync(cloneDir)) {
    commit = cloneAtRef(sourceUrl, cloneDir, ref);

    if (sourcePath) {
      // sourcePath is a real repository path, but still vendor-supplied —
      // pass it as its own argv entry (execFileSync, no shell) rather than
      // interpolating into a shell string, so a path like "a; rm -rf /"
      // can't execute anything. Mirrors plugin-source.ts's clonePluginRepo.
      try {
        execFileSync(
          "git",
          ["-C", cloneDir, "sparse-checkout", "set", sourcePath],
          { stdio: "pipe" },
        );
      } catch {
        throw new Error(
          `Failed to sparse-checkout path "${sourcePath}" in ${sourceUrl}`,
        );
      }
    }
  } else {
    // Every path read from this clone reports the commit it was cloned at.
    // That's correct, not a shortcut: those paths were hashed at that commit.
    commit = checkedOutCommit(cloneDir);
    if (sourcePath) {
      // Repo already cloned — add this path to sparse checkout
      try {
        execFileSync(
          "git",
          ["-C", cloneDir, "sparse-checkout", "add", sourcePath],
          { stdio: "pipe" },
        );
      } catch {
        throw new Error(
          `Failed to sparse-checkout path "${sourcePath}" in ${sourceUrl}`,
        );
      }
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

function getCloneDir(sourceUrl: string, tmpDir: string, ref?: string): string {
  return join(tmpDir, `skill-${skillCloneKey(sourceUrl, ref)}`);
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

  // Clone repo (without sparse-checkout) for glob discovery, at the
  // requested ref — so a glob expands against the folders that exist there,
  // not against whatever the default branch happens to have.
  const cloneDir = getCloneDir(sourceUrl, tmpDir, ref);
  cloneSkillFolder(sourceUrl, undefined, tmpDir, ref);

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

// --- Enrichment (called by consolidate.ts) ---

export function enrichSkillMetadata(skills: SkillEntry[]): SkillEntry[] {
  if (skills.length === 0) return skills;

  console.log("Enriching skills with source metadata...\n");

  const tmpDir = resolve(ROOT, ".tmp-skills");
  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true });
  mkdirSync(tmpDir, { recursive: true });

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
