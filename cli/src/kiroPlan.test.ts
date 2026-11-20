import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseKiroInstalled, planKiro } from "./kiroPlan.js";
import type { Probe } from "./pluginTools.js";
import type { Snapshot } from "./snapshotStore.js";
import type { Plugin } from "./types.js";

const COMMIT = "7b4a44e40e0112233445566778899aabbccddeef";

const PLUGIN: Pick<Plugin, "name" | "source" | "containedMcpServers"> = {
  name: "notes",
  source: {
    url: "https://github.com/acme/plugins.git",
    path: "plugins/notes",
    ref: "v1.0.0",
    commit: COMMIT,
  },
  containedMcpServers: [],
};

const SNAPSHOT: Snapshot = {
  url: "https://github.com/acme/plugins.git",
  path: "plugins/notes",
  commit: COMMIT,
  stored: `/store/plugins/io.github.acme--notes/${COMMIT}`,
  staging: `/store/plugins/io.github.acme--notes/${COMMIT}.partial-x`,
};

const READY: Probe = {
  git: true,
  kiro: { found: true, output: "kiro-cli 3.5.0\n" },
  kiroPowers: [],
  snapshotStored: false,
};

const IDE_STEP = `In Kiro, open Powers → Add Custom Power → Import power from GitHub, and enter https://github.com/acme/plugins/tree/${COMMIT}/plugins/notes`;

const ON_GITLAB = {
  ...PLUGIN,
  source: { ...PLUGIN.source, url: "https://gitlab.com/acme/plugins.git" },
};

describe("planKiro", () => {
  it("fetches the approved commit and installs it as a power, deleting the snapshot afterwards", () => {
    assert.deepEqual(planKiro(PLUGIN, READY, { snapshot: SNAPSHOT }), {
      kind: "run",
      actions: [
        { kind: "snapshot", snapshot: SNAPSHOT, keep: false },
        {
          kind: "exec",
          argv: ["kiro-cli", "powers", "install", SNAPSHOT.staging],
        },
      ],
      notes: [],
      warnings: [],
      success:
        "Installed power `notes`. It loads in `kiro-cli chat --v3` and the Kiro IDE.",
    });
  });

  it("installs from any host git can fetch, unlike the website", () => {
    const plan = planKiro(ON_GITLAB, READY, { snapshot: SNAPSHOT });
    assert.equal(plan.kind, "run");
  });

  it("installs from the store's snapshot as is when there is one, fetching nothing", () => {
    const plan = planKiro(
      PLUGIN,
      { ...READY, snapshotStored: true },
      { snapshot: SNAPSHOT },
    );
    assert.equal(plan.kind, "run");
    assert.deepEqual(plan.kind === "run" && plan.actions, [
      {
        kind: "exec",
        argv: ["kiro-cli", "powers", "install", SNAPSHOT.stored],
      },
    ]);
  });

  it("accepts a prerelease of a later version", () => {
    const plan = planKiro(
      PLUGIN,
      { ...READY, kiro: { found: true, output: "kiro-cli 3.6.0-beta.1" } },
      { snapshot: SNAPSHOT },
    );
    assert.equal(plan.kind, "run");
  });

  describe("notes", () => {
    const notesFor = (
      plugin: typeof PLUGIN,
      probe: Partial<Probe>,
    ): string[] | false => {
      const plan = planKiro(
        plugin,
        { ...READY, ...probe },
        {
          snapshot: SNAPSHOT,
        },
      );
      return plan.kind === "run" && plan.notes;
    };

    it("says it replaces an installed power of the same name", () => {
      assert.deepEqual(
        notesFor(PLUGIN, {
          kiroPowers: [{ name: "other" }, { name: "notes" }],
        }),
        ["Replaces the installed power `notes`."],
      );
    });

    it("says when the power it replaces was imported in the Kiro IDE", () => {
      assert.deepEqual(
        notesFor(PLUGIN, {
          kiroPowers: [{ name: "notes", registryId: "user-added" }],
        }),
        ["Replaces the installed power `notes` (imported in the Kiro IDE)."],
      );
    });

    it("says nothing about replacing when installed.json can't be read", () => {
      assert.deepEqual(notesFor(PLUGIN, { kiroPowers: undefined }), []);
    });

    it("names the MCP servers that start when Kiro loads the power", () => {
      assert.deepEqual(
        notesFor(
          {
            ...PLUGIN,
            containedMcpServers: [{ name: "search" }, { name: "db" }],
          },
          {},
        ),
        [
          "Its MCP servers (`search`, `db`) start automatically the next time Kiro loads the power.",
        ],
      );
    });

    it("names a single MCP server in the singular", () => {
      assert.deepEqual(
        notesFor({ ...PLUGIN, containedMcpServers: [{ name: "search" }] }, {}),
        [
          "Its MCP server (`search`) starts automatically the next time Kiro loads the power.",
        ],
      );
    });
  });

  describe("without a kiro-cli it can run", () => {
    for (const [what, kiro, hint] of [
      [
        "missing",
        { found: false },
        "`kiro-cli` wasn't found on PATH. With kiro-cli 3.0.0 or later, this CLI installs the power for you.",
      ],
      [
        "too old",
        { found: true, output: "kiro-cli 2.35.1" },
        "Upgrade kiro-cli to 3.0.0 or later, and this CLI installs the power for you.",
      ],
      [
        "unreadable",
        { found: true, output: "" },
        "Couldn't read the kiro-cli version from `kiro-cli --version`. With kiro-cli 3.0.0 or later, this CLI installs the power for you.",
      ],
    ] as const) {
      it(`gives the Kiro IDE's import step on github.com when kiro-cli is ${what}, fetching nothing`, () => {
        assert.deepEqual(
          planKiro(PLUGIN, { ...READY, kiro }, { snapshot: SNAPSHOT }),
          { kind: "manual", steps: [IDE_STEP], hint },
        );
      });
    }

    it("gives the IDE step without git, which it doesn't need", () => {
      const plan = planKiro(
        PLUGIN,
        { ...READY, git: false, kiro: { found: false } },
        { snapshot: SNAPSHOT },
      );
      assert.equal(plan.kind, "manual");
    });

    for (const [what, kiro, reason] of [
      [
        "missing",
        { found: false },
        "Install kiro-cli 3.0.0 or later: `kiro-cli` wasn't found on PATH, and the Kiro IDE imports powers only from github.com.",
      ],
      [
        "too old",
        { found: true, output: "kiro-cli 2.35.1" },
        "Upgrade kiro-cli to 3.0.0 or later: the Kiro IDE imports powers only from github.com.",
      ],
      [
        "unreadable",
        { found: true, output: "kiro 3.5.0" },
        "Couldn't read the kiro-cli version from `kiro-cli --version`, and the Kiro IDE imports powers only from github.com.",
      ],
    ] as const) {
      it(`is unavailable on another host when kiro-cli is ${what}`, () => {
        assert.deepEqual(
          planKiro(ON_GITLAB, { ...READY, kiro }, { snapshot: SNAPSHOT }),
          { kind: "unavailable", reason },
        );
      });
    }
  });

  it("is unavailable without git", () => {
    assert.deepEqual(
      planKiro(PLUGIN, { ...READY, git: false }, { snapshot: SNAPSHOT }),
      {
        kind: "unavailable",
        reason:
          "git not found: this CLI fetches the approved commit for Kiro with the git on your PATH.",
      },
    );
  });

  it("is unavailable without a commit, with the website's reason", () => {
    const { commit: _, ...source } = PLUGIN.source;
    assert.deepEqual(planKiro({ ...PLUGIN, source }, READY, {}), {
      kind: "unavailable",
      reason:
        "The registry has no commit recorded for this plugin, so Kiro can't be pointed at the approved version.",
    });
  });
});

describe("parseKiroInstalled", () => {
  it("reads the installed powers and where they came from", () => {
    assert.deepEqual(
      parseKiroInstalled(
        JSON.stringify({
          version: "1.0.0",
          installedPowers: [
            { name: "looker" },
            { name: "looker-plugin", registryId: "user-added" },
          ],
          dismissedAutoInstalls: [],
        }),
      ),
      [{ name: "looker" }, { name: "looker-plugin", registryId: "user-added" }],
    );
  });

  it("skips entries without a name", () => {
    assert.deepEqual(
      parseKiroInstalled(
        JSON.stringify({ installedPowers: [{ registryId: "x" }, "notes"] }),
      ),
      [],
    );
  });

  for (const [what, text] of [
    ["isn't JSON", "{"],
    ["has no installedPowers list", JSON.stringify({ version: "1.0.0" })],
    ["isn't an object", "[]"],
  ] as const) {
    it(`is undefined, meaning unknown, when the file ${what}`, () => {
      assert.equal(parseKiroInstalled(text), undefined);
    });
  }
});
