import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
import {
  authenticatedRepoUrl,
  cloneAtRef,
  resolveInsideRepo,
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
