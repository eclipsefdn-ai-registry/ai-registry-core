import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { manualInstallCommands, pluginsAddArgs } from "./pluginsAdd.js";

const COMMIT = "7b4a44e40e0112233445566778899aabbccddeef";

describe("pluginsAddArgs", () => {
  it("installs a GitHub repository by its owner/repo shorthand", () => {
    assert.deepEqual(
      pluginsAddArgs(
        { source: { url: "https://github.com/acme/kit.git" } },
        { yes: true },
      ),
      ["add", "acme/kit", "-y"],
    );
  });

  it("passes any other host as the full URL", () => {
    assert.deepEqual(
      pluginsAddArgs({ source: { url: "https://gitlab.com/acme/kit/" } }, {}),
      ["add", "https://gitlab.com/acme/kit"],
    );
  });

  it("forwards --target and --scope as given", () => {
    assert.deepEqual(
      pluginsAddArgs(
        { source: { url: "https://github.com/acme/kit" } },
        { target: "claude-code", scope: "project", yes: true },
      ),
      [
        "add",
        "acme/kit",
        "--target",
        "claude-code",
        "--scope",
        "project",
        "-y",
      ],
    );
  });

  // With -y the plugins CLI installs every plugin it discovers in the
  // repository, approved or not.
  it("never forwards -y for a plugin in a subdirectory", () => {
    assert.deepEqual(
      pluginsAddArgs(
        { source: { url: "https://github.com/acme/kit", path: "plugins/a" } },
        { yes: true },
      ),
      ["add", "acme/kit"],
    );
  });

  it("refuses any ref, a branch included", () => {
    for (const pinned of [true, false, undefined]) {
      assert.equal(
        pluginsAddArgs(
          {
            source: { url: "https://github.com/acme/kit", ref: "v1", pinned },
          },
          {},
        ),
        undefined,
      );
    }
  });
});

describe("manualInstallCommands", () => {
  it("checks out the commit a pinned approval was hashed at", () => {
    assert.deepEqual(
      manualInstallCommands({
        source: {
          url: "https://github.com/acme/kit.git",
          path: "plugins/a",
          ref: "v1.0.0",
          commit: COMMIT,
          pinned: true,
        },
        contentHash: "abc",
      }),
      [
        "git clone https://github.com/acme/kit kit",
        `git -C kit checkout ${COMMIT}`,
        "npx plugins@1.3.5 add ./kit/plugins/a",
      ],
    );
  });

  it("checks out a branch by name, so it is the branch that was approved", () => {
    assert.deepEqual(
      manualInstallCommands({
        source: {
          url: "https://git.example.org/team/kit/",
          ref: "release",
          commit: COMMIT,
          pinned: false,
        },
        contentHash: "abc",
      }),
      [
        "git clone https://git.example.org/team/kit kit",
        "git -C kit checkout release",
        "npx plugins@1.3.5 add ./kit",
      ],
    );
  });
});
