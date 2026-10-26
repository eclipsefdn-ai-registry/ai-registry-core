import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { kiroMcpConfigTransform } from "./kiro.js";

describe("kiroMcpConfigTransform", () => {
  it("derives a local (stdio) config, wrapped under mcpServers, keeping ${VAR} in env", () => {
    const result = kiroMcpConfigTransform(
      {
        type: "stdio",
        command: "npx",
        args: ["-y", "some-pkg", "--db=<database>"],
        env: { API_KEY: "${SOME_API_KEY}", REGION: "eu-west-1" },
      },
      "some-pkg",
    );
    assert.deepEqual(result, {
      mcpServers: {
        "some-pkg": {
          command: "npx",
          args: ["-y", "some-pkg", "--db=<database>"],
          env: { API_KEY: "${SOME_API_KEY}", REGION: "eu-west-1" },
        },
      },
    });
  });

  it("drops cwd — Kiro documents none, but the rest is still usable", () => {
    const result = kiroMcpConfigTransform(
      {
        type: "stdio",
        command: "node",
        args: ["server.js"],
        cwd: "${PLUGIN_ROOT}/dist",
      },
      "local",
    );
    assert.deepEqual(result, {
      mcpServers: { local: { command: "node", args: ["server.js"] } },
    });
  });

  it("derives a remote config with no auth", () => {
    const result = kiroMcpConfigTransform(
      { type: "streamable-http", url: "https://mcp.example.com" },
      "example",
    );
    assert.deepEqual(result, {
      mcpServers: { example: { url: "https://mcp.example.com" } },
    });
  });

  // Kiro expands ${VAR} in headers itself, so unlike Theia's transform nothing
  // is rewritten. Kiro speaks both transports from the url alone, so neither
  // emits a type.
  for (const type of ["streamable-http", "sse"] as const) {
    it(`derives a ${type} config with headers, keeping \${VAR} as written`, () => {
      const result = kiroMcpConfigTransform(
        {
          type,
          url: "https://mcp.grafana.com/mcp",
          headers: {
            Authorization: "Bearer ${GRAFANA_SERVICE_ACCOUNT_TOKEN}",
            "X-Grafana-URL": "<https://your-instance.grafana.net>",
          },
        },
        "grafana",
      );
      assert.deepEqual(result, {
        mcpServers: {
          grafana: {
            url: "https://mcp.grafana.com/mcp",
            headers: {
              Authorization: "Bearer ${GRAFANA_SERVICE_ACCOUNT_TOKEN}",
              "X-Grafana-URL": "<https://your-instance.grafana.net>",
            },
          },
        },
      });
    });
  }

  it("returns undefined for the ws transport — Kiro cannot speak it", () => {
    const result = kiroMcpConfigTransform(
      { type: "ws", url: "wss://mcp.example.com", headers: { "X-Key": "k" } },
      "example",
    );
    assert.equal(result, undefined);
  });

  // clientSecret passes through, since the Kiro CLI supports confidential
  // clients even though the IDE doesn't. authServerMetadataUrl and resource
  // have no Kiro field, so they're dropped and the rest is kept.
  it("maps oauth onto Kiro's names, dropping the fields Kiro has none for", () => {
    const result = kiroMcpConfigTransform(
      {
        type: "streamable-http",
        url: "https://mcp.example.com",
        oauth: {
          clientId: "abc",
          clientSecret: "${EXAMPLE_CLIENT_SECRET}",
          scopes: ["read", "write"],
          authServerMetadataUrl:
            "https://auth.example.com/.well-known/openid-configuration",
          resource: "https://mcp.example.com",
        },
      },
      "example",
    );
    assert.deepEqual(result, {
      mcpServers: {
        example: {
          url: "https://mcp.example.com",
          oauth: {
            clientId: "abc",
            clientSecret: "${EXAMPLE_CLIENT_SECRET}",
            oauthScopes: ["read", "write"],
          },
        },
      },
    });
  });

  it("omits unset oauth fields rather than emitting undefined", () => {
    const result = kiroMcpConfigTransform(
      {
        type: "sse",
        url: "https://mcp.example.com",
        oauth: { clientId: "abc" },
      },
      "example",
    );
    assert.deepEqual(result, {
      mcpServers: {
        example: {
          url: "https://mcp.example.com",
          oauth: { clientId: "abc" },
        },
      },
    });
  });

  // A bare oauth object means "expects OAuth, discover everything", which is
  // what Kiro does on a 401 for an entry with no oauth block.
  it("emits no oauth key for a bare oauth object", () => {
    const result = kiroMcpConfigTransform(
      { type: "streamable-http", url: "https://mcp.example.com", oauth: {} },
      "example",
    );
    assert.deepEqual(result, {
      mcpServers: { example: { url: "https://mcp.example.com" } },
    });
  });

  it("emits no oauth key when only fields Kiro has none for are set", () => {
    const result = kiroMcpConfigTransform(
      {
        type: "streamable-http",
        url: "https://mcp.example.com",
        oauth: { resource: "https://mcp.example.com" },
      },
      "example",
    );
    assert.deepEqual(result, {
      mcpServers: { example: { url: "https://mcp.example.com" } },
    });
  });

  it("carries oauth and header auth together", () => {
    const result = kiroMcpConfigTransform(
      {
        type: "streamable-http",
        url: "https://mcp.example.com",
        headers: { Authorization: "Bearer ${TOKEN}" },
        oauth: { clientId: "abc" },
      },
      "example",
    );
    assert.deepEqual(result, {
      mcpServers: {
        example: {
          url: "https://mcp.example.com",
          headers: { Authorization: "Bearer ${TOKEN}" },
          oauth: { clientId: "abc" },
        },
      },
    });
  });
});
