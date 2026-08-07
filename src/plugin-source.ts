import { execSync } from "node:child_process";
import { readFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  discoverSkillPaths,
  parseSkillFrontmatter,
  computeContentHash,
} from "./skill-source.js";
import type { PluginEntry } from "./consolidate.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// --- Types ---

export interface PluginManifestFields {
  name: string;
  description: string;
  version: string;
  author: string;
  homepage: string;
  keywords: string[];
}

export interface ContainedSkill {
  name: string;
  description: string;
  path: string;
}

export interface ContainedMcpServer {
  name: string;
  transport: string;
}

export interface PluginMetadata extends PluginManifestFields {
  containedSkills: ContainedSkill[];
  containedMcpServers: ContainedMcpServer[];
  contentHash: string;
}

// --- plugin.json parsing ---

export function parsePluginManifest(content: string): PluginManifestFields {
  const data = JSON.parse(content) as {
    name?: unknown;
    description?: unknown;
    version?: unknown;
    author?: unknown;
    homepage?: unknown;
    keywords?: unknown;
  };

  const name = typeof data.name === "string" ? data.name : "";
  const description =
    typeof data.description === "string" ? data.description : "";
  const version = typeof data.version === "string" ? data.version : "";
  const homepage = typeof data.homepage === "string" ? data.homepage : "";

  let author = "";
  if (data.author && typeof data.author === "object") {
    const authorName = (data.author as { name?: unknown }).name;
    author = typeof authorName === "string" ? authorName : "";
  }

  const keywords =
    Array.isArray(data.keywords) &&
    data.keywords.every((k) => typeof k === "string")
      ? (data.keywords as string[])
      : [];

  return { name, description, version, author, homepage, keywords };
}

// --- mcp.json parsing ---

export function parseMcpServers(content: string): ContainedMcpServer[] {
  const data = JSON.parse(content) as { mcpServers?: unknown };

  if (!data.mcpServers || typeof data.mcpServers !== "object") return [];

  return Object.entries(data.mcpServers as Record<string, unknown>).map(
    ([name, config]) => {
      const transport =
        config &&
        typeof config === "object" &&
        typeof (config as { type?: unknown }).type === "string"
          ? (config as { type: string }).type
          : "";
      return { name, transport };
    },
  );
}

// --- Plugin source fetching ---

function clonePluginRepo(
  sourceUrl: string,
  pluginPath: string | undefined,
  tmpDir: string,
): { repoRoot: string; pluginDir: string } {
  const repoHash = createHash("sha256")
    .update(sourceUrl)
    .digest("hex")
    .slice(0, 8);
  const cloneDir = join(tmpDir, `plugin-${repoHash}`);

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

  // Unlike a skill source (a single SKILL.md file at the target path), a
  // plugin needs its whole directory subtree (skills/**, mcp.json)
  // materialized — narrow the sparse-checkout cone to that subtree. For a
  // repo-root plugin, "sparse-checkout set ." is NOT equivalent to checking
  // out everything — in cone mode it only materializes root-level files, not
  // subdirectories — so disable sparse-checkout entirely instead to get the
  // full repo.
  try {
    if (pluginPath) {
      execSync(`git -C ${cloneDir} sparse-checkout set ${pluginPath}`, {
        stdio: "pipe",
      });
    } else {
      execSync(`git -C ${cloneDir} sparse-checkout disable`, {
        stdio: "pipe",
      });
    }
  } catch {
    throw new Error(
      `Failed to check out plugin contents ${pluginPath ? `at path "${pluginPath}" ` : ""}in ${sourceUrl}`,
    );
  }

  return {
    repoRoot: cloneDir,
    pluginDir: pluginPath ? resolve(cloneDir, pluginPath) : cloneDir,
  };
}

export function fetchPluginManifest(
  sourceUrl: string,
  sourcePath?: string,
  tmpDir?: string,
): PluginMetadata {
  const dir = tmpDir ?? join(ROOT, ".tmp-plugins");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const { repoRoot, pluginDir } = clonePluginRepo(sourceUrl, sourcePath, dir);
  const manifestPath = join(pluginDir, "plugin.json");

  if (!existsSync(manifestPath)) {
    const location = sourcePath
      ? `path "${sourcePath}" in ${sourceUrl}`
      : sourceUrl;
    throw new Error(`plugin.json not found at ${location}`);
  }

  const manifest = parsePluginManifest(readFileSync(manifestPath, "utf-8"));

  const skillsPrefix = sourcePath ? `${sourcePath}/skills` : "skills";
  const skillPaths = discoverSkillPaths(repoRoot, `${skillsPrefix}/*`);
  const containedSkills: ContainedSkill[] = skillPaths.map((path) => {
    const skillMdPath = join(repoRoot, path, "SKILL.md");
    const { name, description } = existsSync(skillMdPath)
      ? parseSkillFrontmatter(readFileSync(skillMdPath, "utf-8"))
      : { name: "", description: "" };
    return {
      name: name || path.split("/").pop()!,
      description,
      path: sourcePath ? path.slice(sourcePath.length + 1) : path,
    };
  });

  const mcpJsonPath = join(pluginDir, "mcp.json");
  const containedMcpServers = existsSync(mcpJsonPath)
    ? parseMcpServers(readFileSync(mcpJsonPath, "utf-8"))
    : [];

  const contentHash = computeContentHash(pluginDir);

  return { ...manifest, containedSkills, containedMcpServers, contentHash };
}

// --- Enrichment (called by consolidate.ts) ---

export function enrichPluginMetadata(plugins: PluginEntry[]): PluginEntry[] {
  if (plugins.length === 0) return plugins;

  console.log("Enriching plugins with source metadata...\n");

  const tmpDir = resolve(ROOT, ".tmp-plugins");
  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true });
  mkdirSync(tmpDir, { recursive: true });

  const enriched: PluginEntry[] = [];

  try {
    for (const entry of plugins) {
      try {
        const metadata = fetchPluginManifest(
          entry.source.url,
          entry.source.path,
          tmpDir,
        );
        entry.name = metadata.name || entry.pluginId;
        entry.description = metadata.description;
        entry.version = metadata.version || undefined;
        entry.author = metadata.author || undefined;
        entry.homepage = metadata.homepage || undefined;
        entry.keywords = metadata.keywords.length
          ? metadata.keywords
          : undefined;
        entry.contentHash = metadata.contentHash;
        entry.containedSkills = metadata.containedSkills;
        entry.containedMcpServers = metadata.containedMcpServers;
        console.log(`  Enriched: ${entry.pluginId}`);
        console.log(`    Name: ${entry.name}`);
        console.log(`    Hash: ${metadata.contentHash}`);
        enriched.push(entry);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`  WARNING: ${entry.pluginId} — skipped`);
        console.warn(`    ${message}`);
      }
    }
  } finally {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true });
  }

  return enriched;
}
