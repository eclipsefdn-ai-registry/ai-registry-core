import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { pluginsCommand, skillsCommand } from "./installCommand";
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
  it("adds nothing when the approval names no ref", () => {
    assert.equal(
      skillsCommand(skill()),
      "npx skills add anthropics/skills --skill code-review",
    );
  });

  it("leaves out --skill for a skill at the repository root", () => {
    assert.equal(
      skillsCommand(skill({ path: undefined })),
      "npx skills add anthropics/skills",
    );
  });

  // A tag can be moved after it was hashed; the commit it pointed at can't.
  it("installs the commit that was hashed for a pinned tag", () => {
    assert.equal(
      skillsCommand(skill({ ref: "v1.2.0", pinned: true, commit: COMMIT })),
      `npx skills add anthropics/skills#${COMMIT} --skill code-review`,
    );
  });

  it("installs the commit for a full commit SHA ref", () => {
    assert.equal(
      skillsCommand(skill({ ref: COMMIT, commit: COMMIT })),
      `npx skills add anthropics/skills#${COMMIT} --skill code-review`,
    );
  });

  // A differing hash is what makes approvedTarget read a ref the feed doesn't
  // classify as a pin.
  it("installs the commit for an unclassified ref whose hash has changed", () => {
    assert.equal(
      skillsCommand(
        skill({ ref: "v1.2.0", commit: COMMIT }, { latestHash: OTHER_HASH }),
      ),
      `npx skills add anthropics/skills#${COMMIT} --skill code-review`,
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
      "npx skills add anthropics/skills#release/1.x --skill code-review",
    );
  });

  // Without source.pinned an unchanged v1.2.0 could still be a branch.
  it("targets a ref the feed doesn't classify as given", () => {
    assert.equal(
      skillsCommand(skill({ ref: "v1.2.0", commit: COMMIT })),
      "npx skills add anthropics/skills#v1.2.0 --skill code-review",
    );
  });

  it("falls back to the ref for a pin in a feed without source.commit", () => {
    assert.equal(
      skillsCommand(skill({ ref: "v1.2.0", pinned: true })),
      "npx skills add anthropics/skills#v1.2.0 --skill code-review",
    );
  });

  it("targets a ref at the repository root", () => {
    assert.equal(
      skillsCommand(skill({ path: undefined, ref: "v1.2.0" })),
      "npx skills add anthropics/skills#v1.2.0",
    );
  });

  it("targets a ref on a nested gitlab.com group", () => {
    assert.equal(
      skillsCommand(
        skill({
          url: "https://gitlab.com/gitlab-org/ai/skills.git",
          ref: "v1.2.0",
        }),
      ),
      "npx skills add https://gitlab.com/gitlab-org/ai/skills#v1.2.0 --skill code-review",
    );
  });

  // The CLI reads the fragment only after a URL it recognises as git, and the
  // .git that would make it recognisable here is stripped. Git over HTTP drops
  // the fragment, so the command would install the default branch.
  it("offers no command for a ref on a host the CLI can't target", () => {
    assert.equal(
      skillsCommand(
        skill({ url: "https://git.example.com/acme/kits.git", ref: "v1.2.0" }),
      ),
      undefined,
    );
  });

  it("still offers a command on that host when there is no ref", () => {
    assert.equal(
      skillsCommand(skill({ url: "https://git.example.com/acme/kits.git" })),
      "npx skills add https://git.example.com/acme/kits --skill code-review",
    );
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
