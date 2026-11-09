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

const BASE_URL = "https://ai.open-vsx.org/";

function plugin(
  source: Partial<Plugin["source"]> = {},
  verdict: Partial<
    Pick<
      Plugin,
      | "isAgentPlugin"
      | "publishedMarketplaces"
      | "marketplaceFiles"
      | "containedMcpServers"
      | "mcpConfigFiles"
    >
  > = {},
) {
  return {
    source: {
      url: "https://github.com/gemini-cli-extensions/looker.git",
      ...source,
    },
    containedMcpServers: [],
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
  verdict: Partial<
    Pick<
      Plugin,
      | "isAgentPlugin"
      | "publishedMarketplaces"
      | "marketplaceFiles"
      | "containedMcpServers"
      | "mcpConfigFiles"
    >
  > = {},
) {
  const options = pluginInstallOptions(plugin(source, verdict), BASE_URL);
  return {
    tools: options.map((option) => option.tool),
    claudeCode: options.filter((option) => option.tool === "claude-code"),
    codex: options.find((option) => option.tool === "codex"),
    vsCode: options.find((option) => option.tool === "vscode"),
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

const GOOGLE = {
  orgId: "google",
  marketplaceName: "ai-registry-google",
  entryName: "io.github.gemini-cli-extensions.looker",
};

const ECLIPSE = {
  orgId: "eclipse-theia",
  marketplaceName: "ai-registry-eclipse-theia",
  entryName: "io.github.gemini-cli-extensions.looker",
};

function claudeCodeFor(
  listing: { marketplaceName: string; entryName: string },
  orgId: string,
  warnings: string[] = [],
) {
  return {
    tool: "claude-code",
    label: "Install in Claude Code",
    steps: [
      {
        kind: "command",
        lead: `Add the marketplace of plugins ${orgId} approved:`,
        command: `claude plugin marketplace add https://ai.open-vsx.org/api/v1/orgs/${orgId}/marketplace.json`,
      },
      {
        kind: "command",
        command: `claude plugin install ${listing.entryName}@${listing.marketplaceName}`,
      },
    ],
    warnings,
  };
}

const EVERY_PLUGIN =
  "`npx plugins add` installs every plugin in the repository, not only this one, because it takes a repository and can't select a plugin in it.";

const AGENT_PLUGIN = { isAgentPlugin: true };
const NOT_AGENT_PLUGIN = { isAgentPlugin: false };

describe("pluginInstallOptions", () => {
  it("lists Kiro, VS Code, then npx plugins, for a feed without the verdict", () => {
    assert.deepEqual(optionsFor({ commit: COMMIT }).tools, [
      "kiro",
      "vscode",
      "npx-plugins",
    ]);
  });

  it("offers Kiro and not npx plugins for an Agent Plugin", () => {
    assert.deepEqual(optionsFor({ commit: COMMIT }, AGENT_PLUGIN).tools, [
      "kiro",
      "vscode",
    ]);
  });

  it("offers npx plugins and not Kiro for a plugin that isn't an Agent Plugin", () => {
    assert.deepEqual(optionsFor({ commit: COMMIT }, NOT_AGENT_PLUGIN).tools, [
      "vscode",
      "npx-plugins",
    ]);
  });

  it("lists Kiro first, then Claude Code, VS Code and npx plugins", () => {
    assert.deepEqual(
      optionsFor({ commit: COMMIT }, { publishedMarketplaces: [GOOGLE] }).tools,
      ["kiro", "claude-code", "vscode", "npx-plugins"],
    );
  });

  describe("Claude Code", () => {
    it("installs through each organization marketplace that lists it", () => {
      assert.deepEqual(
        optionsFor(
          { commit: COMMIT },
          { ...AGENT_PLUGIN, publishedMarketplaces: [GOOGLE, ECLIPSE] },
        ).claudeCode,
        [
          claudeCodeFor(GOOGLE, "google"),
          claudeCodeFor(ECLIPSE, "eclipse-theia"),
        ],
      );
    });

    // The published entry carries the commit as `sha`, so a ref doesn't stop
    // it the way it stops npx plugins.
    it("is offered when the approval names a ref", () => {
      assert.deepEqual(
        optionsFor(
          { ref: "0.3.11", pinned: true, commit: COMMIT },
          { publishedMarketplaces: [GOOGLE] },
        ).claudeCode,
        [claudeCodeFor(GOOGLE, "google")],
      );
    });

    it("is offered whether or not the plugin is an Agent Plugin", () => {
      assert.equal(
        optionsFor(
          { commit: COMMIT },
          { ...NOT_AGENT_PLUGIN, publishedMarketplaces: [GOOGLE] },
        ).claudeCode.length,
        1,
      );
    });

    it("is not offered for a plugin no marketplace lists", () => {
      assert.deepEqual(
        optionsFor({ commit: COMMIT }, { publishedMarketplaces: [] })
          .claudeCode,
        [],
      );
    });

    // Missing means unknown, and there is no entry to name.
    it("is not offered in a feed without the listing", () => {
      assert.deepEqual(optionsFor({ commit: COMMIT }).claudeCode, []);
    });

    // Without the commit, the published entry has no sha to pin the install.
    it("is not offered without a commit", () => {
      assert.deepEqual(
        optionsFor({}, { publishedMarketplaces: [GOOGLE] }).claudeCode,
        [],
      );
    });

    // The publisher drops a commit Claude Code won't take, so there is no
    // `sha` either.
    it("is not offered for a commit shorter than a full SHA", () => {
      assert.deepEqual(
        optionsFor({ commit: "7b4a44e" }, { publishedMarketplaces: [GOOGLE] })
          .claudeCode,
        [],
      );
    });
  });

  describe("Claude Code MCP servers", () => {
    const github = { name: "github", transport: "http" };
    const actions = { name: "actions", transport: "stdio" };
    const listed = { commit: COMMIT };
    const NO_GITHUB =
      "Claude Code reads a plugin's MCP servers only from `.mcp.json` or `mcpServers` in `.claude-plugin/plugin.json`, and this plugin has neither, so the MCP server `github` won't be available there.";

    it("warns, naming the server, when there's no Claude Code MCP config", () => {
      assert.deepEqual(
        optionsFor(listed, {
          publishedMarketplaces: [GOOGLE],
          containedMcpServers: [github],
          mcpConfigFiles: [],
        }).claudeCode,
        [claudeCodeFor(GOOGLE, "google", [NO_GITHUB])],
      );
    });

    it("names every server", () => {
      assert.deepEqual(
        optionsFor(listed, {
          publishedMarketplaces: [GOOGLE],
          containedMcpServers: [github, actions],
          mcpConfigFiles: [],
        }).claudeCode[0].warnings,
        [
          "Claude Code reads a plugin's MCP servers only from `.mcp.json` or `mcpServers` in `.claude-plugin/plugin.json`, and this plugin has neither, so the MCP servers `github` and `actions` won't be available there.",
        ],
      );
    });

    it("warns on every organization's option, Agent Plugin or not", () => {
      for (const verdict of [AGENT_PLUGIN, NOT_AGENT_PLUGIN]) {
        assert.deepEqual(
          optionsFor(listed, {
            ...verdict,
            publishedMarketplaces: [GOOGLE, ECLIPSE],
            containedMcpServers: [github],
            mcpConfigFiles: [],
          }).claudeCode,
          [
            claudeCodeFor(GOOGLE, "google", [NO_GITHUB]),
            claudeCodeFor(ECLIPSE, "eclipse-theia", [NO_GITHUB]),
          ],
        );
      }
    });

    for (const file of [".mcp.json", ".claude-plugin/plugin.json"]) {
      it(`doesn't warn when the plugin has ${file}`, () => {
        assert.deepEqual(
          optionsFor(listed, {
            publishedMarketplaces: [GOOGLE],
            containedMcpServers: [github],
            mcpConfigFiles: [file],
          }).claudeCode[0].warnings,
          [],
        );
      });
    }

    it("doesn't warn when the plugin has no MCP servers", () => {
      assert.deepEqual(
        optionsFor(listed, {
          publishedMarketplaces: [GOOGLE],
          mcpConfigFiles: [],
        }).claudeCode[0].warnings,
        [],
      );
    });

    // Missing means unknown, and a warning about an unknown would land on
    // every plugin with MCP servers.
    it("doesn't warn in a feed without mcpConfigFiles", () => {
      assert.deepEqual(
        optionsFor(listed, {
          publishedMarketplaces: [GOOGLE],
          containedMcpServers: [github],
        }).claudeCode[0].warnings,
        [],
      );
    });
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
      warnings: [EVERY_PLUGIN],
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
      const [kiro] = pluginInstallOptions(
        {
          source: {
            url: "https://github.com/aws/agent-toolkit-for-aws.git",
            path: "plugins/aws-agents",
            commit: COMMIT,
          },
          containedMcpServers: [],
          ...AGENT_PLUGIN,
        },
        BASE_URL,
      );
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
  describe("Codex", () => {
    const LISTED = {
      path: ".agents/plugins/marketplace.json",
      marketplaceName: "looker-plugins",
      entryName: "looker",
    };

    function codexFor(source: string) {
      return {
        tool: "codex",
        label: "Install in Codex",
        steps: [
          {
            kind: "command",
            lead: "Add the repository's marketplace at the approved commit:",
            command: `codex plugin marketplace add ${source} --ref ${COMMIT}`,
          },
          {
            kind: "command",
            command: "codex plugin add looker@looker-plugins",
          },
        ],
        warnings: [],
      };
    }

    it("adds the repository's marketplace at the commit, then the entry", () => {
      assert.deepEqual(
        optionsFor(
          { commit: COMMIT },
          { ...AGENT_PLUGIN, marketplaceFiles: [LISTED] },
        ).codex,
        codexFor("gemini-cli-extensions/looker"),
      );
    });

    // The commit pins the marketplace file, and a local entry with it.
    it("is offered when the approval names a ref", () => {
      assert.deepEqual(
        optionsFor(
          { ref: "main", pinned: false, commit: COMMIT },
          { ...AGENT_PLUGIN, marketplaceFiles: [LISTED] },
        ).codex,
        codexFor("gemini-cli-extensions/looker"),
      );
    });

    it("takes the full git URL on another host", () => {
      assert.deepEqual(
        optionsFor(
          { url: "https://gitlab.com/acme/plugins.git", commit: COMMIT },
          { ...AGENT_PLUGIN, marketplaceFiles: [LISTED] },
        ).codex,
        codexFor("https://gitlab.com/acme/plugins.git"),
      );
    });

    it("reads the Claude marketplace file when it's the first Codex finds", () => {
      const option = optionsFor(
        { commit: COMMIT },
        {
          ...AGENT_PLUGIN,
          marketplaceFiles: [
            { ...LISTED, path: ".claude-plugin/marketplace.json" },
            { path: "marketplace.json", marketplaceName: "other" },
          ],
        },
      ).codex;
      assert.ok(option && "steps" in option);
    });

    // Codex stops at the first file it finds, listing or not.
    it("is not offered when only a file Codex doesn't reach lists it", () => {
      assert.equal(
        optionsFor(
          { commit: COMMIT },
          {
            ...AGENT_PLUGIN,
            marketplaceFiles: [
              {
                path: ".agents/plugins/marketplace.json",
                marketplaceName: "a",
              },
              { ...LISTED, path: ".claude-plugin/marketplace.json" },
            ],
          },
        ).codex,
        undefined,
      );
    });

    it("is not offered when a listing is only in a file Codex never reads", () => {
      assert.equal(
        optionsFor(
          { commit: COMMIT },
          {
            ...AGENT_PLUGIN,
            marketplaceFiles: [{ ...LISTED, path: "marketplace.json" }],
          },
        ).codex,
        undefined,
      );
    });

    it("is not offered for a plugin that isn't an Agent Plugin", () => {
      assert.equal(
        optionsFor(
          { commit: COMMIT },
          { ...NOT_AGENT_PLUGIN, marketplaceFiles: [LISTED] },
        ).codex,
        undefined,
      );
    });

    it("is not offered without source.commit", () => {
      assert.equal(
        optionsFor({}, { ...AGENT_PLUGIN, marketplaceFiles: [LISTED] }).codex,
        undefined,
      );
    });

    it("is not offered in a feed without marketplaceFiles", () => {
      assert.equal(
        optionsFor({ commit: COMMIT }, AGENT_PLUGIN).codex,
        undefined,
      );
    });

    it("lists Codex after Kiro and Claude Code, and before VS Code", () => {
      assert.deepEqual(
        optionsFor(
          { commit: COMMIT },
          { publishedMarketplaces: [GOOGLE], marketplaceFiles: [LISTED] },
        ).tools,
        ["kiro", "claude-code", "codex", "vscode", "npx-plugins"],
      );
    });
  });
  describe("VS Code (GitHub Copilot)", () => {
    const LISTED = {
      path: "marketplace.json",
      marketplaceName: "looker-plugins",
      entryName: "looker",
    };

    function pinnedFor(warnings: string[] = []) {
      return {
        tool: "vscode",
        label: "Install in VS Code (GitHub Copilot)",
        steps: [
          {
            kind: "paste",
            app: "VS Code",
            action: "Command Palette → Chat: Add Marketplace",
            value: `gemini-cli-extensions/looker#${COMMIT}`,
          },
          { kind: "install", app: "VS Code", plugin: "looker" },
        ],
        warnings,
      };
    }

    function directFor(warnings: string[] = []) {
      return {
        tool: "vscode",
        label: "Install in VS Code (GitHub Copilot)",
        steps: [
          {
            kind: "paste",
            app: "VS Code",
            action: "Command Palette → Chat: Install Plugin from Source",
            value: "gemini-cli-extensions/looker",
          },
        ],
        warnings,
      };
    }

    const SUBFOLDER = { path: "plugins/looker", commit: COMMIT };

    describe("through the repository's marketplace", () => {
      it("adds the marketplace at the commit, then installs the entry", () => {
        assert.deepEqual(
          optionsFor({ commit: COMMIT }, { marketplaceFiles: [LISTED] }).vsCode,
          pinnedFor(),
        );
      });

      it("is offered for a plugin in a subfolder", () => {
        assert.deepEqual(
          optionsFor(SUBFOLDER, { marketplaceFiles: [LISTED] }).vsCode,
          pinnedFor(),
        );
      });

      // The commit pins the marketplace, and the entry inside it.
      it("is offered when the approval names a ref", () => {
        assert.deepEqual(
          optionsFor(
            { ref: "v1.0.0", pinned: true, commit: COMMIT },
            { marketplaceFiles: [LISTED] },
          ).vsCode,
          pinnedFor(),
        );
      });

      it("is offered whether or not the plugin is an Agent Plugin", () => {
        assert.deepEqual(
          optionsFor(
            { commit: COMMIT },
            { ...NOT_AGENT_PLUGIN, marketplaceFiles: [LISTED] },
          ).vsCode,
          pinnedFor(),
        );
      });

      it("reads the Claude marketplace file when it's the first VS Code finds", () => {
        assert.deepEqual(
          optionsFor(SUBFOLDER, {
            marketplaceFiles: [
              {
                path: ".agents/plugins/marketplace.json",
                marketplaceName: "a",
              },
              { ...LISTED, path: ".claude-plugin/marketplace.json" },
            ],
          }).vsCode,
          pinnedFor(),
        );
      });

      // VS Code stops at the first file it finds, listing or not.
      it("is not offered when only a file VS Code doesn't reach lists it", () => {
        assert.equal(
          optionsFor(SUBFOLDER, {
            marketplaceFiles: [
              { path: ".github/plugin/marketplace.json", marketplaceName: "a" },
              { ...LISTED, path: ".claude-plugin/marketplace.json" },
            ],
          }).vsCode,
          undefined,
        );
      });

      it("is not offered when a listing is only in a file VS Code never reads", () => {
        assert.equal(
          optionsFor(SUBFOLDER, {
            marketplaceFiles: [
              { ...LISTED, path: ".agents/plugins/marketplace.json" },
            ],
          }).vsCode,
          undefined,
        );
      });

      it("is not offered without source.commit", () => {
        assert.equal(
          optionsFor({}, { marketplaceFiles: [LISTED] }).vsCode,
          undefined,
        );
      });

      it("is not offered for a source on another host", () => {
        assert.equal(
          optionsFor(
            { url: "https://gitlab.com/acme/plugins.git", commit: COMMIT },
            { marketplaceFiles: [LISTED] },
          ).vsCode,
          undefined,
        );
      });
    });

    describe("from source", () => {
      // VS Code ignores a #<sha> here but still displays it.
      it("installs the repository with no commit, for a root plugin and no ref", () => {
        assert.deepEqual(optionsFor({ commit: COMMIT }).vsCode, directFor());
      });

      it("is offered without source.commit", () => {
        assert.deepEqual(optionsFor({}).vsCode, directFor());
      });

      it("is offered when the only marketplace file is one VS Code never reads", () => {
        assert.deepEqual(
          optionsFor(
            { commit: COMMIT },
            {
              marketplaceFiles: [
                { ...LISTED, path: ".agents/plugins/marketplace.json" },
              ],
            },
          ).vsCode,
          directFor(),
        );
      });

      it("is offered in a feed without marketplaceFiles", () => {
        assert.deepEqual(
          optionsFor({ commit: COMMIT }, { marketplaceFiles: undefined })
            .vsCode,
          directFor(),
        );
      });

      // VS Code would read the repository as that marketplace, not as the
      // plugin.
      it("is not offered when a file VS Code reads is there but doesn't list it", () => {
        assert.equal(
          optionsFor(
            { commit: COMMIT },
            {
              marketplaceFiles: [
                { path: "marketplace.json", marketplaceName: "other" },
              ],
            },
          ).vsCode,
          undefined,
        );
      });

      it("is not offered when a file VS Code reads can't be parsed", () => {
        assert.equal(
          optionsFor(
            { commit: COMMIT },
            { marketplaceFiles: [{ path: ".plugin/marketplace.json" }] },
          ).vsCode,
          undefined,
        );
      });

      it("is not offered for a plugin in a subfolder", () => {
        assert.equal(optionsFor(SUBFOLDER).vsCode, undefined);
      });

      it("is not offered when the approval names a ref", () => {
        assert.equal(
          optionsFor({ ref: "main", pinned: false, commit: COMMIT }).vsCode,
          undefined,
        );
      });

      it("is not offered for a source on another host", () => {
        assert.equal(
          optionsFor({ url: "https://gitlab.com/acme/plugins.git" }).vsCode,
          undefined,
        );
      });
    });

    describe("${PLUGIN_DATA}", () => {
      const store = {
        name: "store",
        transport: "stdio",
        usesPluginData: true as const,
      };
      const cache = { ...store, name: "cache" };
      const remote = { name: "remote", transport: "http" };

      it("warns on the marketplace form, naming the server", () => {
        assert.deepEqual(
          optionsFor(
            { commit: COMMIT },
            {
              marketplaceFiles: [LISTED],
              containedMcpServers: [store, remote],
            },
          ).vsCode,
          pinnedFor([
            "VS Code doesn't expand `${PLUGIN_DATA}`, which the MCP server `store` uses, so it may not work there.",
          ]),
        );
      });

      it("warns on the direct form, naming every server", () => {
        assert.deepEqual(
          optionsFor(
            { commit: COMMIT },
            { containedMcpServers: [store, remote, cache] },
          ).vsCode,
          directFor([
            "VS Code doesn't expand `${PLUGIN_DATA}`, which the MCP servers `store` and `cache` use, so they may not work there.",
          ]),
        );
      });

      it("doesn't warn when no server uses it", () => {
        assert.deepEqual(
          optionsFor({ commit: COMMIT }, { containedMcpServers: [remote] })
            .vsCode,
          directFor(),
        );
      });
    });
  });
});
