import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { listedTools } from "./pluginTools.js";

// Mirrors which tools pluginInstallOptions lists per verdict in
// website/src/installCommand.ts, without `npx plugins`.
describe("listedTools", () => {
  it("lists every Tool for an Agent Plugin", () => {
    assert.deepEqual(listedTools({ isAgentPlugin: true }), [
      "kiro",
      "claude-code",
      "codex",
      "vscode",
    ]);
  });

  it("lists every Tool when the verdict is missing, which is unknown", () => {
    assert.deepEqual(listedTools({}), [
      "kiro",
      "claude-code",
      "codex",
      "vscode",
    ]);
  });

  it("lists Claude Code only for a plugin that isn't an Agent Plugin", () => {
    assert.deepEqual(listedTools({ isAgentPlugin: false }), ["claude-code"]);
  });
});
