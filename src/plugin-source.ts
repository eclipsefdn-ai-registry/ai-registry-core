import { execFileSync } from "node:child_process";
import {
  readFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { resolve, join, dirname, posix } from "node:path";
import { fileURLToPath } from "node:url";
import {
  discoverSkillPaths,
  parseSkillFrontmatter,
  computeContentHash,
} from "./skill-source.js";
import {
  resolveInsideRepo,
  cloneAtRef,
  checkedOutCommit,
  recordLatest,
  sourcePinned,
  type RemoteBranchesLookup,
} from "./git-source.js";
import { agentPluginIssues } from "./agent-plugin-conformance.js";
import type { PluginEntry } from "./consolidate.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// --- Types ---

export interface PluginManifestFields {
  name: string;
  description: string;
  version: string | undefined;
  author: string | undefined;
  homepage: string | undefined;
  keywords: string[] | undefined;
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

/**
 * A marketplace file in the Plugin's repository at the approved commit: its
 * own `name`, and the name of the entry that points at this Plugin, if one
 * does. Both are absent when the file can't be parsed.
 */
export interface RepositoryMarketplaceFile {
  path: string;
  marketplaceName?: string;
  entryName?: string;
}

export interface PluginMetadata extends PluginManifestFields {
  containedSkills: ContainedSkill[];
  containedMcpServers: ContainedMcpServer[];
  contentHash: string;
  commit: string;
  // Whether the Plugin is an Agent Plugin (agent-plugins.org), and if not,
  // why: one readable message per failed check, empty when it is one.
  isAgentPlugin: boolean;
  agentPluginIssues: string[];
  // Only when fetchPluginManifest was asked to read them: one record per
  // known marketplace file present at `commit`, and one warning per file that
  // couldn't be parsed.
  marketplaceFiles?: RepositoryMarketplaceFile[];
  marketplaceFileWarnings?: string[];
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

  // name/description are always required downstream (PluginEntry falls back
  // to pluginId when name is blank), so they stay "" when absent. The rest
  // are genuinely optional metadata — undefined when absent, not "", so
  // there's exactly one way to represent "not in the manifest" rather than
  // two ("" here, undefined on PluginEntry) that a caller has to reconcile.
  const name = typeof data.name === "string" ? data.name : "";
  const description =
    typeof data.description === "string" ? data.description : "";
  const version = typeof data.version === "string" ? data.version : undefined;
  const homepage =
    typeof data.homepage === "string" ? data.homepage : undefined;

  let author: string | undefined;
  if (data.author && typeof data.author === "object") {
    const authorName = (data.author as { name?: unknown }).name;
    author = typeof authorName === "string" ? authorName : undefined;
  }

  const keywords =
    Array.isArray(data.keywords) &&
    data.keywords.every((k) => typeof k === "string")
      ? (data.keywords as string[])
      : undefined;

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

// A trailing separator would otherwise shift every downstream computation
// that assumes `${sourcePath}/${child}` — most notably the containedSkills
// path stripping below, which would drop one character short (publishing
// "kills/alpha" instead of "skills/alpha"). Normalizing once here, before
// sourcePath is used anywhere, means every use site stays correct without
// having to reason about trailing slashes individually.
export function normalizePluginPath(
  path: string | undefined,
): string | undefined {
  return path?.replace(/\/+$/, "");
}

// Strips a prefix by segment count rather than string length. git's pathspec
// matching (ls-tree) effectively canonicalizes the path it's given — a raw,
// uncanonicalized prefix (e.g. containing a stray double slash) is longer or
// shorter than the canonical form actually present in the paths it returns,
// so a length-based slice cuts off the wrong number of characters. Counting
// segments (ignoring empty ones from a stray "//") is robust to that.
export function stripPathPrefix(fullPath: string, prefix: string): string {
  const prefixSegments = prefix.split("/").filter(Boolean).length;
  return fullPath.split("/").slice(prefixSegments).join("/");
}

// --- Marketplace files ---

/**
 * Every path a tool reads a marketplace file from, in no tool's order. Which
 * tool reads which, and which it reads first, is the website's business, so
 * a tool changing its rules costs a website change: this is the union, and a
 * tool reading a new location costs one more path here.
 */
export const KNOWN_MARKETPLACE_FILE_PATHS = [
  ".agents/plugins/marketplace.json",
  ".agents/plugins/api_marketplace.json",
  ".claude-plugin/marketplace.json",
  ".cursor-plugin/marketplace.json",
  "marketplace.json",
  ".plugin/marketplace.json",
  ".github/plugin/marketplace.json",
];

/**
 * The repository-relative path an entry's source names, "" for the root, or
 * undefined when the source isn't a path in this repository. Only a bare
 * string and a `local` source count: a git URL (`url`, `git-subdir`,
 * `github`) names some revision of some repository, which a tool fetches on
 * its own, so it says nothing about the commit read here. A path climbing out
 * of the repository counts as no path.
 */
function repositoryRelativePath(source: unknown): string | undefined {
  let raw: unknown = source;
  if (typeof source === "object" && source !== null) {
    const { source: kind, path } = source as {
      source?: unknown;
      path?: unknown;
    };
    if (kind !== "local") return undefined;
    raw = path;
  }
  if (typeof raw !== "string") return undefined;
  const normalized = posix.normalize(raw).replace(/\/+$/, "");
  if (normalized === "." || normalized === "") return "";
  if (normalized === ".." || normalized.startsWith("../")) return undefined;
  if (normalized.startsWith("/")) return undefined;
  return normalized;
}

/**
 * Reads one marketplace file: its `name`, and the first entry whose source is
 * a repository-relative path resolving to `pluginPath` (undefined or "" for a
 * plugin at the root). Paths resolve against the repository root, which is the
 * marketplace root for every file in the scan list.
 *
 * A file that isn't JSON, or has no string `name` or no `plugins` array, gets
 * a record with neither name and a warning: present, but of no use to a tool.
 */
export function readMarketplaceFile(
  path: string,
  content: string,
  pluginPath: string | undefined,
): { record: RepositoryMarketplaceFile; warning?: string } {
  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      record: { path },
      warning: `${path}: not valid JSON (${message})`,
    };
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return { record: { path }, warning: `${path}: not a JSON object` };
  }
  const { name, plugins } = data as { name?: unknown; plugins?: unknown };
  if (typeof name !== "string" || name === "") {
    return { record: { path }, warning: `${path}: has no "name"` };
  }
  if (!Array.isArray(plugins)) {
    return { record: { path }, warning: `${path}: has no "plugins" array` };
  }
  const target = normalizePluginPath(pluginPath) ?? "";
  const entry = plugins.find(
    (p): p is { name: string; source: unknown } =>
      typeof p === "object" &&
      p !== null &&
      typeof (p as { name?: unknown }).name === "string" &&
      repositoryRelativePath((p as { source?: unknown }).source) === target,
  );
  const record: RepositoryMarketplaceFile = { path, marketplaceName: name };
  if (entry) record.entryName = entry.name;
  return { record };
}

/**
 * The known marketplace files present at `commit` in a clone, read from the
 * commit's tree rather than the working tree, which sparse checkout narrowed
 * to the Plugin's directory. No second clone: in a blobless clone each blob is
 * fetched on its own, and only for a file that exists.
 */
function readMarketplaceFiles(
  repoRoot: string,
  commit: string,
  pluginPath: string | undefined,
): { records: RepositoryMarketplaceFile[]; warnings: string[] } {
  const present = new Set(
    execFileSync(
      "git",
      [
        "-C",
        repoRoot,
        "ls-tree",
        "--name-only",
        commit,
        "--",
        ...KNOWN_MARKETPLACE_FILE_PATHS,
      ],
      { stdio: "pipe", encoding: "utf-8" },
    )
      .split("\n")
      .filter(Boolean),
  );
  const records: RepositoryMarketplaceFile[] = [];
  const warnings: string[] = [];
  for (const path of KNOWN_MARKETPLACE_FILE_PATHS) {
    if (!present.has(path)) continue;
    let content: string;
    try {
      content = execFileSync(
        "git",
        ["-C", repoRoot, "cat-file", "blob", `${commit}:${path}`],
        { stdio: "pipe", encoding: "utf-8" },
      );
    } catch {
      records.push({ path });
      warnings.push(`${path}: could not be read`);
      continue;
    }
    const { record, warning } = readMarketplaceFile(path, content, pluginPath);
    records.push(record);
    if (warning) warnings.push(warning);
  }
  return { records, warnings };
}

// --- Plugin source fetching ---

// Keyed on url + path, not url alone: two plugin approvals pointing at
// different directories within the same repo need distinct clone dirs,
// since `git clone` requires an empty target directory — reusing one dir
// for both would make the second clone fail, and enrichPluginMetadata
// would then drop that plugin with a warning that reads like a network
// failure rather than a name collision.
export function pluginCloneKey(
  sourceUrl: string,
  pluginPath: string | undefined,
  ref?: string,
): string {
  return createHash("sha256")
    .update(`${sourceUrl}|${pluginPath ?? ""}|${ref ?? ""}`)
    .digest("hex")
    .slice(0, 8);
}

function clonePluginRepo(
  sourceUrl: string,
  pluginPath: string | undefined,
  tmpDir: string,
  ref?: string,
): { repoRoot: string; pluginDir: string; commit: string } {
  const cloneDir = join(
    tmpDir,
    `plugin-${pluginCloneKey(sourceUrl, pluginPath, ref)}`,
  );

  // cloneDir is keyed on url+path+ref, so two entries reaching this point
  // with the same key (e.g. two different pluginIds that cite the identical
  // source at the identical ref) would otherwise both try to clone into the
  // same directory — the second one hits a non-empty dir and throws. Skip
  // re-cloning if it's already there; the key guarantees it already has
  // exactly the right content checked out. Mirrors skill-source.ts's
  // cloneSkillFolder guard.
  let commit: string;
  if (existsSync(cloneDir)) {
    commit = checkedOutCommit(cloneDir);
  } else {
    commit = cloneAtRef(sourceUrl, cloneDir, ref);

    // Unlike a skill source (a single SKILL.md file at the target path), a
    // plugin needs its whole directory subtree (skills/**, mcp.json)
    // materialized — narrow the sparse-checkout cone to that subtree. For a
    // repo-root plugin, "sparse-checkout set ." is NOT equivalent to
    // checking out everything — in cone mode it only materializes
    // root-level files, not subdirectories — so disable sparse-checkout
    // entirely instead to get the full repo.
    //
    // pluginPath comes from a vendor-supplied approval file — pass it as
    // its own argv entry (execFileSync, no shell) rather than interpolating
    // into a shell string, so a path like "a; rm -rf /" can't execute
    // anything.
    try {
      if (pluginPath) {
        execFileSync(
          "git",
          ["-C", cloneDir, "sparse-checkout", "set", pluginPath],
          { stdio: "pipe" },
        );
      } else {
        execFileSync("git", ["-C", cloneDir, "sparse-checkout", "disable"], {
          stdio: "pipe",
        });
      }
    } catch {
      throw new Error(
        `Failed to check out plugin contents ${pluginPath ? `at path "${pluginPath}" ` : ""}in ${sourceUrl}`,
      );
    }
  }

  const pluginDir = resolveInsideRepo(
    cloneDir,
    pluginPath ?? ".",
    "Plugin path",
  );

  return { repoRoot: cloneDir, pluginDir, commit };
}

/**
 * `options.readMarketplaceFiles` also reads the known marketplace files at the
 * resolved commit (see readMarketplaceFiles). Only consolidation asks for
 * them: vendor validation does no extra network work for them, and the
 * default-branch fetch behind latestHash doesn't need them.
 */
export function fetchPluginManifest(
  sourceUrl: string,
  sourcePath?: string,
  tmpDir?: string,
  ref?: string,
  options: { readMarketplaceFiles?: boolean } = {},
): PluginMetadata {
  sourcePath = normalizePluginPath(sourcePath);
  const dir = tmpDir ?? join(ROOT, ".tmp-plugins");
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const { repoRoot, pluginDir, commit } = clonePluginRepo(
    sourceUrl,
    sourcePath,
    dir,
    ref,
  );
  const manifestPath = join(pluginDir, "plugin.json");

  if (!existsSync(manifestPath)) {
    const location = sourcePath
      ? `path "${sourcePath}" in ${sourceUrl}`
      : sourceUrl;
    throw new Error(`plugin.json not found at ${location}`);
  }

  const pluginJson = readFileSync(manifestPath, "utf-8");
  const manifest = parsePluginManifest(pluginJson);

  const skillsPrefix = sourcePath ? `${sourcePath}/skills` : "skills";
  const skillFiles = discoverSkillPaths(repoRoot, `${skillsPrefix}/*`).map(
    (path) => {
      const skillMdPath = join(repoRoot, path, "SKILL.md");
      return {
        path: sourcePath ? stripPathPrefix(path, sourcePath) : path,
        skillMd: existsSync(skillMdPath)
          ? readFileSync(skillMdPath, "utf-8")
          : "",
      };
    },
  );
  const containedSkills: ContainedSkill[] = skillFiles.map(
    ({ path, skillMd }) => {
      const { name, description } = parseSkillFrontmatter(skillMd);
      return { name: name || path.split("/").pop()!, description, path };
    },
  );

  const mcpJsonPath = join(pluginDir, "mcp.json");
  const mcpJson = existsSync(mcpJsonPath)
    ? readFileSync(mcpJsonPath, "utf-8")
    : undefined;
  const containedMcpServers =
    mcpJson !== undefined ? parseMcpServers(mcpJson) : [];

  const conformanceIssues = agentPluginIssues({
    pluginJson,
    mcpJson,
    skills: skillFiles,
  });

  const contentHash = computeContentHash(pluginDir);

  const metadata: PluginMetadata = {
    ...manifest,
    containedSkills,
    containedMcpServers,
    contentHash,
    commit,
    isAgentPlugin: conformanceIssues.length === 0,
    agentPluginIssues: conformanceIssues,
  };
  if (options.readMarketplaceFiles) {
    const { records, warnings } = readMarketplaceFiles(
      repoRoot,
      commit,
      sourcePath,
    );
    metadata.marketplaceFiles = records;
    metadata.marketplaceFileWarnings = warnings;
  }
  return metadata;
}

// --- Enrichment (called by consolidate.ts) ---

/**
 * `remote`, when given, also sets latestCommit and latestHash on every entry
 * (see recordLatest in git-source.ts). Without it they are left unset.
 */
export function enrichPluginMetadata(
  plugins: PluginEntry[],
  remote?: RemoteBranchesLookup,
): PluginEntry[] {
  if (plugins.length === 0) return plugins;

  console.log("Enriching plugins with source metadata...\n");

  // A unique directory per call, for the reason enrichSandboxExtensions
  // gives: two overlapping runs sharing one fixed path would each delete the
  // clones the other is reading.
  const tmpDir = mkdtempSync(resolve(ROOT, ".tmp-plugins-"));

  const enriched: PluginEntry[] = [];

  try {
    for (const entry of plugins) {
      try {
        const metadata = fetchPluginManifest(
          entry.source.url,
          entry.source.path,
          tmpDir,
          entry.source.ref,
          { readMarketplaceFiles: true },
        );
        entry.name = metadata.name || entry.pluginId;
        entry.description = metadata.description;
        entry.version = metadata.version;
        entry.author = metadata.author;
        entry.homepage = metadata.homepage;
        entry.keywords = metadata.keywords;
        entry.contentHash = metadata.contentHash;
        entry.source = { ...entry.source, commit: metadata.commit };
        entry.containedSkills = metadata.containedSkills;
        entry.containedMcpServers = metadata.containedMcpServers;
        entry.isAgentPlugin = metadata.isAgentPlugin;
        if (metadata.agentPluginIssues.length > 0) {
          entry.agentPluginIssues = metadata.agentPluginIssues;
        } else {
          delete entry.agentPluginIssues;
        }
        entry.marketplaceFiles = metadata.marketplaceFiles ?? [];
        console.log(`  Enriched: ${entry.pluginId}`);
        console.log(`    Name: ${entry.name}`);
        console.log(`    Hash: ${metadata.contentHash}`);
        // Kept, and the file recorded as listing nothing.
        for (const warning of metadata.marketplaceFileWarnings ?? []) {
          console.warn(`    WARNING: marketplace file ${warning}`);
        }
        // Kept, but not an Agent Plugin: say why, so the vendor can fix it.
        for (const issue of metadata.agentPluginIssues) {
          console.warn(`    WARNING: not an Agent Plugin: ${issue}`);
        }
        if (remote) {
          const pinned = sourcePinned(entry.source, remote);
          if (pinned !== undefined) entry.source.pinned = pinned;
          recordLatest(
            entry,
            entry.pluginId,
            metadata,
            () =>
              fetchPluginManifest(entry.source.url, entry.source.path, tmpDir),
            remote,
          );
        }
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
