import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { cliSource, sourceTreeUrl } from "./cliSource";

describe("cliSource", () => {
  it("reduces a GitHub URL to the owner/repo shorthand", () => {
    assert.equal(
      cliSource("https://github.com/anthropics/skills.git"),
      "anthropics/skills",
    );
  });

  it("passes another host through as a full URL", () => {
    assert.equal(
      cliSource("https://gitlab.com/acme/kits.git"),
      "https://gitlab.com/acme/kits",
    );
  });

  // Both are valid in an approval file, and a trailing slash left in place
  // would produce `acme/kits/` as a CLI argument.
  it("strips a trailing slash as well as .git", () => {
    assert.equal(cliSource("https://github.com/acme/kits/"), "acme/kits");
    assert.equal(cliSource("https://github.com/acme/kits.git/"), "acme/kits");
    assert.equal(cliSource("https://github.com/acme/kits//"), "acme/kits");
  });
});

describe("sourceTreeUrl", () => {
  const commit = "7b4a44e40e0112233445566778899aabbccddeef";

  // The ref can move, a branch always and a tag if someone retags it; the
  // commit is what the hash was computed at.
  it("prefers the commit over the ref", () => {
    assert.equal(
      sourceTreeUrl({
        url: "https://github.com/acme/kits.git",
        path: "skills/review",
        ref: "v1.2.0",
        commit,
      }),
      `https://github.com/acme/kits/tree/${commit}/skills/review`,
    );
  });

  it("pins a root-level entry to its commit as well", () => {
    assert.equal(
      sourceTreeUrl({ url: "https://github.com/acme/kits.git", commit }),
      `https://github.com/acme/kits/tree/${commit}`,
    );
  });

  it("falls back to the ref for a feed without a commit", () => {
    assert.equal(
      sourceTreeUrl({
        url: "https://github.com/acme/kits.git",
        path: "skills/review",
        ref: "v1.2.0",
      }),
      "https://github.com/acme/kits/tree/v1.2.0/skills/review",
    );
  });

  it("falls back to HEAD for a path with no revision", () => {
    assert.equal(
      sourceTreeUrl({
        url: "https://github.com/acme/kits.git",
        path: "skills/review",
      }),
      "https://github.com/acme/kits/tree/HEAD/skills/review",
    );
  });

  it("links the repository itself when there is nothing to point into", () => {
    assert.equal(
      sourceTreeUrl({ url: "https://github.com/acme/kits.git" }),
      "https://github.com/acme/kits",
    );
  });

  it("normalizes the URL before joining", () => {
    assert.equal(
      sourceTreeUrl({
        url: "https://github.com/acme/kits.git/",
        path: "skills/review",
        commit,
      }),
      `https://github.com/acme/kits/tree/${commit}/skills/review`,
    );
  });

  // A trailing slash carried into the link would render as
  // `kits//tree/main/...`.
  it("strips a trailing slash so the /tree/ link stays well-formed", () => {
    assert.equal(
      sourceTreeUrl({
        url: "https://github.com/acme/kits/",
        path: "tools/foo",
        ref: "main",
      }),
      "https://github.com/acme/kits/tree/main/tools/foo",
    );
  });

  // GitLab groups nest, so the repository path can run past two segments.
  it("keeps every segment of a nested GitLab group", () => {
    assert.equal(
      sourceTreeUrl({
        url: "https://gitlab.com/gitlab-org/ai/skills.git",
        path: "skills/adr-review",
        commit,
      }),
      `https://gitlab.com/gitlab-org/ai/skills/tree/${commit}/skills/adr-review`,
    );
  });
});
