/**
 * Turns a `source.url` into the argument the skills and plugins CLIs take. The
 * GitHub prefix is stripped so the common case reads as the documented
 * `owner/repo` shorthand; any other host falls through unchanged, which both
 * CLIs also accept as a full URL.
 */
export function cliSource(url: string): string {
  return url.replace(/^https:\/\/github\.com\//, "").replace(/\.git$/, "");
}
