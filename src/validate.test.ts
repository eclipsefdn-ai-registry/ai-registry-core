import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkToolIds } from "./validate.js";

describe("checkToolIds", () => {
  const toolIds = new Set(["theia-ide", "other-tool"]);

  it("returns no warnings for valid tool IDs", () => {
    const warnings = checkToolIds(
      {
        serverId: "io.example/server",
        date: "2026-05-01",
        installConfigs: [{ tool: "theia-ide" }, { tool: "other-tool" }],
      },
      toolIds,
    );
    assert.equal(warnings.length, 0);
  });

  it("reports tool IDs not in organization", () => {
    const warnings = checkToolIds(
      {
        serverId: "io.example/server",
        date: "2026-05-01",
        installConfigs: [{ tool: "nonexistent" }],
      },
      toolIds,
    );
    assert.equal(warnings.length, 1);
    assert.ok(warnings[0].includes("nonexistent"));
  });

  it("skips installConfigs without a tool field", () => {
    const warnings = checkToolIds(
      {
        serverId: "io.example/server",
        date: "2026-05-01",
        installConfigs: [{ tool: undefined }],
      },
      toolIds,
    );
    assert.equal(warnings.length, 0);
  });

  it("reports multiple invalid tool IDs", () => {
    const warnings = checkToolIds(
      {
        serverId: "io.example/server",
        date: "2026-05-01",
        installConfigs: [
          { tool: "bad-a" },
          { tool: "theia-ide" },
          { tool: "bad-b" },
        ],
      },
      toolIds,
    );
    assert.equal(warnings.length, 2);
  });
});
