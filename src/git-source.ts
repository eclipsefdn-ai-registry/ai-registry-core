import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
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
 * there, not at the clone above. That failure removes the default-branch
 * clone before throwing: callers reuse whatever is already at `cloneDir`, so
 * leaving it would have every later entry at this ref read the default
 * branch, and publish its hash under the SHA without a warning.
 *
 * Returns the commit that ended up checked out, whatever `ref` named.
 */
export function cloneAtRef(
  sourceUrl: string,
  cloneDir: string,
  ref?: string,
): string {
  const repoUrl = authenticatedRepoUrl(sourceUrl);
  const isCommitSha = ref !== undefined && COMMIT_SHA_PATTERN.test(ref);
  const branch = isCommitSha ? undefined : ref;

  const cloneArgs = ["clone", "--depth", "1", "--filter=blob:none", "--sparse"];
  if (branch !== undefined) cloneArgs.push("--branch", branch);
  cloneArgs.push(repoUrl, cloneDir);

  try {
    execFileSync("git", cloneArgs, { stdio: "pipe" });
  } catch {
    throw new Error(
      `Failed to clone ${sourceUrl}${branch !== undefined ? ` at ref "${branch}"` : ""}`,
    );
  }

  if (isCommitSha) {
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
      rmSync(cloneDir, { recursive: true, force: true });
      throw new Error(`Failed to check out ref "${ref}" in ${sourceUrl}`);
    }
  }

  return checkedOutCommit(cloneDir);
}

/**
 * The full SHA of the commit checked out in `cloneDir`. Callers that reuse an
 * existing clone call this directly rather than keeping cloneAtRef's return
 * value, so every entry read from one clone reports the same commit.
 */
export function checkedOutCommit(cloneDir: string): string {
  return execFileSync("git", ["-C", cloneDir, "rev-parse", "HEAD"], {
    stdio: "pipe",
  })
    .toString()
    .trim();
}

/**
 * What a remote reports about its branches: the commit its default branch
 * points at, and the name of every branch.
 */
export interface RemoteBranches {
  head: string;
  branches: Set<string>;
}

/** Looks up a remote's branches by its source URL. */
export type RemoteBranchesLookup = (sourceUrl: string) => RemoteBranches;

/**
 * Parses the output of `git ls-remote <url> HEAD refs/heads/*`.
 *
 * ls-remote matches its patterns against the tail of a ref, so `HEAD` also
 * matches refs such as refs/remotes/origin/HEAD when the remote is itself a
 * clone. Only a ref named exactly HEAD is the default branch's tip, and only
 * refs/heads/ lines are branches.
 */
export function parseRemoteBranches(output: string): RemoteBranches {
  let head: string | undefined;
  const branches = new Set<string>();
  for (const line of output.split("\n")) {
    const [sha, refname] = line.trim().split("\t");
    // The output ends in a newline, which leaves an empty last line.
    if (!refname) continue;
    if (refname === "HEAD") head = sha;
    else if (refname.startsWith("refs/heads/")) {
      branches.add(refname.slice("refs/heads/".length));
    }
  }
  if (head === undefined) {
    throw new Error("the remote reports no default branch (no HEAD)");
  }
  return { head, branches };
}

/**
 * One `git ls-remote` for the default branch's tip and every branch name, with
 * no clone.
 *
 * The thrown error is a new one rather than the one execFileSync raised: that
 * one's message carries the command line, and with it the token
 * authenticatedRepoUrl puts into an https URL.
 */
export function listRemoteBranches(sourceUrl: string): RemoteBranches {
  let output: string;
  try {
    output = execFileSync(
      "git",
      ["ls-remote", authenticatedRepoUrl(sourceUrl), "HEAD", "refs/heads/*"],
      {
        stdio: "pipe",
        encoding: "utf-8",
        // One line per branch, and a large repository can have thousands.
        maxBuffer: 64 * 1024 * 1024,
      },
    );
  } catch {
    throw new Error(`Failed to list the branches of ${sourceUrl}`);
  }
  try {
    return parseRemoteBranches(output);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`${sourceUrl}: ${message}`);
  }
}

/**
 * A lookup that lists each URL's branches once for as long as it is kept, so
 * every entry read from one repository shares a single ls-remote. A failure
 * is kept too: a remote that couldn't be listed for one entry is not asked
 * again for the next.
 */
export function remoteBranchesLookup(
  list: RemoteBranchesLookup = listRemoteBranches,
): RemoteBranchesLookup {
  const results = new Map<string, RemoteBranches | Error>();
  return (sourceUrl) => {
    let result = results.get(sourceUrl);
    if (result === undefined) {
      try {
        result = list(sourceUrl);
      } catch (err) {
        result = err instanceof Error ? err : new Error(String(err));
      }
      results.set(sourceUrl, result);
    }
    if (result instanceof Error) throw result;
    return result;
  };
}

/**
 * Whether `ref` names a fixed point rather than something that moves. A full
 * commit SHA or a tag is fixed. A branch name follows that branch, and no ref
 * at all follows the default branch.
 *
 * A SHA is tested first, as cloneAtRef does, because that is how the
 * checkout treated it. A name that is both a branch and a tag counts as a
 * branch, because `git clone --branch` checks refs/heads/ before refs/tags/.
 */
export function isPinnedRef(
  ref: string | undefined,
  branches: ReadonlySet<string>,
): boolean {
  if (ref === undefined) return false;
  if (COMMIT_SHA_PATTERN.test(ref)) return true;
  return !branches.has(ref);
}

/**
 * Whether finding out what a source ships now needs a second checkout, of its
 * default branch.
 *
 * An entry that follows a branch is its own latest: what it resolved to is
 * what that branch ships. Only a pin can fall behind, and only once the
 * default branch has moved off the pinned commit. Otherwise the resolved
 * commit and hash already are the latest ones.
 *
 * `remote` is not called for an entry with no ref, so the common case costs
 * no network at all. Whatever `remote` throws propagates.
 */
export function needsDefaultBranchFetch(
  source: { url: string; ref?: string },
  resolvedCommit: string,
  remote: RemoteBranchesLookup,
): boolean {
  if (source.ref === undefined) return false;
  const { head, branches } = remote(source.url);
  return isPinnedRef(source.ref, branches) && head !== resolvedCommit;
}

/** A commit, and the hash of an entry's path checked out there. */
export interface ResolvedContent {
  commit: string;
  contentHash: string;
}

/**
 * Sets latestCommit and latestHash on an entry that has just been resolved to
 * `resolved`. Skill and plugin enrichment share it; sandbox-source.ts has its
 * own, because it decides once per repository rather than once per entry.
 *
 * The resolved values are reused unless the entry is pinned and the default
 * branch has moved (see needsDefaultBranchFetch). Only then is
 * `fetchDefaultBranch` called. It must fetch the same path with no ref,
 * through the same function that produced `resolved`, so that both hashes are
 * computed by exactly the same code and can be compared.
 *
 * A failure costs the entry only these two fields, never the entry itself:
 * what it resolved to is still what was approved. `id` names the entry in the
 * warning.
 */
export function recordLatest(
  entry: {
    source: { url: string; ref?: string };
    latestCommit?: string;
    latestHash?: string;
  },
  id: string,
  resolved: ResolvedContent,
  fetchDefaultBranch: () => ResolvedContent,
  remote: RemoteBranchesLookup,
): void {
  try {
    const latest = needsDefaultBranchFetch(
      entry.source,
      resolved.commit,
      remote,
    )
      ? fetchDefaultBranch()
      : resolved;
    entry.latestCommit = latest.commit;
    entry.latestHash = latest.contentHash;
    if (latest.contentHash !== resolved.contentHash) {
      console.log(`    Latest hash: ${latest.contentHash} (default branch)`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(
      `  WARNING: ${id} — could not tell what the default branch ships now, published without latestCommit/latestHash`,
    );
    console.warn(`    ${message}`);
  }
}
