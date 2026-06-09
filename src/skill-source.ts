import { execSync } from "node:child_process";
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
import type { SkillEntry } from "./consolidate.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// --- Types ---

export interface SkillMetadata {
  name: string;
  description: string;
  contentHash: string;
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

function cloneSkillFolder(
  sourceUrl: string,
  sourcePath: string | undefined,
  tmpDir: string,
): string {
  const repoHash = createHash("sha256")
    .update(sourceUrl)
    .digest("hex")
    .slice(0, 8);
  const cloneDir = join(tmpDir, `skill-${repoHash}`);

  if (!existsSync(cloneDir)) {
    // Sparse checkout: clone only repo metadata, then fetch specific path
    const token = process.env.GH_TOKEN;
    const repoUrl = token
      ? sourceUrl.replace("https://", `https://x-access-token:${token}@`)
      : sourceUrl;

    try {
      execSync(
        `git clone --depth 1 --filter=blob:none --sparse ${repoUrl} ${cloneDir}`,
        { stdio: "pipe" },
      );
    } catch {
      throw new Error(`Failed to clone ${sourceUrl}`);
    }

    if (sourcePath) {
      try {
        execSync(`git -C ${cloneDir} sparse-checkout set ${sourcePath}`, {
          stdio: "pipe",
        });
      } catch {
        throw new Error(
          `Failed to sparse-checkout path "${sourcePath}" in ${sourceUrl}`,
        );
      }
    }
  } else if (sourcePath) {
    // Repo already cloned — add this path to sparse checkout
    try {
      execSync(`git -C ${cloneDir} sparse-checkout add ${sourcePath}`, {
        stdio: "pipe",
      });
    } catch {
      throw new Error(
        `Failed to sparse-checkout path "${sourcePath}" in ${sourceUrl}`,
      );
    }
  }

  return sourcePath ? resolve(cloneDir, sourcePath) : cloneDir;
}

export function fetchSkillMetadata(
  sourceUrl: string,
  sourcePath?: string,
  tmpDir?: string,
): SkillMetadata {
  const dir = tmpDir ?? join(ROOT, ".tmp-skills");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const skillDir = cloneSkillFolder(sourceUrl, sourcePath, dir);
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
  };
}

// --- Multi-path expansion ---

const MAX_DISCOVERY = 100;

export function isGlobPattern(path: string): boolean {
  return path === "*" || path.endsWith("/*");
}

function getCloneDir(sourceUrl: string, tmpDir: string): string {
  const repoHash = createHash("sha256")
    .update(sourceUrl)
    .digest("hex")
    .slice(0, 8);
  return join(tmpDir, `skill-${repoHash}`);
}

export function discoverSkillPaths(
  cloneDir: string,
  pattern: string,
): string[] {
  const prefix = pattern === "*" ? "" : pattern.replace(/\/?\*$/, "");
  const treePath = prefix || ".";

  let lsOutput: string;
  try {
    lsOutput = execSync(
      `git -C ${cloneDir} ls-tree --name-only HEAD ${treePath}/`,
      { stdio: "pipe", encoding: "utf-8" },
    ).trim();
  } catch {
    return [];
  }

  if (!lsOutput) return [];

  const children = lsOutput.split("\n").filter(Boolean);
  const skillPaths: string[] = [];

  for (const childPath of children) {
    if (childPath.split("/").pop()!.startsWith(".")) continue;
    try {
      const result = execSync(
        `git -C ${cloneDir} ls-tree HEAD "${childPath}/SKILL.md"`,
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
  return {
    skillId: `${template.skillId}/${pathSuffix}`,
    name: "",
    description: "",
    source: { url: template.source.url, path },
    contentHash: "",
    approvals: template.approvals.map((a) => ({ ...a })),
  };
}

function expandSkillEntry(entry: SkillEntry, tmpDir: string): SkillEntry[] {
  const { source, skillId } = entry;

  // No path or single non-glob string — no expansion
  if (source.path === undefined) return [entry];

  if (typeof source.path === "string") {
    if (!isGlobPattern(source.path)) return [entry];

    // Glob: clone and discover
    const cloneDir = getCloneDir(source.url, tmpDir);
    // Ensure the repo is cloned (cloneSkillFolder handles caching)
    cloneSkillFolder(source.url, undefined, tmpDir);
    const paths = discoverSkillPaths(cloneDir, source.path);
    if (paths.length === 0) {
      console.warn(
        `  WARNING: ${skillId} — glob "${source.path}" matched no skill folders`,
      );
      return [];
    }
    return paths.map((p) => expandedEntry(entry, p));
  }

  // Array of paths — expand each, deduplicate
  if (Array.isArray(source.path)) {
    const uniquePaths = [...new Set(source.path)];
    if (uniquePaths.length !== source.path.length) {
      console.warn(`  WARNING: ${skillId} — duplicate paths removed`);
    }
    return uniquePaths.map((p) => expandedEntry(entry, p));
  }

  return [entry];
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
        const metadata = fetchSkillMetadata(entry.source.url, path, tmpDir);
        entry.name = metadata.name;
        entry.description = metadata.description;
        entry.contentHash = metadata.contentHash;
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
