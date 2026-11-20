import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { Probe, VsCodeProbe } from "./pluginTools.js";
import type { Snapshot } from "./snapshotStore.js";
import type { Plugin } from "./types.js";
import { planVsCode, vsCodeUserFolder } from "./vscodePlan.js";

const COMMIT = "7b4a44e40e0112233445566778899aabbccddeef";
const OLD_COMMIT = "1111111111111111111111111111111111111111";
const DIR = "/store/plugins/io.github.acme--notes";

const PLUGIN: Pick<Plugin, "name" | "source" | "containedMcpServers"> = {
  name: "notes",
  // a subfolder plugin on GitLab with a branch ref: none of it matters here
  source: {
    url: "https://gitlab.com/acme/plugins.git",
    path: "plugins/notes",
    ref: "main",
    commit: COMMIT,
  },
  containedMcpServers: [],
};

const SNAPSHOT: Snapshot = {
  url: PLUGIN.source.url,
  path: "plugins/notes",
  commit: COMMIT,
  stored: `${DIR}/${COMMIT}`,
  staging: `${DIR}/${COMMIT}.partial-x`,
};

const SETTINGS = "/home/me/.config/Code/User/settings.json";

const VSCODE: VsCodeProbe = {
  userFolder: "/home/me/.config/Code/User",
  userFolderFound: true,
  settingsFile: SETTINGS,
  settings: { kind: "missing" },
  code: { found: true, output: "1.146.0\nabc123\nx64\n" },
};

const READY: Probe = { git: true, vscode: VSCODE, snapshotStored: false };

const withSettings = (text: string): Probe => ({
  ...READY,
  vscode: { ...VSCODE, settings: { kind: "read", text } },
});

const plan = (
  probe: Probe = READY,
  plugin: Pick<Plugin, "name" | "source" | "containedMcpServers"> = PLUGIN,
) => planVsCode(plugin, probe, { snapshot: SNAPSHOT });

const SUCCESS =
  "Installed `notes` at commit `7b4a44e` in VS Code's default profile. Start a new chat to use it.";
const PROFILE_NOTE =
  "Only VS Code's default profile loads it; other profiles don't.";

describe("planVsCode", () => {
  it("keeps a snapshot of the approved commit and adds it to chat.pluginLocations", () => {
    assert.deepEqual(plan(), {
      kind: "run",
      actions: [
        { kind: "snapshot", snapshot: SNAPSHOT, keep: true },
        {
          kind: "edit-settings",
          file: SETTINGS,
          add: SNAPSHOT.stored,
          remove: [],
        },
      ],
      notes: [PROFILE_NOTE],
      warnings: [],
      success: SUCCESS,
    });
  });

  it("swaps every other entry of this plugin's store folder for the new one, leaving the rest", () => {
    const result = plan(
      withSettings(
        JSON.stringify({
          "chat.pluginLocations": {
            [`${DIR}/${OLD_COMMIT}`]: true,
            [`${DIR}/${COMMIT}.partial-old`]: false,
            [`${DIR}-other/${OLD_COMMIT}`]: true,
            "/home/me/my-plugin": true,
          },
        }),
      ),
    );
    assert.equal(result.kind, "run");
    assert.deepEqual(result.kind === "run" && result.actions[1], {
      kind: "edit-settings",
      file: SETTINGS,
      add: SNAPSHOT.stored,
      remove: [`${DIR}/${OLD_COMMIT}`, `${DIR}/${COMMIT}.partial-old`],
    });
  });

  it("uses the store's snapshot as is when there is one, fetching nothing", () => {
    const result = plan({ ...READY, snapshotStored: true });
    assert.deepEqual(result.kind === "run" && result.actions, [
      {
        kind: "edit-settings",
        file: SETTINGS,
        add: SNAPSHOT.stored,
        remove: [],
      },
    ]);
  });

  it("fetches the snapshot back without editing settings that already have the entry", () => {
    const result = plan(
      withSettings(
        JSON.stringify({ "chat.pluginLocations": { [SNAPSHOT.stored]: true } }),
      ),
    );
    assert.deepEqual(result.kind === "run" && result.actions, [
      { kind: "snapshot", snapshot: SNAPSHOT, keep: true },
    ]);
  });

  it("is done when the entry is set and the snapshot is in the store", () => {
    assert.deepEqual(
      plan({
        ...withSettings(
          `// mine\n{"chat.pluginLocations": {"${SNAPSHOT.stored}": true, "/own": true}}`,
        ),
        snapshotStored: true,
      }),
      {
        kind: "done",
        message:
          "`notes` is already installed at the approved commit in VS Code's default profile.",
      },
    );
  });

  it("is done without git, which it doesn't need then", () => {
    const result = plan({
      ...withSettings(
        JSON.stringify({ "chat.pluginLocations": { [SNAPSHOT.stored]: true } }),
      ),
      snapshotStored: true,
      git: false,
    });
    assert.equal(result.kind, "done");
  });

  it("isn't done while the entry is false, or an old entry is still there", () => {
    for (const locations of [
      { [SNAPSHOT.stored]: false },
      { [SNAPSHOT.stored]: true, [`${DIR}/${OLD_COMMIT}`]: true },
    ]) {
      const result = plan({
        ...withSettings(JSON.stringify({ "chat.pluginLocations": locations })),
        snapshotStored: true,
      });
      assert.equal(result.kind, "run", JSON.stringify(locations));
    }
  });

  it("accepts a code --version it can't read, or no code on PATH", () => {
    for (const code of [
      { found: false as const },
      { found: true as const, output: "" },
      { found: true as const, output: "something else" },
    ]) {
      const result = plan({ ...READY, vscode: { ...VSCODE, code } });
      assert.equal(result.kind, "run", JSON.stringify(code));
    }
  });

  it("warns, naming them, about servers whose config uses ${PLUGIN_DATA}", () => {
    const result = plan(READY, {
      ...PLUGIN,
      containedMcpServers: [
        { name: "store", usesPluginData: true },
        { name: "remote" },
        { name: "cache", usesPluginData: true },
      ],
    });
    assert.deepEqual(result.kind === "run" && result.warnings, [
      "VS Code doesn't expand `${PLUGIN_DATA}`, which the MCP servers `store` and `cache` use, so they may not work there.",
    ]);
    const one = plan(READY, {
      ...PLUGIN,
      containedMcpServers: [{ name: "store", usesPluginData: true }],
    });
    assert.deepEqual(one.kind === "run" && one.warnings, [
      "VS Code doesn't expand `${PLUGIN_DATA}`, which the MCP server `store` uses, so it may not work there.",
    ]);
  });

  describe("settings it can't edit", () => {
    it("keeps the snapshot and gives the entry to add by hand when settings.json can't be parsed", () => {
      assert.deepEqual(plan(withSettings(`{"editor.fontSize": `)), {
        kind: "manual",
        steps: [
          `Add \`"${SNAPSHOT.stored}": true\` to \`chat.pluginLocations\` in ${SETTINGS}, the user settings of VS Code's default profile.`,
        ],
        hint: `This CLI didn't edit ${SETTINGS}. It can't be parsed (ValueExpected at offset 20).`,
        actions: [{ kind: "snapshot", snapshot: SNAPSHOT, keep: true }],
      });
    });

    it("gives the entry by hand when chat.pluginLocations isn't an object", () => {
      const result = plan(
        withSettings(`{"chat.pluginLocations": ["${DIR}/${OLD_COMMIT}"]}`),
      );
      assert.equal(result.kind, "manual");
      assert.match(
        result.kind === "manual" ? (result.hint ?? "") : "",
        /`chat\.pluginLocations` isn't an object\.$/,
      );
    });

    it("gives the entry by hand when settings.json can't be read", () => {
      const result = plan({
        ...READY,
        snapshotStored: true,
        vscode: {
          ...VSCODE,
          settings: { kind: "unreadable", error: "EACCES: permission denied" },
        },
      });
      assert.deepEqual(result, {
        kind: "manual",
        steps: [
          `Add \`"${SNAPSHOT.stored}": true\` to \`chat.pluginLocations\` in ${SETTINGS}, the user settings of VS Code's default profile.`,
        ],
        hint: `This CLI didn't edit ${SETTINGS}. It couldn't be read (EACCES: permission denied).`,
        actions: [],
      });
    });
  });

  describe("unavailable", () => {
    const reasonFor = (
      probe: Probe,
      plugin?: Pick<Plugin, "name" | "source" | "containedMcpServers">,
    ) => {
      const result = plan(probe, plugin);
      return result.kind === "unavailable" ? result.reason : result.kind;
    };

    it("without a commit, as the website says", () => {
      const { commit: _, ...source } = PLUGIN.source;
      const result = planVsCode({ ...PLUGIN, source }, READY, {});
      assert.deepEqual(result, {
        kind: "unavailable",
        reason:
          "The registry has no commit recorded for this plugin, so VS Code can't be pointed at the approved version.",
      });
    });

    it("without a full commit SHA", () => {
      assert.equal(
        reasonFor(READY, {
          ...PLUGIN,
          source: { ...PLUGIN.source, commit: "7b4a44e" },
        }),
        "The registry has no full commit SHA recorded for this plugin, so VS Code can't be pointed at the approved version.",
      );
    });

    it("when VS Code's user settings folder isn't there", () => {
      assert.equal(
        reasonFor({
          ...READY,
          vscode: { ...VSCODE, userFolderFound: false },
        }),
        "VS Code's user settings folder wasn't found at `/home/me/.config/Code/User`.",
      );
    });

    it("when code --version says it is older than 1.115.0", () => {
      assert.equal(
        reasonFor({
          ...READY,
          vscode: {
            ...VSCODE,
            code: { found: true, output: "1.114.2\nabc\n" },
          },
        }),
        "Upgrade VS Code to 1.115.0 or later: older versions don't read `chat.pluginLocations`.",
      );
    });

    it("without git, unless the snapshot is in the store", () => {
      assert.equal(
        reasonFor({ ...READY, git: false, snapshotStored: true }),
        "run",
      );
      assert.equal(
        reasonFor({ ...READY, git: false }),
        "git not found: this CLI fetches the approved commit for VS Code with the git on your PATH.",
      );
    });
  });
});

describe("vsCodeUserFolder", () => {
  it("is stable VS Code's user folder on each OS", () => {
    assert.equal(
      vsCodeUserFolder("linux", {}, "/home/me"),
      "/home/me/.config/Code/User",
    );
    assert.equal(
      vsCodeUserFolder("darwin", {}, "/Users/me"),
      "/Users/me/Library/Application Support/Code/User",
    );
    assert.equal(
      vsCodeUserFolder(
        "win32",
        { APPDATA: "C:\\Users\\me\\AppData\\Roaming" },
        "C:\\Users\\me",
      ),
      "C:\\Users\\me\\AppData\\Roaming\\Code\\User",
    );
  });

  it("follows XDG_CONFIG_HOME on Linux, as VS Code does", () => {
    assert.equal(
      vsCodeUserFolder("linux", { XDG_CONFIG_HOME: "/cfg" }, "/home/me"),
      "/cfg/Code/User",
    );
  });

  it("falls back to the roaming folder under home on Windows without APPDATA", () => {
    assert.equal(
      vsCodeUserFolder("win32", {}, "C:\\Users\\me"),
      "C:\\Users\\me\\AppData\\Roaming\\Code\\User",
    );
  });
});
