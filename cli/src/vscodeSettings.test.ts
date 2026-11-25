import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { editPluginLocations, readPluginLocations } from "./vscodeSettings.js";

const OLD =
  "/store/plugins/io.github.acme--notes/1111111111111111111111111111111111111111";
const NEW =
  "/store/plugins/io.github.acme--notes/2222222222222222222222222222222222222222";

describe("readPluginLocations", () => {
  it("reads chat.pluginLocations from settings with comments and trailing commas", () => {
    assert.deepEqual(
      readPluginLocations(
        `// mine\n{\n\t"chat.pluginLocations": {\n\t\t"${OLD}": true,\n\t\t"/own": false,\n\t},\n}\n`,
      ),
      { ok: true, locations: { [OLD]: true, "/own": false } },
    );
  });

  it("reads none from a missing, empty or comment-only file", () => {
    for (const text of [undefined, "", "  \n", "// nothing yet\n"]) {
      assert.deepEqual(readPluginLocations(text), { ok: true, locations: {} });
    }
  });

  it("reads none when the setting isn't there", () => {
    assert.deepEqual(readPluginLocations(`{"editor.fontSize": 14}`), {
      ok: true,
      locations: {},
    });
  });

  it("reports a file it can't parse", () => {
    const read = readPluginLocations(`{"editor.fontSize": 14`);
    assert.equal(read.ok, false);
    assert.match(!read.ok ? read.problem : "", /can't be parsed/);
  });

  it("reports settings that aren't an object", () => {
    const read = readPluginLocations(`[1, 2]`);
    assert.equal(read.ok, false);
    assert.match(!read.ok ? read.problem : "", /isn't a JSON object/);
  });

  it("reports a chat.pluginLocations that isn't an object", () => {
    for (const value of [`["/a"]`, `"/a"`, `null`]) {
      const read = readPluginLocations(`{"chat.pluginLocations": ${value}}`);
      assert.equal(read.ok, false, value);
      assert.match(
        !read.ok ? read.problem : "",
        /`chat\.pluginLocations` isn't an object/,
      );
    }
  });
});

describe("editPluginLocations", () => {
  it("adds the entry, keeping comments, formatting and every other setting", () => {
    const text = `// my settings\n{\n    "editor.fontSize": 14, // big\n    "chat.pluginLocations": {\n        "/own": true\n    }\n}\n`;
    assert.equal(
      editPluginLocations(text, NEW, []),
      `// my settings\n{\n    "editor.fontSize": 14, // big\n    "chat.pluginLocations": {\n        "/own": true,\n        "${NEW}": true\n    }\n}\n`,
    );
  });

  it("swaps the old entry for the new one, leaving keys outside the store alone", () => {
    const text = `{\n\t"chat.pluginLocations": {\n\t\t"/own": true,\n\t\t"${OLD}": true\n\t}\n}\n`;
    const edited = editPluginLocations(text, NEW, [OLD]);
    assert.deepEqual(readPluginLocations(edited), {
      ok: true,
      locations: { "/own": true, [NEW]: true },
    });
    assert.match(
      edited,
      /^\{\n\t"chat\.pluginLocations": \{\n\t\t"\/own": true,/,
    );
  });

  it("sets an entry that is there but false to true", () => {
    const edited = editPluginLocations(
      `{"chat.pluginLocations": {"${NEW}": false}}`,
      NEW,
      [],
    );
    assert.deepEqual(readPluginLocations(edited), {
      ok: true,
      locations: { [NEW]: true },
    });
  });

  it("creates the settings of a missing or empty file", () => {
    for (const text of [undefined, ""]) {
      assert.equal(
        editPluginLocations(text, NEW, []),
        `{\n\t"chat.pluginLocations": {\n\t\t"${NEW}": true\n\t}\n}\n`,
      );
    }
  });

  it("keeps the comments of a file with no settings yet", () => {
    assert.equal(
      editPluginLocations("// mine\n", NEW, []),
      `// mine\n{\n\t"chat.pluginLocations": {\n\t\t"${NEW}": true\n\t}\n}\n`,
    );
  });

  it("keeps Windows line endings", () => {
    const edited = editPluginLocations(`{\r\n  "a": 1\r\n}\r\n`, NEW, []);
    assert.equal(
      edited,
      `{\r\n  "a": 1,\r\n  "chat.pluginLocations": {\r\n    "${NEW}": true\r\n  }\r\n}\r\n`,
    );
  });

  it("throws on settings it can't edit, writing nothing", () => {
    assert.throws(
      () => editPluginLocations(`{"a": `, NEW, []),
      /can't be parsed/,
    );
    assert.throws(
      () => editPluginLocations(`{"chat.pluginLocations": []}`, NEW, []),
      /isn't an object/,
    );
  });
});
