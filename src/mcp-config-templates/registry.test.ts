import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mcpConfigTransforms, toolServerKey } from "./registry.js";
import { theiaMcpConfigTransform } from "./theia.js";
import { kiroMcpConfigTransform } from "./kiro.js";
import type { GenericMcpConfig } from "./types.js";

describe("mcpConfigTransforms", () => {
  it("registers theiaMcpConfigTransform for both theia-ide and theia-ide-next", () => {
    assert.equal(mcpConfigTransforms["theia-ide"], theiaMcpConfigTransform);
    assert.equal(
      mcpConfigTransforms["theia-ide-next"],
      theiaMcpConfigTransform,
    );
  });

  it("registers kiroMcpConfigTransform for kiro", () => {
    assert.equal(mcpConfigTransforms["kiro"], kiroMcpConfigTransform);
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

describe("toolServerKey", () => {
  const server = { url: "https://mcp.example.com" };

  it("reads the key where the tool keeps its servers", () => {
    assert.equal(
      toolServerKey("theia-ide", { servers: { github: server } }),
      "github",
    );
    assert.equal(toolServerKey("kiro", { mcpServers: { aws: server } }), "aws");
  });

  it("is undefined for a tool with no known server path", () => {
    assert.equal(
      toolServerKey("other-tool", { servers: { github: server } }),
      undefined,
    );
  });

  it("is undefined for vendor-controlled ids that collide with Object.prototype members", () => {
    const config = { servers: { github: server } };
    assert.equal(toolServerKey("constructor", config), undefined);
    assert.equal(toolServerKey("toString", config), undefined);
    assert.equal(toolServerKey("hasOwnProperty", config), undefined);
  });

  // Collision checks read a derived config's key at its tool's path, so a
  // transform that stores the server anywhere else would go unchecked.
  it("finds the key in every registered transform's output", () => {
    const configs: GenericMcpConfig[] = [
      { type: "streamable-http", url: "https://mcp.example.com" },
      { type: "sse", url: "https://mcp.example.com" },
      { type: "stdio", command: "npx", args: ["example-mcp"] },
    ];
    for (const [tool, transform] of Object.entries(mcpConfigTransforms)) {
      for (const config of configs) {
        assert.equal(
          toolServerKey(tool, transform(config, "example")),
          "example",
          `${tool} ${config.type}`,
        );
      }
    }
  });
});
