import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { planCodex } from "./codexPlan.js";
import type { CommandProbe, ToolPlan } from "./pluginTools.js";
import type { Plugin } from "./types.js";

const COMMIT = "7b4a44e40e0112233445566778899aabbccddeef";
const CODEX: CommandProbe = { found: true, output: "codex-cli 0.171.0\n" };

function plugin(overrides: Partial<Plugin> = {}): Plugin {
  return {
    pluginId: "io.github.acme/notes",
    name: "notes",
    source: {
      url: "https://github.com/acme/plugins.git",
      path: "plugins/notes",
      commit: COMMIT,
    },
    containedMcpServers: [],
    isAgentPlugin: true,
    marketplaceFiles: [
      {
        path: ".agents/plugins/marketplace.json",
        marketplaceName: "acme",
        entryName: "notes",
      },
    ],
    approvals: [{ organizationId: "acme", date: "2026-01-02" }],
    ...overrides,
  };
}

const ADD = [
  "codex",
  "plugin",
  "marketplace",
  "add",
  "acme/plugins",
  "--ref",
  COMMIT,
];
const PLUGIN_ADD = ["codex", "plugin", "add", "notes@acme"];

describe("planCodex", () => {
  it("adds the repository's marketplace at the approved commit, then the entry", () => {
    assert.deepEqual(planCodex(plugin(), CODEX), {
      kind: "run",
      actions: [
        { kind: "exec", argv: ADD },
        { kind: "exec", argv: PLUGIN_ADD },
      ],
      notes: [],
      warnings: [],
      success:
        "Installed `notes@acme` at the approved commit. Start a new Codex session to use it.",
    } satisfies ToolPlan);
  });

  // The approved commit, whatever ref the approval names: --ref pins the
  // marketplace file and its local entry with it.
  it("pins the commit when the approval tracks a branch", () => {
    const plan = planCodex(
      plugin({
        source: { ...plugin().source, ref: "main", pinned: false },
      }),
      CODEX,
    );
    assert.equal(plan.kind, "run");
    assert.deepEqual(plan.kind === "run" && plan.actions[0], {
      kind: "exec",
      argv: ADD,
    });
  });

  it("passes the git URL for a host other than github.com", () => {
    const plan = planCodex(
      plugin({
        source: { url: "https://gitlab.com/acme/plugins.git", commit: COMMIT },
      }),
      CODEX,
    );
    assert.deepEqual(plan.kind === "run" && plan.actions[0], {
      kind: "exec",
      argv: [
        "codex",
        "plugin",
        "marketplace",
        "add",
        "https://gitlab.com/acme/plugins.git",
        "--ref",
        COMMIT,
      ],
    });
  });

  it("reads the first marketplace file Codex looks for, in its order", () => {
    const plan = planCodex(
      plugin({
        marketplaceFiles: [
          {
            path: ".claude-plugin/marketplace.json",
            marketplaceName: "claude",
            entryName: "notes-claude",
          },
          {
            path: ".agents/plugins/api_marketplace.json",
            marketplaceName: "api",
            entryName: "notes-api",
          },
        ],
      }),
      CODEX,
    );
    assert.deepEqual(plan.kind === "run" && plan.actions[1], {
      kind: "exec",
      argv: ["codex", "plugin", "add", "notes-api@api"],
    });
  });

  // The website's reasons, verbatim (website/src/installCommand.ts).
  describe("unavailable", () => {
    for (const [what, overrides, reason] of [
      [
        "without a commit",
        { source: { url: "https://github.com/acme/plugins.git" } },
        "The registry has no commit recorded for this plugin, so Codex can't be pointed at the approved version.",
      ],
      [
        "in a feed without marketplace files",
        { marketplaceFiles: undefined },
        "The registry data doesn't record this repository's marketplace files, and Codex installs a plugin through one.",
      ],
      [
        "with none of the files Codex reads",
        {
          marketplaceFiles: [
            {
              path: ".github/plugin/marketplace.json",
              marketplaceName: "acme",
              entryName: "notes",
            },
          ],
        },
        "Codex installs a plugin through a marketplace file in its repository, and this repository has none of the ones Codex reads.",
      ],
      [
        "when the first file Codex reads doesn't list it",
        {
          marketplaceFiles: [
            {
              path: ".agents/plugins/marketplace.json",
              marketplaceName: "acme",
            },
            {
              path: ".claude-plugin/marketplace.json",
              marketplaceName: "claude",
              entryName: "notes",
            },
          ],
        },
        "Codex reads `.agents/plugins/marketplace.json` as this repository's marketplace file, and it doesn't list this plugin from a path in the repository.",
      ],
      [
        "when the file can't be parsed",
        {
          marketplaceFiles: [{ path: ".agents/plugins/marketplace.json" }],
        },
        "Codex reads `.agents/plugins/marketplace.json` as this repository's marketplace file, and it doesn't list this plugin from a path in the repository.",
      ],
    ] satisfies [string, Partial<Plugin>, string][]) {
      it(what, () => {
        assert.deepEqual(planCodex(plugin(overrides), CODEX), {
          kind: "unavailable",
          reason,
        });
      });
    }

    // Unavailable outranks a missing codex: following printed steps that
    // can't install the approved commit would be no better.
    it("before looking at codex itself", () => {
      assert.equal(
        planCodex(plugin({ marketplaceFiles: [] }), { found: false }).kind,
        "unavailable",
      );
    });
  });

  describe("manual, when codex can't run the steps", () => {
    const steps = [ADD.join(" "), PLUGIN_ADD.join(" ")];
    for (const [what, probe, hint] of [
      ["not on PATH", { found: false }, "`codex` wasn't found on PATH."],
      [
        "below 0.131.0",
        { found: true, output: "codex-cli 0.130.0" },
        "Upgrade Codex to 0.131.0 or later, and this CLI runs these for you.",
      ],
      [
        "with a version it can't read",
        { found: true, output: "something else" },
        "Couldn't read the Codex version from `codex --version`.",
      ],
    ] satisfies [string, CommandProbe, string][]) {
      it(what, () => {
        assert.deepEqual(planCodex(plugin(), probe), {
          kind: "manual",
          steps,
          hint,
        });
      });
    }

    it("runs at exactly 0.131.0", () => {
      assert.equal(
        planCodex(plugin(), { found: true, output: "codex-cli 0.131.0" }).kind,
        "run",
      );
    });
  });
});
