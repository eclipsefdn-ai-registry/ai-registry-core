import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { installerEnv, skillsAddArgs } from "./skillsAdd.js";
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
  // The path makes the installer look only there; --skill alone would install
  // the first SKILL.md anywhere in the repository with that name.
  it("points the installer at the skill's path", () => {
    assert.deepEqual(skillsAddArgs(skill(), {}), [
      "add",
      "anthropics/skills/skills/code-review",
      "--skill",
      "code-review",
      "--full-depth",
    ]);
  });

  it("installs the approved one of two skills sharing a name", () => {
    assert.deepEqual(
      skillsAddArgs(skill({ path: ".claude/skills/code-review" }), {})?.[1],
      "anthropics/skills/.claude/skills/code-review",
    );
  });

  // Without it skills fetches some owners' files from skills.sh rather than
  // cloning the source that was printed as approved.
  it("always passes --full-depth, which skips the blob download", () => {
    assert.ok(
      skillsAddArgs(
        skill({ url: "https://github.com/vercel-labs/skills" }),
        {},
      )?.includes("--full-depth"),
    );
  });

  // --full-depth searches below a root SKILL.md too, so a skill at the root
  // needs --skill as much as one in a subdirectory.
  it("picks a skill at the repository root by name", () => {
    assert.deepEqual(skillsAddArgs(skill({ path: undefined }), {}), [
      "add",
      "anthropics/skills",
      "--skill",
      "code-review",
      "--full-depth",
    ]);
  });

  // A tag can be moved after it was hashed; the commit it pointed at can't.
  it("installs the commit that was hashed for a pinned tag", () => {
    assert.deepEqual(
      skillsAddArgs(
        skill({ ref: "v1.2.0", pinned: true, commit: COMMIT }),
        {},
      )?.[1],
      `anthropics/skills/skills/code-review#${COMMIT}`,
    );
  });

  it("installs a branch ref as given, so the installer keeps following it", () => {
    assert.deepEqual(
      skillsAddArgs(
        skill({ ref: "main", pinned: false, commit: COMMIT }),
        {},
      )?.[1],
      "anthropics/skills/skills/code-review#main",
    );
  });

  // skills reads a fragment only after a URL it recognises as git, and without
  // the .git it takes the URL for a well-known endpoint and never clones.
  it("carries a ref on any other host in a .git URL", () => {
    assert.equal(
      skillsAddArgs(
        skill({
          url: "https://git.example.org/team/kit.git",
          path: undefined,
          ref: "v1.0.0",
        }),
        {},
      )?.[1],
      "https://git.example.org/team/kit.git#v1.0.0",
    );
  });

  it("refuses a path on a host the installer can't carry one for", () => {
    assert.equal(
      skillsAddArgs(skill({ url: "https://git.example.org/team/kit.git" }), {}),
      undefined,
    );
  });

  it("installs from any other host as a .git URL", () => {
    assert.deepEqual(
      skillsAddArgs(
        skill({ url: "https://git.example.org/team/kit", path: undefined }),
        {},
      ),
      [
        "add",
        "https://git.example.org/team/kit.git",
        "--skill",
        "code-review",
        "--full-depth",
      ],
    );
  });

  // skills matches github.com/<owner>/<repo> anywhere in its argument before
  // anything else, and gitlab.com/<path> before the shorthand, so a vendored
  // path like this one would install from someorg/tool.
  it("refuses a path holding github.com/", () => {
    assert.equal(
      skillsAddArgs(skill({ path: "third_party/github.com/someorg/tool" }), {}),
      undefined,
    );
  });

  it("refuses a path holding gitlab.com/", () => {
    assert.equal(
      skillsAddArgs(skill({ path: "vendor/gitlab.com/group/tool" }), {}),
      undefined,
    );
  });

  it("refuses a gitlab.com path holding github.com/", () => {
    assert.equal(
      skillsAddArgs(
        skill({
          url: "https://gitlab.com/group/kit",
          path: "vendor/github.com/someorg/tool",
          ref: "release",
        }),
        {},
      ),
      undefined,
    );
  });

  it("refuses another host's URL holding github.com/", () => {
    assert.equal(
      skillsAddArgs(
        skill({
          url: "https://git.example.org/mirrors/github.com/someorg/tool.git",
          path: undefined,
        }),
        {},
      ),
      undefined,
    );
  });

  it("carries a ref on gitlab.com, nested groups included", () => {
    assert.equal(
      skillsAddArgs(
        skill({
          url: "https://gitlab.com/group/sub/kit",
          path: undefined,
          ref: "release",
        }),
        {},
      )?.[1],
      "https://gitlab.com/group/sub/kit#release",
    );
  });

  // gitlab.com takes a path only inside a tree URL, which needs a revision.
  it("carries a path on gitlab.com in a tree URL at the ref", () => {
    assert.equal(
      skillsAddArgs(
        skill({ url: "https://gitlab.com/group/sub/kit", ref: "release" }),
        {},
      )?.[1],
      "https://gitlab.com/group/sub/kit/-/tree/release/skills/code-review",
    );
  });

  it("refuses a path on gitlab.com without a ref", () => {
    assert.equal(
      skillsAddArgs(skill({ url: "https://gitlab.com/group/sub/kit" }), {}),
      undefined,
    );
  });

  // The tree URL ends the ref at the first slash, so the rest would be read
  // as part of the path.
  it("refuses a path on gitlab.com with a ref holding a slash", () => {
    assert.equal(
      skillsAddArgs(
        skill({ url: "https://gitlab.com/group/sub/kit", ref: "release/1.x" }),
        {},
      ),
      undefined,
    );
  });

  // skills reads everything after the first # as the ref.
  it("refuses a path holding a #", () => {
    assert.equal(skillsAddArgs(skill({ path: "skills/c#" }), {}), undefined);
  });

  // skills splits a skill filter off the revision at an @.
  it("refuses a revision holding an @", () => {
    assert.equal(skillsAddArgs(skill({ ref: "team@v1" }), {}), undefined);
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
        "--skill",
        "code-review",
        "--full-depth",
        "--agent",
        "claude-code",
        "cursor",
        "--global",
        "-y",
      ],
    );
  });
});

describe("installerEnv", () => {
  // skills resolves the owner/repo shorthand against GH_HOST, so a GitHub
  // Enterprise user's would clone from a host other than the approved one.
  it("drops GH_HOST, so owner/repo resolves to github.com as printed", () => {
    assert.deepEqual(
      installerEnv({ GH_HOST: "ghe.example.com", PATH: "/usr/bin" }),
      { PATH: "/usr/bin" },
    );
  });

  // --full-depth already skips the download; this keeps a later skills from
  // taking files from anywhere but the source either.
  it("drops SKILLS_DOWNLOAD_URL, so no file comes from another host", () => {
    assert.deepEqual(
      installerEnv({
        SKILLS_DOWNLOAD_URL: "https://mirror.example",
        PATH: "/usr/bin",
      }),
      { PATH: "/usr/bin" },
    );
  });

  it("leaves the environment it was given untouched", () => {
    const env = { GH_HOST: "ghe.example.com" };
    installerEnv(env);
    assert.deepEqual(env, { GH_HOST: "ghe.example.com" });
  });
});
