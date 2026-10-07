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

  // The docs promise that notes never reach a tool's config: on a derived
  // card it arrives as the entry's instructions instead. Checked for every
  // registered transform, so a new one can't break the promise unnoticed.
  it("keeps notes out of every transform's output", () => {
    const notes = "Replace <database> with the database to connect to.";
    const configs: GenericMcpConfig[] = [
      { type: "streamable-http", url: "https://mcp.example.com", notes },
      { type: "sse", url: "https://mcp.example.com", notes },
      { type: "ws", url: "wss://mcp.example.com", notes },
      { type: "stdio", command: "npx", args: ["--db=<database>"], notes },
    ];
    for (const [tool, transform] of Object.entries(mcpConfigTransforms)) {
      for (const config of configs) {
        const result = transform(config, "example");
        assert.equal(
          JSON.stringify(result ?? {}).includes("Replace <database>"),
          false,
          `${tool} / ${config.type}`,
        );
      }
    }
  });
});
