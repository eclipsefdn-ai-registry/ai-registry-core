import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { skillsAddArgs } from "./skillsAdd.js";
import type { Skill } from "./types.js";

const COMMIT = "7b4a44e40e0112233445566778899aabbccddeef";
const HASH = "49b0db08bdaa";

function skill(source: Partial<Skill["source"]> = {}) {
  return {
    name: "code-review",
    source: {
      url: "https://github.com/anthropics/skills.git",
      path: "skills/code-review",
      ...source,
    },
    contentHash: HASH,
    latestHash: HASH,
  };
}

describe("skillsAddArgs", () => {
  it("picks the skill by name when it has a path", () => {
    assert.deepEqual(skillsAddArgs(skill(), {}), [
      "add",
      "anthropics/skills",
      "--skill",
      "code-review",
    ]);
  });

  // A tag can be moved after it was hashed; the commit it pointed at can't.
  it("installs the commit that was hashed for a pinned tag", () => {
    assert.deepEqual(
      skillsAddArgs(skill({ ref: "v1.2.0", pinned: true, commit: COMMIT }), {}),
      ["add", `anthropics/skills#${COMMIT}`, "--skill", "code-review"],
    );
  });

  it("installs a branch ref as given, so the installer keeps following it", () => {
    assert.deepEqual(
      skillsAddArgs(skill({ ref: "main", pinned: false, commit: COMMIT }), {}),
      ["add", "anthropics/skills#main", "--skill", "code-review"],
    );
  });

  // HTTP drops a URL's fragment, so the installer would quietly clone the
  // default branch: something other than what was approved.
  it("refuses a ref on a host the installer can't carry one for", () => {
    assert.equal(
      skillsAddArgs(
        skill({ url: "https://git.example.org/team/kit.git", ref: "v1.0.0" }),
        {},
      ),
      undefined,
    );
  });

  it("carries a ref on gitlab.com, nested groups included", () => {
    assert.deepEqual(
      skillsAddArgs(
        skill({ url: "https://gitlab.com/group/sub/kit", ref: "release" }),
        {},
      ),
      [
        "add",
        "https://gitlab.com/group/sub/kit#release",
        "--skill",
        "code-review",
      ],
    );
  });

  it("installs from any host when the approval names no ref", () => {
    assert.deepEqual(
      skillsAddArgs(skill({ url: "https://git.example.org/team/kit.git" }), {}),
      ["add", "https://git.example.org/team/kit", "--skill", "code-review"],
    );
  });

  it("forwards the installer options it was given", () => {
    assert.deepEqual(
      skillsAddArgs(skill({ path: undefined }), {
        yes: true,
        agents: ["claude-code", "cursor"],
        global: true,
      }),
      [
        "add",
        "anthropics/skills",
        "--agent",
        "claude-code",
        "cursor",
        "--global",
        "-y",
      ],
    );
  });
});
