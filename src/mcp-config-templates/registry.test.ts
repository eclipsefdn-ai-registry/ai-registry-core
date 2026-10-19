import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mcpConfigTransforms } from "./registry.js";
import { theiaMcpConfigTransform } from "./theia.js";
import type { GenericMcpConfig } from "./types.js";

describe("mcpConfigTransforms", () => {
  it("registers theiaMcpConfigTransform for both theia-ide and theia-ide-next", () => {
    assert.equal(mcpConfigTransforms["theia-ide"], theiaMcpConfigTransform);
    assert.equal(
      mcpConfigTransforms["theia-ide-next"],
      theiaMcpConfigTransform,
    );
  });

  it("has no entry for an unregistered tool id", () => {
    assert.equal(mcpConfigTransforms["some-other-tool"], undefined);
  });

  it("has no entry for vendor-controlled ids that collide with Object.prototype members", () => {
    assert.equal(mcpConfigTransforms["constructor"], undefined);
    assert.equal(mcpConfigTransforms["toString"], undefined);
    assert.equal(mcpConfigTransforms["hasOwnProperty"], undefined);
  });

  // The docs promise that notes and serverKey never reach a tool's config:
  // on a derived card notes arrives as the entry's instructions instead, and
  // serverKey only as the key the transform is given. Checked for every
  // registered transform, so a new one can't break the promise unnoticed.
  it("keeps notes and serverKey out of every transform's output", () => {
    const notes = "Replace <database> with the database to connect to.";
    const serverKey = "vendor-chosen-key";
    const configs: GenericMcpConfig[] = [
      {
        type: "streamable-http",
        url: "https://mcp.example.com",
        notes,
        serverKey,
      },
      { type: "sse", url: "https://mcp.example.com", notes, serverKey },
      { type: "ws", url: "wss://mcp.example.com", notes, serverKey },
      {
        type: "stdio",
        command: "npx",
        args: ["--db=<database>"],
        notes,
        serverKey,
      },
    ];
    for (const [tool, transform] of Object.entries(mcpConfigTransforms)) {
      for (const config of configs) {
        const json = JSON.stringify(transform(config, "example") ?? {});
        assert.equal(json.includes("Replace <database>"), false, tool);
        assert.equal(json.includes(serverKey), false, tool);
        assert.equal(json.includes("serverKey"), false, tool);
      }
    }
  });
});
