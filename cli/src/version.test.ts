import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { atLeast, parseVersionLine, type Version } from "./version.js";

describe("parseVersionLine", () => {
  it("reads `<program> X.Y.Z`", () => {
    assert.deepEqual(
      parseVersionLine("codex-cli 0.171.0\n", "codex-cli"),
      [0, 171, 0],
    );
  });

  it("keeps a prerelease suffix", () => {
    assert.deepEqual(
      parseVersionLine("codex-cli 0.173.0-alpha.1", "codex-cli"),
      [0, 173, 0, "alpha.1"],
    );
  });

  it("reads the first line only", () => {
    assert.equal(
      parseVersionLine("a warning\ncodex-cli 0.171.0", "codex-cli"),
      undefined,
    );
  });

  for (const [what, output] of [
    ["nothing", ""],
    ["another program", "kiro-cli 3.1.0"],
    ["no version", "codex-cli"],
    ["two parts", "codex-cli 0.171"],
    ["a longer program name", "codex-cli-beta 0.171.0"],
  ] as const) {
    it(`reads ${what} as unreadable`, () => {
      assert.equal(parseVersionLine(output, "codex-cli"), undefined);
    });
  }
});

describe("atLeast", () => {
  for (const [version, min, expected] of [
    [[0, 131, 0], [0, 131, 0], true],
    [[0, 171, 0], [0, 131, 0], true],
    [[1, 0, 0], [0, 131, 0], true],
    [[0, 130, 9], [0, 131, 0], false],
    [[0, 131, 0], [0, 131, 1], false],
    // A prerelease comes before its release, and may lack what it brings.
    [[0, 131, 0, "alpha.1"], [0, 131, 0], false],
    [[0, 132, 0, "alpha.1"], [0, 131, 0], true],
  ] satisfies [Version, Version, boolean][]) {
    it(`${version.join(".")} against ${min.join(".")}: ${expected}`, () => {
      assert.equal(atLeast(version, min), expected);
    });
  }
});
