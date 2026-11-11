// Mirrors website/src/cliSource.ts by hand: keep the two in sync.

/**
 * Strips a trailing slash, then a trailing `.git`, from a `source.url`. Both
 * are valid in an approval file and both break a CLI argument or a link.
 */
function normalizeRepoUrl(url: string): string {
  return url.replace(/\/+$/, "").replace(/\.git$/, "");
}

/**
 * Turns a `source.url` into the argument the skills CLI takes: the GitHub
 * `owner/repo` shorthand, or the full URL for any other host.
 */
export function cliSource(url: string): string {
  return normalizeRepoUrl(url).replace(/^https:\/\/github\.com\//, "");
}

/**
 * A browsable link to an entry's source at `source.commit`, the commit its
 * contentHash was computed at, falling back to the ref, then HEAD.
 */
export function sourceTreeUrl(source: {
  url: string;
  path?: string;
  ref?: string;
  commit?: string;
}): string {
  const base = normalizeRepoUrl(source.url);
  const revision = source.commit ?? source.ref;
  if (revision === undefined && !source.path) return base;
  const path = source.path ? `/${source.path}` : "";
  return `${base}/tree/${revision ?? "HEAD"}${path}`;
}
