import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { theiaMcpConfigTransform } from "./theia.js";

describe("theiaMcpConfigTransform", () => {
  it("derives a local (stdio) config, wrapped under servers", () => {
    const result = theiaMcpConfigTransform(
      {
        type: "stdio",
        command: "npx",
        args: ["-y", "some-pkg"],
        env: { API_KEY: "x" },
      },
      "some-pkg",
    );
    assert.deepEqual(result, {
      servers: {
        "some-pkg": {
          command: "npx",
          args: ["-y", "some-pkg"],
          env: { API_KEY: "x" },
        },
      },
    });
  });

  it("drops cwd — Theia's format has no equivalent, but the rest is still usable", () => {
    const result = theiaMcpConfigTransform(
      {
        type: "stdio",
        command: "node",
        args: ["server.js"],
        cwd: "${PLUGIN_ROOT}/dist",
      },
      "local",
    );
    assert.deepEqual(result, {
      servers: {
        local: { command: "node", args: ["server.js"], env: undefined },
      },
    });
  });

  it("returns undefined for the ws transport — Theia cannot speak it", () => {
    const result = theiaMcpConfigTransform(
      { type: "ws", url: "wss://mcp.example.com", headers: { "X-Key": "k" } },
      "example",
    );
    assert.equal(result, undefined);
  });

  it("derives a remote config with no auth", () => {
    const result = theiaMcpConfigTransform(
      { type: "streamable-http", url: "https://mcp.example.com" },
      "example",
    );
    assert.deepEqual(result, {
      servers: { example: { serverUrl: "https://mcp.example.com" } },
    });
  });

  it("derives a remote config with a single Authorization bearer header, omitting serverAuthTokenHeader", () => {
    const result = theiaMcpConfigTransform(
      {
        type: "streamable-http",
        url: "https://mcp.example.com",
        headers: { Authorization: "Bearer secret-token" },
      },
      "example",
    );
    assert.deepEqual(result, {
      servers: {
        example: {
          serverUrl: "https://mcp.example.com",
          serverAuthToken: "secret-token",
        },
      },
    });
  });

  it("derives a remote config with a single non-Authorization header, setting serverAuthTokenHeader", () => {
    const result = theiaMcpConfigTransform(
      {
        type: "streamable-http",
        url: "https://mcp.example.com",
        headers: { "X-Api-Key": "secret-token" },
      },
      "example",
    );
    assert.deepEqual(result, {
      servers: {
        example: {
          serverUrl: "https://mcp.example.com",
          serverAuthToken: "secret-token",
          serverAuthTokenHeader: "X-Api-Key",
        },
      },
    });
  });

  // Reproduces ai-registry-theia/mcp/io.github.grafana--mcp-grafana.json, which
  // was hand-written before this transform could express it.
  it("splits an Authorization header into serverAuthToken and the rest into headers", () => {
    const result = theiaMcpConfigTransform(
      {
        type: "streamable-http",
        url: "https://mcp.grafana.com/mcp",
        headers: {
          Authorization: "Bearer ${GRAFANA_SERVICE_ACCOUNT_TOKEN}",
          "X-Grafana-URL": "<https://your-instance.grafana.net>",
        },
      },
      "grafana",
    );
    assert.deepEqual(result, {
      servers: {
        grafana: {
          serverUrl: "https://mcp.grafana.com/mcp",
          serverAuthToken: "<GRAFANA_SERVICE_ACCOUNT_TOKEN>",
          headers: { "X-Grafana-URL": "<https://your-instance.grafana.net>" },
        },
      },
    });
  });

  it("matches the Authorization header case-insensitively", () => {
    const result = theiaMcpConfigTransform(
      {
        type: "streamable-http",
        url: "https://mcp.example.com",
        headers: { authorization: "Bearer secret-token" },
      },
      "example",
    );
    assert.deepEqual(result, {
      servers: {
        example: {
          serverUrl: "https://mcp.example.com",
          serverAuthToken: "secret-token",
        },
      },
    });
  });

  it("puts every header in headers when there are 2+ and none is Authorization", () => {
    const result = theiaMcpConfigTransform(
      {
        type: "streamable-http",
        url: "https://mcp.example.com",
        headers: { "X-Api-Key": "k", "X-Org-Id": "o" },
      },
      "example",
    );
    assert.deepEqual(result, {
      servers: {
        example: {
          serverUrl: "https://mcp.example.com",
          headers: { "X-Api-Key": "k", "X-Org-Id": "o" },
        },
      },
    });
  });

  it("maps every oauth field onto Theia's MCPOAuthConfig", () => {
    const result = theiaMcpConfigTransform(
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
      servers: {
        example: {
          serverUrl: "https://mcp.example.com",
          oauth: {
            clientId: "abc",
            clientSecret: "<EXAMPLE_CLIENT_SECRET>",
            scopes: ["read", "write"],
            authorizationServer:
              "https://auth.example.com/.well-known/openid-configuration",
            resource: "https://mcp.example.com",
          },
        },
      },
    });
  });

  it("omits unset oauth fields rather than emitting undefined", () => {
    const result = theiaMcpConfigTransform(
      {
        type: "streamable-http",
        url: "https://mcp.example.com",
        oauth: { clientId: "abc" },
      },
      "example",
    );
    assert.deepEqual(result, {
      servers: {
        example: {
          serverUrl: "https://mcp.example.com",
          oauth: { clientId: "abc" },
        },
      },
    });
  });

  // A bare oauth object means "expects OAuth, discover everything" — an entry
  // with no oauth block gets Theia to the same place via discovery/DCR.
  it("emits no oauth key for a bare oauth object", () => {
    const result = theiaMcpConfigTransform(
      { type: "streamable-http", url: "https://mcp.example.com", oauth: {} },
      "example",
    );
    assert.deepEqual(result, {
      servers: { example: { serverUrl: "https://mcp.example.com" } },
    });
  });

  it("carries oauth and header auth together", () => {
    const result = theiaMcpConfigTransform(
      {
        type: "streamable-http",
        url: "https://mcp.example.com",
        headers: { Authorization: "Bearer ${TOKEN}" },
        oauth: { clientId: "abc" },
      },
      "example",
    );
    assert.deepEqual(result, {
      servers: {
        example: {
          serverUrl: "https://mcp.example.com",
          serverAuthToken: "<TOKEN>",
          oauth: { clientId: "abc" },
        },
      },
    });
  });

  it("rewrites ${VAR} references to <VAR> placeholders in env", () => {
    const result = theiaMcpConfigTransform(
      {
        type: "stdio",
        command: "npx",
        args: ["-y", "some-pkg", "--prebuilt=<database>"],
        env: { API_KEY: "${SOME_API_KEY}", REGION: "eu-west-1" },
      },
      "some-pkg",
    );
    assert.deepEqual(result, {
      servers: {
        "some-pkg": {
          command: "npx",
          args: ["-y", "some-pkg", "--prebuilt=<database>"],
          env: { API_KEY: "<SOME_API_KEY>", REGION: "eu-west-1" },
        },
      },
    });
  });

  it("drops the default from a ${VAR:-default} reference", () => {
    const result = theiaMcpConfigTransform(
      {
        type: "stdio",
        command: "server",
        env: { PORT: "${PORT:-8080}" },
      },
      "local",
    );
    assert.deepEqual(result, {
      servers: {
        local: { command: "server", args: undefined, env: { PORT: "<PORT>" } },
      },
    });
  });
});
