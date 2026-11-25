import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { snapshotFor, storeRoot } from "./snapshotStore.js";

describe("storeRoot", () => {
  it("is ai-registry under an absolute XDG_DATA_HOME", () => {
    assert.equal(
      storeRoot({ XDG_DATA_HOME: "/data" }, "/home/me"),
      "/data/ai-registry",
    );
  });

  it("ignores a relative XDG_DATA_HOME, as the XDG spec says", () => {
    assert.equal(
      storeRoot({ XDG_DATA_HOME: "data" }, "/home/me"),
      "/home/me/.local/share/ai-registry",
    );
  });

  it("is ~/.local/share/ai-registry by default", () => {
    assert.equal(
      storeRoot({}, "/home/me"),
      "/home/me/.local/share/ai-registry",
    );
  });
});

describe("snapshotFor", () => {
  const COMMIT = "7b4a44e40e0112233445566778899aabbccddeef";

  it("keeps a snapshot at plugins/<id with / as -->/<commit>, staged beside it", () => {
    const snapshot = snapshotFor(
      "/store",
      {
        pluginId: "io.github.acme/notes",
        source: {
          url: "https://github.com/acme/plugins.git",
          path: "plugins/notes",
          commit: COMMIT,
        },
      },
      "a1b2c3",
    );
    assert.deepEqual(snapshot, {
      url: "https://github.com/acme/plugins.git",
      path: "plugins/notes",
      commit: COMMIT,
      stored: `/store/plugins/io.github.acme--notes/${COMMIT}`,
      staging: `/store/plugins/io.github.acme--notes/${COMMIT}.partial-a1b2c3`,
    });
  });

  it("has no path for a plugin at the repository root", () => {
    const snapshot = snapshotFor(
      "/store",
      {
        pluginId: "io.github.acme/notes",
        source: { url: "https://github.com/acme/notes", commit: COMMIT },
      },
      "x",
    );
    assert.equal(snapshot?.path, undefined);
  });

  it("is undefined without a commit, since there is nothing approved to fetch", () => {
    assert.equal(
      snapshotFor(
        "/store",
        {
          pluginId: "io.github.acme/notes",
          source: { url: "https://github.com/acme/notes" },
        },
        "x",
      ),
      undefined,
    );
  });
});
