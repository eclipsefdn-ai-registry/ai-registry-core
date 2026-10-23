import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { derivedServerKey, installedServerKey } from "./server-key.js";
import type { GenericMcpConfig } from "./mcp-config-templates/types.js";

describe("derivedServerKey", () => {
  const remote: GenericMcpConfig = {
    type: "streamable-http",
    url: "https://mcp.example.com",
  };

  it("uses the generic config's serverKey", () => {
    assert.equal(
      derivedServerKey("com.grafana/mcp-grafana", {
        ...remote,
        serverKey: "grafana",
      }),
      "grafana",
    );
  });

  // Without a serverKey, a last segment that only says "mcp" or "server"
  // gives way to the namespace.
  for (const [serverId, key] of [
    ["com.stripe/mcp", "stripe"],
    ["com.cloudflare.mcp/mcp", "cloudflare"],
    ["io.github.e2b-dev/mcp-server", "e2b-dev"],
    ["aws.api.us-east-1.ecs-mcp/server", "ecs-mcp"],
    ["io.github.grafana/mcp-grafana", "mcp-grafana"],
    ["com.Example/mcp", "example"],
    ["mcp.server/mcp-server", "mcp-server"],
    ["com.stripe./mcp", "stripe"],
  ]) {
    it(`falls back to "${key}" for ${serverId}`, () => {
      assert.equal(derivedServerKey(serverId, remote), key);
    });
  }
});

describe("installedServerKey", () => {
  const server = { url: "https://mcp.example.com" };

  it("finds the key next to other top-level keys", () => {
    assert.equal(
      installedServerKey({ inputs: [], servers: { github: server } }, [
        "servers",
      ]),
      "github",
    );
  });

  it("follows a nested path", () => {
    assert.equal(
      installedServerKey({ mcp: { servers: { github: server } } }, [
        "mcp",
        "servers",
      ]),
      "github",
    );
  });

  it("is undefined when the config has nothing at the path", () => {
    assert.equal(
      installedServerKey({ servers: { github: server } }, ["mcpServers"]),
      undefined,
    );
    assert.equal(installedServerKey({ servers: [] }, ["servers"]), undefined);
    assert.equal(installedServerKey(undefined, ["servers"]), undefined);
  });

  it("reads only the config's own properties along the path", () => {
    const inherited = Object.create({ servers: { github: server } });
    assert.equal(installedServerKey(inherited, ["servers"]), undefined);
  });

  it("is undefined when the path holds more than one server", () => {
    assert.equal(
      installedServerKey({ servers: { github: server, gitlab: server } }, [
        "servers",
      ]),
      undefined,
    );
  });
});
