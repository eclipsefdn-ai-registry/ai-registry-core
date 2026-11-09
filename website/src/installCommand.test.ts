import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { pluginInstallOptions, skillsCommand } from "./installCommand";
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

function plugin(
  source: Partial<Plugin["source"]> = {},
  verdict: Pick<Plugin, "isAgentPlugin"> = {},
) {
  return {
    source: {
      url: "https://github.com/gemini-cli-extensions/looker.git",
      ...source,
    },
    ...verdict,
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

// The options for a plugin, keyed by tool, so each rule is asserted on its own.
function optionsFor(
  source: Partial<Plugin["source"]> = {},
  verdict: Pick<Plugin, "isAgentPlugin"> = {},
) {
  const options = pluginInstallOptions(plugin(source, verdict));
  return {
    tools: options.map((option) => option.tool),
    kiro: options.find((option) => option.tool === "kiro"),
    npxPlugins: options.find((option) => option.tool === "npx-plugins"),
  };
}

function kiroFor(link: string) {
  return {
    tool: "kiro",
    label: "Install in Kiro",
    steps: [
      {
        kind: "paste",
        app: "Kiro",
        action: "Powers → Add Custom Power → Import power from GitHub",
        value: link,
      },
    ],
    warnings: [],
  };
}

function npxPluginsUnavailable(ref: string) {
  return {
    tool: "npx-plugins",
    label: "Install in other agents",
    unavailable: `Installing the approved version isn't currently possible with \`npx plugins add\`. This approval names \`${ref}\`, and the plugins CLI always installs from the repository's default branch.`,
    warnings: [],
  };
}

const AGENT_PLUGIN = { isAgentPlugin: true };
const NOT_AGENT_PLUGIN = { isAgentPlugin: false };

describe("pluginInstallOptions", () => {
  it("lists Kiro first, then npx plugins, for a feed without the verdict", () => {
    assert.deepEqual(optionsFor({ commit: COMMIT }).tools, [
      "kiro",
      "npx-plugins",
    ]);
  });

  it("offers only Kiro for an Agent Plugin", () => {
    assert.deepEqual(optionsFor({ commit: COMMIT }, AGENT_PLUGIN).tools, [
      "kiro",
    ]);
  });

  it("offers only npx plugins for a plugin that isn't an Agent Plugin", () => {
    assert.deepEqual(optionsFor({ commit: COMMIT }, NOT_AGENT_PLUGIN).tools, [
      "npx-plugins",
    ]);
  });

  describe("npx plugins", () => {
    const command = {
      tool: "npx-plugins",
      label: "Install in other agents",
      steps: [
        {
          kind: "command",
          lead: "For other agents, this plugin might be installable with:",
          command: "npx plugins add gemini-cli-extensions/looker",
        },
      ],
      warnings: [],
    };

    it("offers a command when the approval names no ref", () => {
      assert.deepEqual(optionsFor({}, NOT_AGENT_PLUGIN).npxPlugins, command);
    });

    // An older feed has no verdict, which is unknown rather than false, so it
    // keeps the command it always had.
    it("offers a command in a feed without the verdict", () => {
      assert.deepEqual(optionsFor().npxPlugins, command);
    });

    // An Agent Plugin has tools that install it at the approved commit.
    it("is not offered for an Agent Plugin", () => {
      assert.equal(optionsFor({}, AGENT_PLUGIN).npxPlugins, undefined);
    });

    it("offers no command for a tag, and says why", () => {
      assert.deepEqual(
        optionsFor({ ref: "0.3.10", pinned: true }, NOT_AGENT_PLUGIN)
          .npxPlugins,
        npxPluginsUnavailable("0.3.10"),
      );
    });

    // The CLI would clone the default branch, which is not the branch named.
    it("offers no command for a branch", () => {
      assert.deepEqual(
        optionsFor({ ref: "release-1.x", pinned: false }, NOT_AGENT_PLUGIN)
          .npxPlugins,
        npxPluginsUnavailable("release-1.x"),
      );
    });

    it("offers no command for a ref the feed hasn't classified", () => {
      assert.deepEqual(
        optionsFor({ ref: "0.3.10" }).npxPlugins,
        npxPluginsUnavailable("0.3.10"),
      );
    });

    it("says nothing about a ref for an Agent Plugin", () => {
      assert.equal(
        optionsFor({ ref: "0.3.10", pinned: true }, AGENT_PLUGIN).npxPlugins,
        undefined,
      );
    });
  });

  describe("Kiro", () => {
    it("points at the plugin's folder at the approved commit", () => {
      const [kiro] = pluginInstallOptions({
        source: {
          url: "https://github.com/aws/agent-toolkit-for-aws.git",
          path: "plugins/aws-agents",
          commit: COMMIT,
        },
        ...AGENT_PLUGIN,
      });
      assert.deepEqual(
        kiro,
        kiroFor(
          `https://github.com/aws/agent-toolkit-for-aws/tree/${COMMIT}/plugins/aws-agents`,
        ),
      );
    });

    // Unlike npx plugins, a ref doesn't stop it, and a tag goes over as the
    // commit it was hashed at, since a tag can be moved.
    it("pins a plugin approved at a tag to its commit", () => {
      assert.deepEqual(
        optionsFor(
          { ref: "0.3.11", pinned: true, commit: COMMIT },
          AGENT_PLUGIN,
        ).kiro,
        kiroFor(
          `https://github.com/gemini-cli-extensions/looker/tree/${COMMIT}`,
        ),
      );
    });

    it("pins a plugin approved at a branch to its commit", () => {
      assert.deepEqual(
        optionsFor(
          { ref: "release-1.x", pinned: false, commit: COMMIT },
          AGENT_PLUGIN,
        ).kiro,
        kiroFor(
          `https://github.com/gemini-cli-extensions/looker/tree/${COMMIT}`,
        ),
      );
    });

    // Kiro won't load a plugin.json without `$schema`, and that is one of the
    // conformance checks.
    it("is not offered for a plugin that isn't an Agent Plugin", () => {
      assert.equal(
        optionsFor({ commit: COMMIT }, NOT_AGENT_PLUGIN).kiro,
        undefined,
      );
    });

    // An older feed has no verdict, which is unknown rather than false.
    it("is offered in a feed without the verdict", () => {
      assert.deepEqual(
        optionsFor({ commit: COMMIT }).kiro,
        kiroFor(
          `https://github.com/gemini-cli-extensions/looker/tree/${COMMIT}`,
        ),
      );
    });

    // Kiro's import rejects any URL that isn't on github.com.
    it("is not offered for a source on another host", () => {
      assert.equal(
        optionsFor(
          { url: "https://gitlab.com/acme/plugins.git", commit: COMMIT },
          AGENT_PLUGIN,
        ).kiro,
        undefined,
      );
    });

    // Without the commit, the link could only name a ref or HEAD, which may
    // no longer be what was approved.
    it("is not offered without source.commit", () => {
      assert.equal(optionsFor({ ref: "0.3.11" }, AGENT_PLUGIN).kiro, undefined);
    });

    // A missing verdict passes only the verdict check: the link would fail on
    // another host, and without a commit it can't name what was approved.
    it("is not offered in a feed without the verdict on another host", () => {
      assert.equal(
        optionsFor({
          url: "https://gitlab.com/acme/plugins.git",
          commit: COMMIT,
        }).kiro,
        undefined,
      );
    });

    it("is not offered in a feed without the verdict or source.commit", () => {
      assert.equal(optionsFor({ ref: "0.3.11" }).kiro, undefined);
    });
  });
});
