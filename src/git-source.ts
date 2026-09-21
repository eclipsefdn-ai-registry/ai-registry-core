import { execFileSync } from "node:child_process";
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

const COMMIT_SHA_PATTERN = /^[0-9a-f]{40}$/i;

/**
 * Clones a repository with a blobless, sparse filter, checked out at `ref`
 * (branch, tag, or full commit SHA) — or at the default branch when `ref`
 * is omitted. `cloneDir` must not exist yet; callers own the
 * already-cloned guard, since the key they clone into (and whether to skip
 * re-cloning) is caller-specific, and so is the sparse-checkout narrowing
 * that follows this call.
 *
 * `--branch` only accepts a tag or branch name, not a commit SHA, so a
 * 40-character hex ref clones the default branch first and then fetches and
 * checks out the SHA as its own step — whose failure gets its own error
 * naming the ref, distinct from a generic clone failure, since a host that
 * doesn't serve bare SHAs (no uploadpack.allowReachableSHA1InWant) fails
 * there, not at the clone above.
 */
export function cloneAtRef(
  sourceUrl: string,
  cloneDir: string,
  ref?: string,
): void {
  const repoUrl = authenticatedRepoUrl(sourceUrl);
  const isCommitSha = ref !== undefined && COMMIT_SHA_PATTERN.test(ref);

  const cloneArgs = ["clone", "--depth", "1", "--filter=blob:none", "--sparse"];
  if (ref !== undefined && !isCommitSha) cloneArgs.push("--branch", ref);
  cloneArgs.push(repoUrl, cloneDir);

  try {
    execFileSync("git", cloneArgs, { stdio: "pipe" });
  } catch {
    throw new Error(
      `Failed to clone ${sourceUrl}${ref !== undefined && !isCommitSha ? ` at ref "${ref}"` : ""}`,
    );
  }

  if (ref !== undefined && isCommitSha) {
    try {
      execFileSync(
        "git",
        ["-C", cloneDir, "fetch", "--depth", "1", "origin", ref],
        { stdio: "pipe" },
      );
      execFileSync("git", ["-C", cloneDir, "checkout", "FETCH_HEAD"], {
        stdio: "pipe",
      });
    } catch {
      throw new Error(`Failed to check out ref "${ref}" in ${sourceUrl}`);
    }
  }
}
