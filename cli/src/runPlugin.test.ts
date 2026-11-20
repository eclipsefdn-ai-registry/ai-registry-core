import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  Action,
  ActionResult,
  Probe,
  ToolId,
  VsCodeProbe,
} from "./pluginTools.js";
import { run, type Deps } from "./run.js";
import type { Plugin } from "./types.js";

const COMMIT = "7b4a44e40e0112233445566778899aabbccddeef";

const NOTES: Plugin = {
  pluginId: "io.github.acme/notes",
  name: "notes",
  source: {
    url: "https://github.com/acme/plugins.git",
    path: "plugins/notes",
    ref: "main",
    pinned: false,
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
};

const STORED = `/data/ai-registry/plugins/io.github.acme--notes/${COMMIT}`;
// The staging suffix is random; the fake records it as `*`.
const STAGING = `${STORED}.partial-*`;
const unrandom = (text: string) =>
  text.replace(/\.partial-[0-9a-f]+/g, ".partial-*");

const SETTINGS = "/home/me/.config/Code/User/settings.json";
const VSCODE: VsCodeProbe = {
  userFolder: "/home/me/.config/Code/User",
  userFolderFound: true,
  settingsFile: SETTINGS,
  settings: { kind: "missing" },
  code: { found: true, output: "1.146.0\nabc123\nx64\n" },
};

const MARKETPLACE_ADD = `codex plugin marketplace add acme/plugins --ref ${COMMIT}`;
const PLUGIN_ADD = "codex plugin add notes@acme";

function writeRegistry(dir: string, plugins: Plugin[]): void {
  writeFileSync(join(dir, "plugins.json"), JSON.stringify({ plugins }));
  writeFileSync(
    join(dir, "organizations.json"),
    JSON.stringify({ organizations: [{ id: "acme", name: "Acme" }] }),
  );
}

interface Fake {
  deps: Deps;
  stderr: string[];
  probed: ToolId[][];
  executed: string[];
  questions: string[];
}

/**
 * A machine with git, codex 0.171.0, kiro-cli 3.5.0 and VS Code 1.146.0 on
 * PATH, no powers installed, no VS Code settings.json and an empty Snapshot
 * store, where every action succeeds unless
 * `fails` maps it to an error. Actions are recorded as their command line, or
 * as their kind and path.
 */
function fake(
  overrides: Partial<Deps> = {},
  {
    probe = {},
    fails = {},
  }: { probe?: Probe; fails?: Record<string, string> } = {},
): Fake {
  const stderr: string[] = [];
  const probed: ToolId[][] = [];
  const executed: string[] = [];
  const questions: string[] = [];
  return {
    stderr,
    probed,
    executed,
    questions,
    deps: {
      env: { XDG_DATA_HOME: "/data" },
      cwd: join(tmpdir(), "ai-registry-cli-no-project"),
      homeDir: join(tmpdir(), "ai-registry-cli-no-home"),
      isTTY: false,
      printErr: (line) => stderr.push(unrandom(line)),
      confirm: async (question) => {
        questions.push(question);
        return true;
      },
      runSkills: async () => {
        throw new Error("install plugin never runs the skills CLI");
      },
      probe: async (tools) => {
        probed.push(tools);
        return {
          git: true,
          codex: { found: true, output: "codex-cli 0.171.0\n" },
          kiro: { found: true, output: "kiro-cli 3.5.0\n" },
          kiroPowers: [],
          vscode: VSCODE,
          snapshotStored: false,
          ...probe,
        };
      },
      execute: async (action: Action): Promise<ActionResult> => {
        const command = unrandom(
          action.kind === "exec"
            ? action.argv.join(" ")
            : action.kind === "remove"
              ? `remove ${action.path}`
              : action.kind === "move"
                ? `move ${action.from} ${action.to}`
                : action.kind === "edit-settings"
                  ? `edit ${action.file}`
                  : action.kind,
        );
        executed.push(command);
        return command in fails
          ? { ok: false, error: fails[command] }
          : { ok: true };
      },
      ...overrides,
    },
  };
}

describe("run install plugin", () => {
  let registry: string;
  const install = (...flags: string[]) => [
    "install",
    "plugin",
    NOTES.pluginId,
    "--registry",
    registry,
    ...flags,
  ];
  beforeEach(() => {
    registry = mkdtempSync(join(tmpdir(), "ai-registry-cli-"));
    writeRegistry(registry, [NOTES]);
  });
  afterEach(() => rmSync(registry, { recursive: true, force: true }));

  it("describes the plugin, installs it into Codex at the approved commit and reports it", async () => {
    const f = fake();
    const code = await run(install("--tool", "codex", "--yes"), f.deps);
    assert.equal(code, 0);
    assert.deepEqual(f.executed, [MARKETPLACE_ADD, PLUGIN_ADD]);
    const out = f.stderr.join("\n");
    assert.match(out, /notes \(io\.github\.acme\/notes\)/);
    assert.match(
      out,
      new RegExp(
        `Source: +https://github.com/acme/plugins/tree/${COMMIT}/plugins/notes`,
      ),
    );
    assert.match(out, new RegExp(`Commit: +${COMMIT}`));
    assert.match(out, /Approved by: +Acme, 2026-01-02/);
    assert.match(out, /Guardrail: +off/);
    assert.equal(
      f.stderr.at(-1),
      "Codex: installed. Installed `notes@acme` at the approved commit. Start a new Codex session to use it.",
    );
  });

  it("fails on an id the registry doesn't hold, probing nothing", async () => {
    const f = fake();
    const code = await run(
      [
        "install",
        "plugin",
        "io.github.acme/note",
        "--registry",
        registry,
        "--tool",
        "codex",
        "--yes",
      ],
      f.deps,
    );
    assert.equal(code, 1);
    assert.deepEqual(f.probed, []);
    assert.match(
      f.stderr.join("\n"),
      /No plugin with id io\.github\.acme\/note in the registry at /,
    );
  });

  it("refuses when the guardrail does, probing and running nothing", async () => {
    const f = fake();
    const code = await run(
      install("--tool", "codex", "--yes", "--require-approval-from", "eclipse"),
      f.deps,
    );
    assert.equal(code, 1);
    assert.deepEqual(f.probed, []);
    assert.deepEqual(f.executed, []);
    assert.match(f.stderr.join("\n"), /none of eclipse approved it/);
  });

  // The menu is for a later change; until then a run names its Tools.
  it("refuses without --tool, probing nothing", async () => {
    const f = fake({ isTTY: true });
    assert.equal(await run(install("--yes"), f.deps), 1);
    assert.deepEqual(f.probed, []);
    assert.match(
      f.stderr.join("\n"),
      /--tool \(kiro, claude-code, codex, vscode\)/,
    );
  });

  describe("the verdict", () => {
    it("makes a Tool other than Claude Code unavailable for a plugin that isn't an Agent Plugin, without probing it", async () => {
      writeRegistry(registry, [{ ...NOTES, isAgentPlugin: false }]);
      const f = fake();
      const code = await run(install("--tool", "codex", "--yes"), f.deps);
      assert.equal(code, 1);
      assert.deepEqual(f.probed, [[]]);
      assert.deepEqual(f.executed, []);
      assert.equal(
        f.stderr.at(-1),
        "Codex: unavailable. This plugin isn't an Agent Plugin, so the registry offers it for Claude Code only.",
      );
    });

    it("offers Codex when the feed has no verdict", async () => {
      const { isAgentPlugin: _, ...unknown } = NOTES;
      writeRegistry(registry, [unknown]);
      const f = fake();
      assert.equal(await run(install("--tool", "codex", "--yes"), f.deps), 0);
    });
  });

  it("installs into the Tools it can and reports the others, exiting 1", async () => {
    const f = fake(
      {},
      { probe: { vscode: { ...VSCODE, userFolderFound: false } } },
    );
    const code = await run(
      install("--tool", "vscode", "--tool", "codex", "--tool", "kiro", "--yes"),
      f.deps,
    );
    assert.equal(code, 1);
    assert.deepEqual(f.executed, [
      "snapshot",
      `kiro-cli powers install ${STAGING}`,
      MARKETPLACE_ADD,
      PLUGIN_ADD,
      `remove ${STAGING}`,
    ]);
    // One line per requested Tool, those that could install first.
    assert.deepEqual(
      f.stderr.slice(-3).map((line) => line.split(".")[0]),
      ["Kiro: installed", "Codex: installed", "VS Code: unavailable"],
    );
  });

  describe("Kiro", () => {
    it("fetches a snapshot of the approved commit, installs it as a power and deletes it", async () => {
      const f = fake();
      assert.equal(await run(install("--tool", "kiro", "--yes"), f.deps), 0);
      assert.deepEqual(f.executed, [
        "snapshot",
        `kiro-cli powers install ${STAGING}`,
        `remove ${STAGING}`,
      ]);
      assert.equal(
        f.stderr.at(-1),
        "Kiro: installed. Installed power `notes`. It loads in `kiro-cli chat --v3` and the Kiro IDE.",
      );
    });

    it("probes for the store's snapshot of the approved commit", async () => {
      const f = fake();
      const probed: (string | undefined)[] = [];
      f.deps.probe = async (_tools, stored) => {
        probed.push(stored);
        return {};
      };
      await run(install("--tool", "kiro", "--yes"), f.deps);
      assert.deepEqual(probed, [STORED]);
    });

    it("installs the store's snapshot as is, fetching and deleting nothing", async () => {
      const f = fake({}, { probe: { snapshotStored: true } });
      assert.equal(await run(install("--tool", "kiro", "--yes"), f.deps), 0);
      assert.deepEqual(f.executed, [`kiro-cli powers install ${STORED}`]);
    });

    it("deletes the snapshot when the install fails", async () => {
      const f = fake(
        {},
        {
          fails: {
            [`kiro-cli powers install ${STAGING}`]: "It exited 1.\nbad power",
          },
        },
      );
      assert.equal(await run(install("--tool", "kiro", "--yes"), f.deps), 1);
      assert.equal(f.executed.at(-1), `remove ${STAGING}`);
    });

    it("fails only the Tools that need the snapshot when the fetch fails", async () => {
      const f = fake(
        {},
        { fails: { snapshot: "It exited 128.\nno such commit" } },
      );
      const code = await run(
        install("--tool", "kiro", "--tool", "codex", "--yes"),
        f.deps,
      );
      assert.equal(code, 1);
      assert.deepEqual(f.executed, [
        "snapshot",
        MARKETPLACE_ADD,
        PLUGIN_ADD,
        `remove ${STAGING}`,
      ]);
      const report = f.stderr.slice(-4);
      assert.match(report[0]!, /^Kiro: failed\. `fetch .*` failed\.$/);
      assert.deepEqual(report.slice(1), [
        "  It exited 128.",
        "  no such commit",
        "Codex: installed. Installed `notes@acme` at the approved commit. Start a new Codex session to use it.",
      ]);
    });

    it("is unavailable without git, fetching nothing, while other Tools install", async () => {
      const f = fake({}, { probe: { git: false } });
      const code = await run(
        install("--tool", "kiro", "--tool", "codex", "--yes"),
        f.deps,
      );
      assert.equal(code, 1);
      assert.deepEqual(f.executed, [MARKETPLACE_ADD, PLUGIN_ADD]);
      assert.match(f.stderr.at(-1)!, /^Kiro: unavailable\. git not found/);
    });

    it("gives the Kiro IDE's step without kiro-cli, fetching nothing and asking nothing", async () => {
      const f = fake({ isTTY: true }, { probe: { kiro: { found: false } } });
      assert.equal(await run(install("--tool", "kiro"), f.deps), 1);
      assert.deepEqual(f.executed, []);
      assert.deepEqual(f.questions, []);
      assert.match(
        f.stderr.at(-2)!,
        /^Kiro: manual step needed\. `kiro-cli` wasn't found on PATH\./,
      );
      assert.match(f.stderr.at(-1)!, /^  1\. In Kiro, open Powers → /);
    });

    it("names the fetch once in the confirmation, with where it goes and that it is deleted", async () => {
      const f = fake({ isTTY: true });
      await run(install("--tool", "kiro"), f.deps);
      const fetch = f.stderr.indexOf(
        `Fetch: plugins/notes from https://github.com/acme/plugins.git at ${COMMIT}`,
      );
      assert.notEqual(fetch, -1);
      assert.deepEqual(f.stderr.slice(fetch + 1, fetch + 4), [
        `  into ${STAGING}, deleted once the install is over`,
        "Kiro will run:",
        `  kiro-cli powers install ${STAGING}`,
      ]);
      assert.equal(
        f.stderr.filter((line) => line.startsWith("Fetch: ")).length,
        1,
      );
    });
  });

  describe("VS Code", () => {
    it("keeps the snapshot in the store and adds it to the default profile's settings", async () => {
      const f = fake();
      assert.equal(await run(install("--tool", "vscode", "--yes"), f.deps), 0);
      assert.deepEqual(f.executed, [
        "snapshot",
        `move ${STAGING} ${STORED}`,
        `edit ${SETTINGS}`,
      ]);
      assert.equal(
        f.stderr.at(-1),
        "VS Code: installed. Installed `notes` at commit `7b4a44e` in VS Code's default profile. Start a new chat to use it.",
      );
    });

    it("shares one fetch with Kiro, keeping the snapshot", async () => {
      const f = fake({ isTTY: true });
      assert.equal(
        await run(install("--tool", "vscode", "--tool", "kiro"), f.deps),
        0,
      );
      assert.deepEqual(f.executed, [
        "snapshot",
        `kiro-cli powers install ${STAGING}`,
        `move ${STAGING} ${STORED}`,
        `edit ${SETTINGS}`,
      ]);
      const fetch = f.stderr.indexOf(
        `Fetch: plugins/notes from https://github.com/acme/plugins.git at ${COMMIT}`,
      );
      assert.deepEqual(f.stderr.slice(fetch + 1, fetch + 7), [
        `  into ${STAGING}, then kept at ${STORED}`,
        "Kiro will run:",
        `  kiro-cli powers install ${STAGING}`,
        "VS Code will run:",
        `  add "${STORED}": true to chat.pluginLocations in ${SETTINGS}`,
        "  Note: Only VS Code's default profile loads it; other profiles don't.",
      ]);
      assert.equal(
        f.stderr.filter((line) => line.startsWith("Fetch: ")).length,
        1,
      );
    });

    it("fails without touching settings when the snapshot can't be moved into the store", async () => {
      const f = fake(
        {},
        { fails: { [`move ${STAGING} ${STORED}`]: "ENOTEMPTY" } },
      );
      assert.equal(
        await run(
          install("--tool", "vscode", "--tool", "kiro", "--yes"),
          f.deps,
        ),
        1,
      );
      assert.deepEqual(f.executed, [
        "snapshot",
        `kiro-cli powers install ${STAGING}`,
        `move ${STAGING} ${STORED}`,
        `remove ${STAGING}`,
      ]);
      assert.equal(
        f.stderr.at(-4),
        "Kiro: installed. Installed power `notes`. It loads in `kiro-cli chat --v3` and the Kiro IDE.",
      );
      assert.match(f.stderr.at(-3)!, /^VS Code: failed\. `fetch .*` failed\.$/);
      assert.deepEqual(f.stderr.slice(-2), [
        `  Couldn't move ${STAGING} to ${STORED}.`,
        "  ENOTEMPTY",
      ]);
    });

    it("names the entries it removes in the confirmation", async () => {
      const old = `/data/ai-registry/plugins/io.github.acme--notes/${"1".repeat(40)}`;
      const f = fake(
        { isTTY: true },
        {
          probe: {
            vscode: {
              ...VSCODE,
              settings: {
                kind: "read",
                text: JSON.stringify({
                  "chat.pluginLocations": { [old]: true },
                }),
              },
            },
          },
        },
      );
      await run(install("--tool", "vscode"), f.deps);
      assert.ok(
        f.stderr.includes(
          `  add "${STORED}": true to chat.pluginLocations in ${SETTINGS}, removing "${old}"`,
        ),
        f.stderr.join("\n"),
      );
    });

    it("keeps the snapshot and gives the entry by hand when settings.json can't be parsed", async () => {
      const f = fake(
        { isTTY: true },
        {
          probe: {
            vscode: { ...VSCODE, settings: { kind: "read", text: "{" } },
          },
        },
      );
      assert.equal(await run(install("--tool", "vscode"), f.deps), 1);
      assert.equal(f.questions.length, 1);
      assert.deepEqual(f.executed, ["snapshot", `move ${STAGING} ${STORED}`]);
      assert.match(
        f.stderr.at(-2)!,
        /^VS Code: manual step needed\. This CLI didn't edit /,
      );
      assert.equal(
        f.stderr.at(-1),
        `  1. Add \`"${STORED}": true\` to \`chat.pluginLocations\` in ${SETTINGS}, the user settings of VS Code's default profile.`,
      );
    });

    it("is already installed with the entry set and the snapshot stored, asking nothing", async () => {
      const f = fake(
        { isTTY: true },
        {
          probe: {
            snapshotStored: true,
            vscode: {
              ...VSCODE,
              settings: {
                kind: "read",
                text: JSON.stringify({
                  "chat.pluginLocations": { [STORED]: true },
                }),
              },
            },
          },
        },
      );
      assert.equal(await run(install("--tool", "vscode"), f.deps), 0);
      assert.deepEqual(f.executed, []);
      assert.deepEqual(f.questions, []);
      assert.equal(
        f.stderr.at(-1),
        "VS Code: already installed. `notes` is already installed at the approved commit in VS Code's default profile.",
      );
    });
  });

  it("reports a Tool named twice once", async () => {
    const f = fake();
    await run(install("--tool", "codex", "--tool", "codex", "--yes"), f.deps);
    assert.deepEqual(f.executed, [MARKETPLACE_ADD, PLUGIN_ADD]);
    assert.equal(f.stderr.filter((l) => l.startsWith("Codex: ")).length, 1);
  });

  describe("confirmation", () => {
    it("asks once on a terminal, listing every command first", async () => {
      const f = fake({ isTTY: true });
      assert.equal(await run(install("--tool", "codex"), f.deps), 0);
      assert.equal(f.questions.length, 1);
      const asked = f.stderr.indexOf("Codex will run:");
      assert.deepEqual(f.stderr.slice(asked, asked + 3), [
        "Codex will run:",
        `  ${MARKETPLACE_ADD}`,
        `  ${PLUGIN_ADD}`,
      ]);
    });

    it("lists the Tools that won't install alongside", async () => {
      const f = fake(
        { isTTY: true },
        { probe: { vscode: { ...VSCODE, userFolderFound: false } } },
      );
      await run(install("--tool", "codex", "--tool", "vscode"), f.deps);
      assert.ok(
        f.stderr.includes(
          "VS Code can't install it: VS Code's user settings folder wasn't found at `/home/me/.config/Code/User`.",
        ),
      );
    });

    it("skips the question with --yes", async () => {
      const f = fake({ isTTY: true });
      assert.equal(await run(install("--tool", "codex", "--yes"), f.deps), 0);
      assert.deepEqual(f.questions, []);
    });

    it("refuses without a terminal and without --yes, running nothing", async () => {
      const f = fake({ isTTY: false });
      assert.equal(await run(install("--tool", "codex"), f.deps), 1);
      assert.deepEqual(f.executed, []);
      assert.match(f.stderr.join("\n"), /no terminal to confirm on.*--yes/);
    });

    it("runs nothing when the user declines", async () => {
      const f = fake({ isTTY: true, confirm: async () => false });
      assert.equal(await run(install("--tool", "codex"), f.deps), 1);
      assert.deepEqual(f.executed, []);
      assert.match(f.stderr.join("\n"), /Nothing was installed\./);
    });

    it("isn't asked when nothing would run", async () => {
      const f = fake({ isTTY: true }, { probe: { codex: { found: false } } });
      assert.equal(await run(install("--tool", "codex"), f.deps), 1);
      assert.deepEqual(f.questions, []);
      assert.deepEqual(f.executed, []);
    });
  });

  it("reports the steps when codex can't run them, exiting 1", async () => {
    const f = fake(
      {},
      { probe: { codex: { found: true, output: "codex-cli 0.130.0" } } },
    );
    assert.equal(await run(install("--tool", "codex", "--yes"), f.deps), 1);
    assert.deepEqual(f.executed, []);
    assert.deepEqual(f.stderr.slice(-3), [
      "Codex: manual step needed. Upgrade Codex to 0.131.0 or later, and this CLI runs these for you.",
      `  1. ${MARKETPLACE_ADD}`,
      `  2. ${PLUGIN_ADD}`,
    ]);
  });

  it("stops a Tool at its failed command and reports it with its stderr", async () => {
    const f = fake(
      {},
      { fails: { [MARKETPLACE_ADD]: "It exited 1.\nerror: no such ref\n" } },
    );
    assert.equal(await run(install("--tool", "codex", "--yes"), f.deps), 1);
    assert.deepEqual(f.executed, [MARKETPLACE_ADD]);
    assert.deepEqual(f.stderr.slice(-3), [
      `Codex: failed. \`${MARKETPLACE_ADD}\` failed.`,
      "  It exited 1.",
      "  error: no such ref",
    ]);
  });

  describe("usage", () => {
    for (const [what, flags, message] of [
      [
        "an unknown --tool",
        ["--tool", "cursor"],
        /Unknown tool cursor: --tool takes kiro, claude-code, codex, vscode\./,
      ],
      [
        "--agent",
        ["--tool", "codex", "--agent", "codex"],
        /--agent and --global are for install skill/,
      ],
      [
        "--global",
        ["--tool", "codex", "--global"],
        /--agent and --global are for install skill/,
      ],
    ] as const) {
      it(`rejects ${what} with the usage text`, async () => {
        const f = fake();
        assert.equal(await run(install(...flags), f.deps), 1);
        assert.deepEqual(f.probed, []);
        const out = f.stderr.join("\n");
        assert.match(out, message);
        assert.match(out, /Usage: ai-registry install skill <id>/);
      });
    }

    it("rejects --tool for install skill", async () => {
      const f = fake();
      const code = await run(
        ["install", "skill", "some/id", "--tool", "codex"],
        f.deps,
      );
      assert.equal(code, 1);
      assert.match(f.stderr.join("\n"), /--tool is for install plugin/);
    });

    it("documents install plugin in --help", async () => {
      const f = fake();
      assert.equal(await run(["--help"], f.deps), 0);
      const out = f.stderr.join("\n");
      assert.match(out, /ai-registry install plugin <id> --tool <tool>/);
      assert.match(out, /kiro, claude-code, codex, vscode/);
    });
  });
});
