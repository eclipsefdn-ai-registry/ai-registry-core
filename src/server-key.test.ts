import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { derivedServerKey } from "./server-key.js";
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
