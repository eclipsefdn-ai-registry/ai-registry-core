/**
 * Strips the parts of a `source.url` that are noise in both a CLI argument and
 * a browser link: a trailing slash, then a trailing `.git`. Both are valid in
 * an approval file, and both produce a broken result if carried through — a
 * `//tree/` in a link, or a trailing slash in a repo shorthand.
 *
 * Order matters: the slash goes first so `…/kits.git/` still loses its suffix.
 */
function normalizeRepoUrl(url: string): string {
  return url.replace(/\/+$/, "").replace(/\.git$/, "");
}

/**
 * Turns a `source.url` into the argument the skills and plugins CLIs take. The
 * GitHub prefix is stripped so the common case reads as the documented
 * `owner/repo` shorthand; any other host falls through unchanged, which both
 * CLIs also accept as a full URL.
 */
export function cliSource(url: string): string {
  return normalizeRepoUrl(url).replace(/^https:\/\/github\.com\//, "");
}

/**
 * The browsable base of a source repository, which sourceTreeUrl builds every
 * detail view's link on, so a normalization fix reaches all of them at once.
 */
export function repoWebUrl(url: string): string {
  return normalizeRepoUrl(url);
}

/**
 * A browsable link to an entry's source at `source.commit`, the commit its
 * contentHash was computed at, so the page opens on exactly what was hashed
 * rather than on whatever the branch holds by the time someone clicks. Falls
 * back to the ref, and to HEAD for a path with neither, for feeds that predate
 * `source.commit`.
 *
 * `/tree/<revision>/<path>` is GitHub's form. GitLab accepts it too, which
 * covers every host the registry holds sources on.
 */
export function sourceTreeUrl(source: {
  url: string;
  path?: string;
  ref?: string;
  commit?: string;
}): string {
  const base = repoWebUrl(source.url);
  const revision = source.commit ?? source.ref;
  if (revision === undefined && !source.path) return base;
  const path = source.path ? `/${source.path}` : "";
  return `${base}/tree/${revision ?? "HEAD"}${path}`;
}
