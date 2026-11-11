import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { kiroPowerUrl, pluginsCommand, skillsCommand } from "./installCommand";
import type { Plugin, Skill } from "./types";

const COMMIT = "7b4a44e40e0112233445566778899aabbccddeef";
const HASH = "49b0db08bdaa";
const OTHER_HASH = "760876d07424";

function skill(
  source: Partial<Skill["source"]> = {},
  hashes: Partial<Pick<Skill, "contentHash" | "latestHash">> = {},
) {
  return {
    name: "code-review",
    source: {
      url: "https://github.com/anthropics/skills.git",
      path: "skills/code-review",
      ...source,
    },
    contentHash: HASH,
    latestHash: HASH,
    ...hashes,
  };
}

function plugin(source: Partial<Plugin["source"]> = {}) {
  return {
    source: {
      url: "https://github.com/gemini-cli-extensions/looker.git",
      ...source,
    },
  };
}

describe("skillsCommand", () => {
  // The path makes the CLI look only there; --skill alone would install the
  // first SKILL.md anywhere in the repository with that name.
  it("points the CLI at the skill's path", () => {
    assert.equal(
      skillsCommand(skill()),
      "npx skills add anthropics/skills/skills/code-review --skill code-review --full-depth",
    );
  });

  it("installs the approved one of two skills sharing a name", () => {
    assert.equal(
      skillsCommand(skill({ path: ".claude/skills/code-review" })),
      "npx skills add anthropics/skills/.claude/skills/code-review --skill code-review --full-depth",
    );
  });

  // --full-depth searches below a root SKILL.md too, so a skill at the root
  // needs --skill as much as one in a subdirectory.
  it("picks a skill at the repository root by name", () => {
    assert.equal(
      skillsCommand(skill({ path: undefined })),
      "npx skills add anthropics/skills --skill code-review --full-depth",
    );
  });

  // A tag can be moved after it was hashed; the commit it pointed at can't.
  it("installs the commit that was hashed for a pinned tag", () => {
    assert.equal(
      skillsCommand(skill({ ref: "v1.2.0", pinned: true, commit: COMMIT })),
      `npx skills add anthropics/skills/skills/code-review#${COMMIT} --skill code-review --full-depth`,
    );
  });

  it("installs the commit for a full commit SHA ref", () => {
    assert.equal(
      skillsCommand(skill({ ref: COMMIT, commit: COMMIT })),
      `npx skills add anthropics/skills/skills/code-review#${COMMIT} --skill code-review --full-depth`,
    );
  });

  // A differing hash is what makes approvedTarget read a ref the feed doesn't
  // classify as a pin.
  it("installs the commit for an unclassified ref whose hash has changed", () => {
    assert.equal(
      skillsCommand(
        skill({ ref: "v1.2.0", commit: COMMIT }, { latestHash: OTHER_HASH }),
      ),
      `npx skills add anthropics/skills/skills/code-review#${COMMIT} --skill code-review --full-depth`,
    );
  });

  // Without the fragment the CLI would clone the default branch. By name
  // rather than as the commit, because the CLI records it in its lock file,
  // so `skills update` keeps following the branch instead of freezing it.
  it("targets a branch by name", () => {
    assert.equal(
      skillsCommand(
        skill({ ref: "release/1.x", pinned: false, commit: COMMIT }),
      ),
      "npx skills add anthropics/skills/skills/code-review#release/1.x --skill code-review --full-depth",
    );
  });

  // Without source.pinned an unchanged v1.2.0 could still be a branch.
  it("targets a ref the feed doesn't classify as given", () => {
    assert.equal(
      skillsCommand(skill({ ref: "v1.2.0", commit: COMMIT })),
      "npx skills add anthropics/skills/skills/code-review#v1.2.0 --skill code-review --full-depth",
    );
  });

  it("falls back to the ref for a pin in a feed without source.commit", () => {
    assert.equal(
      skillsCommand(skill({ ref: "v1.2.0", pinned: true })),
      "npx skills add anthropics/skills/skills/code-review#v1.2.0 --skill code-review --full-depth",
    );
  });

  it("targets a ref at the repository root", () => {
    assert.equal(
      skillsCommand(skill({ path: undefined, ref: "v1.2.0" })),
      "npx skills add anthropics/skills#v1.2.0 --skill code-review --full-depth",
    );
  });

  it("targets a ref on a nested gitlab.com group", () => {
    assert.equal(
      skillsCommand(
        skill({
          url: "https://gitlab.com/gitlab-org/ai/skills.git",
          path: undefined,
          ref: "v1.2.0",
        }),
      ),
      "npx skills add https://gitlab.com/gitlab-org/ai/skills#v1.2.0 --skill code-review --full-depth",
    );
  });

  // gitlab.com takes a path only inside a tree URL, which needs a revision.
  it("targets a path on gitlab.com in a tree URL at the ref", () => {
    assert.equal(
      skillsCommand(
        skill({
          url: "https://gitlab.com/gitlab-org/ai/skills.git",
          ref: "v1.2.0",
        }),
      ),
      "npx skills add https://gitlab.com/gitlab-org/ai/skills/-/tree/v1.2.0/skills/code-review --skill code-review --full-depth",
    );
  });

  it("offers no command for a path on gitlab.com without a ref", () => {
    assert.equal(
      skillsCommand(skill({ url: "https://gitlab.com/gitlab-org/ai/skills" })),
      undefined,
    );
  });

  // The tree URL ends the ref at the first slash, so the rest would be read
  // as part of the path.
  it("offers no command for a path on gitlab.com with a ref holding a slash", () => {
    assert.equal(
      skillsCommand(
        skill({
          url: "https://gitlab.com/gitlab-org/ai/skills",
          ref: "release/1.x",
        }),
      ),
      undefined,
    );
  });

  // The CLI reads the fragment only after a URL it recognises as git, and the
  // .git that would make it recognisable here is stripped. Git over HTTP drops
  // the fragment, so the command would install the default branch.
  it("offers no command for a ref on a host the CLI can't target", () => {
    assert.equal(
      skillsCommand(
        skill({
          url: "https://git.example.com/acme/kits.git",
          path: undefined,
          ref: "v1.2.0",
        }),
      ),
      undefined,
    );
  });

  it("offers no command for a path on a host the CLI can't target", () => {
    assert.equal(
      skillsCommand(skill({ url: "https://git.example.com/acme/kits.git" })),
      undefined,
    );
  });

  it("still offers a command on that host with no path or ref", () => {
    assert.equal(
      skillsCommand(
        skill({
          url: "https://git.example.com/acme/kits.git",
          path: undefined,
        }),
      ),
      "npx skills add https://git.example.com/acme/kits --skill code-review --full-depth",
    );
  });

  // skills reads everything after the first # as the ref.
  it("offers no command for a path holding a #", () => {
    assert.equal(skillsCommand(skill({ path: "skills/c#" })), undefined);
  });

  // skills splits a skill filter off the revision at an @.
  it("offers no command for a revision holding an @", () => {
    assert.equal(skillsCommand(skill({ ref: "team@v1" })), undefined);
  });
});

describe("pluginsCommand", () => {
  it("offers a command when the approval names no ref", () => {
    assert.equal(
      pluginsCommand(plugin()),
      "npx plugins add gemini-cli-extensions/looker",
    );
  });

  it("offers no command for a tag", () => {
    assert.equal(
      pluginsCommand(plugin({ ref: "0.3.10", pinned: true })),
      undefined,
    );
  });

  // The CLI would clone the default branch, which is not the branch named.
  it("offers no command for a branch", () => {
    assert.equal(
      pluginsCommand(plugin({ ref: "release-1.x", pinned: false })),
      undefined,
    );
  });

  it("offers no command for a ref the feed hasn't classified", () => {
    assert.equal(pluginsCommand(plugin({ ref: "0.3.10" })), undefined);
  });
});

describe("kiroPowerUrl", () => {
  it("points at the plugin's folder at the approved commit", () => {
    assert.equal(
      kiroPowerUrl({
        source: {
          url: "https://github.com/aws/agent-toolkit-for-aws.git",
          path: "plugins/aws-agents",
          commit: COMMIT,
        },
      }),
      `https://github.com/aws/agent-toolkit-for-aws/tree/${COMMIT}/plugins/aws-agents`,
    );
  });

  // Unlike pluginsCommand, a ref doesn't stop it, and a tag goes over as the
  // commit it was hashed at, since a tag can be moved.
  it("pins a plugin approved at a tag to its commit", () => {
    assert.equal(
      kiroPowerUrl(plugin({ ref: "0.3.11", pinned: true, commit: COMMIT })),
      `https://github.com/gemini-cli-extensions/looker/tree/${COMMIT}`,
    );
  });
});
