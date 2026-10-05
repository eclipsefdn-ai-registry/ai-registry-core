import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import {
  authenticatedRepoUrl,
  cloneAtRef,
  isPinnedRef,
  listRemoteBranches,
  needsDefaultBranchFetch,
  parseRemoteBranches,
  recordLatest,
  remoteBranchesLookup,
  resolveInsideRepo,
  type RemoteBranches,
  type RemoteBranchesLookup,
} from "./git-source.js";

describe("authenticatedRepoUrl", () => {
  const saved = process.env.GH_TOKEN;
  beforeEach(() => {
    delete process.env.GH_TOKEN;
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.GH_TOKEN;
    else process.env.GH_TOKEN = saved;
  });

  it("returns the url unchanged with no token", () => {
    assert.equal(
      authenticatedRepoUrl("https://github.com/acme/kits.git"),
      "https://github.com/acme/kits.git",
    );
  });

  it("injects the token into an https remote", () => {
    process.env.GH_TOKEN = "secret";
    assert.equal(
      authenticatedRepoUrl("https://github.com/acme/kits.git"),
      "https://x-access-token:secret@github.com/acme/kits.git",
    );
  });

  // There is nowhere in these to put a token, and ssh authenticates by key.
  // Rewriting them would corrupt the remote rather than authenticate it.
  it("leaves non-https remotes alone even with a token set", () => {
    process.env.GH_TOKEN = "secret";
    for (const url of [
      "git@github.com:acme/kits.git",
      "ssh://git@host/acme/kits.git",
      "/abs/path/to/kits",
      "./relative/kits",
    ]) {
      assert.equal(authenticatedRepoUrl(url), url);
    }
  });

  // Only the scheme prefix is rewritten, so an "https://" appearing later in
  // the string (a path segment, a query) is left where it is.
  it("rewrites only the leading scheme", () => {
    process.env.GH_TOKEN = "secret";
    assert.equal(
      authenticatedRepoUrl("https://example.com/r?u=https://elsewhere"),
      "https://x-access-token:secret@example.com/r?u=https://elsewhere",
    );
  });
});

describe("resolveInsideRepo", () => {
  const clone = join(sep, "tmp", "clone");

  it("resolves a path inside the repository", () => {
    assert.equal(
      resolveInsideRepo(clone, "tools/openclaw"),
      join(clone, "tools", "openclaw"),
    );
  });

  // An artifact can legitimately sit at the root of its own repository, which
  // is what plugin-source passes when an approval carries no path.
  it("allows the repository root itself", () => {
    assert.equal(resolveInsideRepo(clone, "."), clone);
  });

  it("allows traversal that stays inside", () => {
    assert.equal(
      resolveInsideRepo(clone, "tools/../features/gh"),
      join(clone, "features", "gh"),
    );
  });

  it("refuses a path that climbs out", () => {
    assert.throws(
      () => resolveInsideRepo(clone, "../elsewhere"),
      /escapes the cloned repository/,
    );
  });

  // The dangerous case in practice: a sibling clone under the same tmp parent.
  it("refuses a sibling directory sharing a name prefix", () => {
    assert.throws(
      () => resolveInsideRepo(clone, "../clone-other/tools/x"),
      /escapes the cloned repository/,
    );
  });

  it("uses the caller's label in the message", () => {
    assert.throws(
      () => resolveInsideRepo(clone, "../x", "Plugin path"),
      /Plugin path "\.\.\/x" escapes the cloned repository/,
    );
  });
});

describe("cloneAtRef", () => {
  // A SHA is fetched after the default branch is already cloned. Callers
  // reuse whatever is at cloneDir, so a failed fetch must not leave that
  // default-branch clone behind for the next entry to read.
  it("removes the clone when a commit SHA can't be checked out", () => {
    const sourceDir = mkdtempSync(join(tmpdir(), "clone-at-ref-src-"));
    const tmpDir = mkdtempSync(join(tmpdir(), "clone-at-ref-test-"));
    try {
      execSync("git init -b main", { cwd: sourceDir, stdio: "pipe" });
      writeFileSync(join(sourceDir, "README.md"), "main\n");
      execSync(
        'git add -A && git -c user.email="test@test.com" -c user.name="Test" commit -m main',
        { cwd: sourceDir, stdio: "pipe" },
      );

      const cloneDir = join(tmpDir, "clone");
      assert.throws(
        () => cloneAtRef(`file://${sourceDir}`, cloneDir, "0".repeat(40)),
        /Failed to check out ref "0{40}"/,
      );
      assert.equal(existsSync(cloneDir), false);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
      rmSync(sourceDir, { recursive: true, force: true });
    }
  });
});

describe("parseRemoteBranches", () => {
  const main = "a".repeat(40);
  const feature = "b".repeat(40);

  it("reads the default branch's tip and every branch name", () => {
    const parsed = parseRemoteBranches(
      [
        `${main}\tHEAD`,
        `${main}\trefs/heads/main`,
        `${feature}\trefs/heads/feature/x`,
        "",
      ].join("\n"),
    );
    assert.equal(parsed.head, main);
    assert.deepEqual([...parsed.branches].sort(), ["feature/x", "main"]);
  });

  // ls-remote matches `HEAD` against the tail of every ref, so a remote that
  // is itself a clone also reports its remote-tracking HEAD. That one points
  // wherever the clone's origin did, not at this remote's default branch.
  it("takes only a ref named exactly HEAD as the tip", () => {
    const parsed = parseRemoteBranches(
      [
        `${feature}\trefs/remotes/origin/HEAD`,
        `${main}\tHEAD`,
        `${main}\trefs/heads/main`,
      ].join("\n"),
    );
    assert.equal(parsed.head, main);
    assert.deepEqual([...parsed.branches], ["main"]);
  });

  it("throws when the remote reports no HEAD", () => {
    assert.throws(
      () => parseRemoteBranches(`${main}\trefs/heads/main\n`),
      /no default branch/,
    );
  });
});

describe("isPinnedRef", () => {
  const branches = new Set(["main", "release/1.x"]);

  it("treats no ref as following the default branch", () => {
    assert.equal(isPinnedRef(undefined, branches), false);
  });

  it("treats a branch name, slashed or not, as following that branch", () => {
    assert.equal(isPinnedRef("main", branches), false);
    assert.equal(isPinnedRef("release/1.x", branches), false);
  });

  it("treats a name that isn't a branch as a tag", () => {
    assert.equal(isPinnedRef("v1.0.0", branches), true);
  });

  it("treats a full commit SHA as pinned, whatever the branches are called", () => {
    const sha = "c".repeat(40);
    assert.equal(isPinnedRef(sha, new Set([sha])), true);
  });
});

describe("needsDefaultBranchFetch", () => {
  const url = "https://example.test/kits.git";
  const resolved = "a".repeat(40);
  const moved = "b".repeat(40);

  function spyRemote(remote: RemoteBranches): {
    remote: RemoteBranchesLookup;
    asked: string[];
  } {
    const asked: string[] = [];
    return {
      remote: (sourceUrl) => {
        asked.push(sourceUrl);
        return remote;
      },
      asked,
    };
  }

  // Most entries have no ref, so this is the case that must cost nothing.
  it("never asks the remote about an entry with no ref", () => {
    const spy = spyRemote({ head: moved, branches: new Set(["main"]) });
    assert.equal(needsDefaultBranchFetch({ url }, resolved, spy.remote), false);
    assert.deepEqual(spy.asked, []);
  });

  // The entry follows its branch, so what it resolved to is that branch's
  // latest, even when the default branch is somewhere else entirely.
  it("needs no second checkout for a branch ref, even off the default branch", () => {
    const spy = spyRemote({ head: moved, branches: new Set(["main", "dev"]) });
    assert.equal(
      needsDefaultBranchFetch({ url, ref: "dev" }, resolved, spy.remote),
      false,
    );
  });

  it("needs no second checkout for a pin the default branch still points at", () => {
    const spy = spyRemote({ head: resolved, branches: new Set(["main"]) });
    assert.equal(
      needsDefaultBranchFetch({ url, ref: "v1.0.0" }, resolved, spy.remote),
      false,
    );
    assert.equal(
      needsDefaultBranchFetch({ url, ref: resolved }, resolved, spy.remote),
      false,
    );
  });

  it("needs a second checkout once the default branch has moved off a pin", () => {
    const spy = spyRemote({ head: moved, branches: new Set(["main"]) });
    assert.equal(
      needsDefaultBranchFetch({ url, ref: "v1.0.0" }, resolved, spy.remote),
      true,
    );
    assert.equal(
      needsDefaultBranchFetch({ url, ref: resolved }, resolved, spy.remote),
      true,
    );
  });

  it("asks about the entry's own repository", () => {
    const spy = spyRemote({ head: moved, branches: new Set(["main"]) });
    needsDefaultBranchFetch({ url, ref: "v1.0.0" }, resolved, spy.remote);
    assert.deepEqual(spy.asked, [url]);
  });

  it("lets a failed lookup propagate", () => {
    assert.throws(
      () =>
        needsDefaultBranchFetch({ url, ref: "v1.0.0" }, resolved, () => {
          throw new Error("unreachable");
        }),
      /unreachable/,
    );
  });
});

describe("recordLatest", () => {
  const url = "https://example.test/kits.git";
  const resolved = { commit: "a".repeat(40), contentHash: "a1a1a1a1a1a1" };
  const tip = { commit: "b".repeat(40), contentHash: "b2b2b2b2b2b2" };
  // A default branch that has moved off the resolved commit.
  const moved: RemoteBranchesLookup = () => ({
    head: tip.commit,
    branches: new Set(["main"]),
  });

  function entry(ref?: string): {
    source: { url: string; ref?: string };
    latestCommit?: string;
    latestHash?: string;
  } {
    return { source: { url, ref } };
  }

  it("reuses the resolved values, with no lookup and no fetch, for an entry with no ref", () => {
    const e = entry();
    const calls: string[] = [];
    recordLatest(
      e,
      "io.example/kit",
      resolved,
      () => {
        calls.push("fetch");
        return tip;
      },
      (sourceUrl) => {
        calls.push("lookup");
        return moved(sourceUrl);
      },
    );
    assert.equal(e.latestCommit, resolved.commit);
    assert.equal(e.latestHash, resolved.contentHash);
    assert.deepEqual(calls, []);
  });

  it("records what the default branch ships once it has moved off a pin", () => {
    const e = entry("v1.0.0");
    recordLatest(e, "io.example/kit", resolved, () => tip, moved);
    assert.equal(e.latestCommit, tip.commit);
    assert.equal(e.latestHash, tip.contentHash);
  });

  // Either failure costs the entry only these two fields. What it resolved to
  // is still what was approved, so nothing may be thrown at the caller.
  it("leaves both fields unset when the remote can't be listed", () => {
    const e = entry("v1.0.0");
    recordLatest(
      e,
      "io.example/kit",
      resolved,
      () => tip,
      () => {
        throw new Error("unreachable");
      },
    );
    assert.equal(e.latestCommit, undefined);
    assert.equal(e.latestHash, undefined);
  });

  it("leaves both fields unset when the default branch can't be fetched", () => {
    const e = entry("v1.0.0");
    recordLatest(
      e,
      "io.example/kit",
      resolved,
      () => {
        throw new Error("no longer there");
      },
      moved,
    );
    assert.equal(e.latestCommit, undefined);
    assert.equal(e.latestHash, undefined);
  });
});

describe("remoteBranchesLookup", () => {
  const listed: RemoteBranches = { head: "a".repeat(40), branches: new Set() };

  it("lists each URL once, however many entries ask", () => {
    const asked: string[] = [];
    const lookup = remoteBranchesLookup((url) => {
      asked.push(url);
      return listed;
    });
    lookup("https://example.test/a.git");
    lookup("https://example.test/a.git");
    lookup("https://example.test/b.git");
    assert.deepEqual(asked, [
      "https://example.test/a.git",
      "https://example.test/b.git",
    ]);
  });

  it("keeps a failure rather than asking again", () => {
    let calls = 0;
    const lookup = remoteBranchesLookup(() => {
      calls++;
      throw new Error("unreachable");
    });
    assert.throws(() => lookup("https://example.test/a.git"), /unreachable/);
    assert.throws(() => lookup("https://example.test/a.git"), /unreachable/);
    assert.equal(calls, 1);
  });
});

describe("listRemoteBranches", () => {
  it("reports the default branch's tip and branches, but not tags", () => {
    const sourceDir = mkdtempSync(join(tmpdir(), "ls-remote-src-"));
    try {
      const git = (command: string) =>
        execSync(`git ${command}`, { cwd: sourceDir, stdio: "pipe" })
          .toString()
          .trim();
      git("init -b main");
      writeFileSync(join(sourceDir, "README.md"), "main\n");
      git("add -A");
      git('-c user.email="test@test.com" -c user.name="Test" commit -m main');
      git("branch release/1.x");
      git("tag v1.0.0");

      const remote = listRemoteBranches(`file://${sourceDir}`);
      assert.equal(remote.head, git("rev-parse HEAD"));
      assert.deepEqual([...remote.branches].sort(), ["main", "release/1.x"]);
    } finally {
      rmSync(sourceDir, { recursive: true, force: true });
    }
  });

  it("names the source, not the command, when the remote can't be listed", () => {
    const missing = join(tmpdir(), "ls-remote-missing-does-not-exist");
    assert.throws(
      () => listRemoteBranches(`file://${missing}`),
      (err: Error) =>
        err.message === `Failed to list the branches of file://${missing}`,
    );
  });
});
