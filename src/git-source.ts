import { resolve, sep } from "node:path";

/**
 * Helpers shared by every module that clones a source repository —
 * skill-source, plugin-source, marketplace-source, sandbox-source, and
 * consolidate's vendor clone. Each of these used to carry its own copy, so a
 * fix to either one reached only the file it was made in.
 */

/**
 * Rewrites an https remote to carry the CI token, so private vendor and source
 * repositories clone without an interactive credential prompt.
 *
 * Non-https remotes (ssh, scp-style, local paths) are returned untouched:
 * there is nowhere in them for a token to go, and an ssh remote authenticates
 * by key anyway.
 */
export function authenticatedRepoUrl(sourceUrl: string): string {
  const token = process.env.GH_TOKEN;
  if (!token || !sourceUrl.startsWith("https://")) return sourceUrl;
  return sourceUrl.replace("https://", `https://x-access-token:${token}@`);
}

/**
 * Resolves a path inside a cloned repository, refusing one that escapes it.
 *
 * Defense-in-depth on top of the schema's own traversal check: resolve()
 * normalizes "."/".." per POSIX rules, so a path that somehow still lands
 * outside the clone (e.g. in a sibling clone under the same tmp parent) must
 * not be silently followed. `cloneDir` is resolved too before comparing —
 * resolve(cloneDir, path) is always absolute, but cloneDir itself, built from
 * a caller's tmpDir, is not guaranteed to be.
 *
 * The repository root itself is allowed: an artifact can legitimately sit at
 * the root of its repo, which is what an empty or "." path means.
 */
export function resolveInsideRepo(
  cloneDir: string,
  relativePath: string,
  label = "Path",
): string {
  const root = resolve(cloneDir);
  const target = resolve(cloneDir, relativePath);
  if (target !== root && !target.startsWith(root + sep)) {
    throw new Error(`${label} "${relativePath}" escapes the cloned repository`);
  }
  return target;
}
