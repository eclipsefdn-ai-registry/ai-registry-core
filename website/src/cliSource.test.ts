import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { cliSource, repoWebUrl } from "./cliSource";

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

describe("repoWebUrl", () => {
  it("keeps the host, so the result is browsable", () => {
    assert.equal(
      repoWebUrl("https://github.com/acme/kits.git"),
      "https://github.com/acme/kits",
    );
  });

  // The bug this helper exists to prevent: a trailing slash carried into a
  // `/tree/<ref>/<path>` link renders as `kits//tree/main/...`.
  it("strips a trailing slash so a /tree/ link stays well-formed", () => {
    assert.equal(
      `${repoWebUrl("https://github.com/acme/kits/")}/tree/main/tools/foo`,
      "https://github.com/acme/kits/tree/main/tools/foo",
    );
  });

  it("leaves a plain URL untouched", () => {
    assert.equal(
      repoWebUrl("https://gitlab.com/acme/kits"),
      "https://gitlab.com/acme/kits",
    );
  });
});
