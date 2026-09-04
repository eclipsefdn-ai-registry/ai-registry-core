import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

// --- Types ---

export interface CodexMarketplaceEntry {
  name: string;
  source: unknown;
}

export interface ResolvedPluginSource {
  url: string;
  path?: string;
  ref?: string;
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

// --- ID derivation ---

const GITHUB_URL_RE = /^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/;

export function deriveGithubOwnerRepo(url: string): {
  owner: string;
  repo: string;
} {
  const match = GITHUB_URL_RE.exec(url.trim());
  if (!match) {
    throw new Error(`Cannot derive GitHub owner/repo from URL "${url}"`);
  }
  return { owner: match[1].toLowerCase(), repo: match[2] };
}

export function derivePluginIdFromSource(
  resolved: ResolvedPluginSource,
): string {
  const { owner, repo } = deriveGithubOwnerRepo(resolved.url);
  const name = resolved.path ? resolved.path.split("/").pop()! : repo;
  return `io.github.${owner}/${name}`;
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

export function resolveCodexEntry(
  marketplaceRepoUrl: string,
  entry: CodexMarketplaceEntry,
): ResolvedPluginSource | undefined {
  const { source } = entry;

  // Bare string ("./plugins/x") is shorthand for a local path.
  if (typeof source === "string") {
    return { url: marketplaceRepoUrl, path: source.replace(/^\.\//, "") };
  }

  if (!isStructuredSource(source)) return undefined;

  const kind = source.source;

  if (kind === "local" && typeof source.path === "string") {
    return {
      url: marketplaceRepoUrl,
      path: source.path.replace(/^\.\//, ""),
    };
  }

  if (kind === "url" && typeof source.url === "string") {
    // sha-only pins are unsupported: git clone --branch cannot check out an
    // arbitrary commit sha, only a tag or branch name.
    if (typeof source.ref !== "string") return undefined;
    return { url: source.url, ref: source.ref };
  }

  if (
    kind === "git-subdir" &&
    typeof source.url === "string" &&
    typeof source.path === "string"
  ) {
    const resolved: ResolvedPluginSource = {
      url: source.url,
      path: source.path,
    };
    if (typeof source.ref === "string") resolved.ref = source.ref;
    return resolved;
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
    const token = process.env.GH_TOKEN;
    const repoUrl = token
      ? sourceUrl.replace("https://", `https://x-access-token:${token}@`)
      : sourceUrl;

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

  // Disable sparse-checkout to get all files, since we only need one file
  // and sparse-checkout cone mode has restrictions on patterns
  try {
    execFileSync("git", ["-C", cloneDir, "sparse-checkout", "disable"], {
      stdio: "pipe",
    });
  } catch {
    throw new Error(`Failed to disable sparse-checkout in ${sourceUrl}`);
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
