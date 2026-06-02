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

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// --- Types ---

export interface SkillMetadata {
  name: string;
  description: string;
  contentHash: string;
}

// SkillEntry is imported from consolidate.ts by callers; we only need a
// minimal shape here to avoid circular imports.
export interface SkillEntryLike {
  skillId: string;
  name: string;
  description: string;
  source: { url: string; path?: string };
  contentHash: string;
}

// --- Frontmatter parsing ---

export function parseSkillFrontmatter(content: string): {
  name: string;
  description: string;
} {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) {
    return { name: "", description: "" };
  }

  const frontmatter = match[1];

  const nameMatch = frontmatter.match(/^name:\s*(.+)$/m);
  const name = nameMatch ? nameMatch[1].trim() : "";

  // Handle both single-line and multi-line (>) description
  let description = "";
  const descLineIdx = frontmatter
    .split("\n")
    .findIndex((l) => /^description:\s*/.test(l));
  if (descLineIdx !== -1) {
    const descLine = frontmatter.split("\n")[descLineIdx];
    const inlineValue = descLine.replace(/^description:\s*/, "").trim();
    if (inlineValue === ">" || inlineValue === "|") {
      // Multi-line: collect indented continuation lines
      const lines = frontmatter.split("\n");
      const continued: string[] = [];
      for (let i = descLineIdx + 1; i < lines.length; i++) {
        if (/^\s+\S/.test(lines[i])) {
          continued.push(lines[i].trim());
        } else {
          break;
        }
      }
      description = continued.join(" ");
    } else {
      description = inlineValue;
    }
  }

  return { name, description };
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

// --- Enrichment (called by consolidate.ts) ---

export function enrichSkillMetadata<T extends SkillEntryLike>(
  skills: T[],
): T[] {
  if (skills.length === 0) return skills;

  console.log("Enriching skills with source metadata...\n");

  const tmpDir = resolve(ROOT, ".tmp-skills");
  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true });
  mkdirSync(tmpDir, { recursive: true });

  const enriched: T[] = [];

  try {
    for (const entry of skills) {
      try {
        const metadata = fetchSkillMetadata(
          entry.source.url,
          entry.source.path,
          tmpDir,
        );
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
