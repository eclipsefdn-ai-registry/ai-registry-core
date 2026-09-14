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
 * The browsable base of a source repository, for building `/tree/<ref>/<path>`
 * links. Shared by every detail view so a normalization fix reaches all of
 * them at once.
 */
export function repoWebUrl(url: string): string {
  return normalizeRepoUrl(url);
}
