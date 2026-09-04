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
