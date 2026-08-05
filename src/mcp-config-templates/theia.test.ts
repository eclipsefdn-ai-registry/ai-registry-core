import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { theiaMcpConfigTransform } from "./theia.js";

describe("theiaMcpConfigTransform", () => {
  it("derives a local (stdio) config, wrapped under servers", () => {
    const result = theiaMcpConfigTransform(
      { command: "npx", args: ["-y", "some-pkg"], env: { API_KEY: "x" } },
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

  it("derives a remote config with no auth", () => {
    const result = theiaMcpConfigTransform(
      { url: "https://mcp.example.com" },
      "example",
    );
    assert.deepEqual(result, {
      servers: { example: { serverUrl: "https://mcp.example.com" } },
    });
  });

  it("derives a remote config with a single Authorization bearer header, omitting serverAuthTokenHeader", () => {
    const result = theiaMcpConfigTransform(
      {
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

  it("returns undefined for 2+ headers — can't represent, no card", () => {
    const result = theiaMcpConfigTransform(
      {
        url: "https://mcp.example.com",
        headers: { Authorization: "Bearer x", "X-Extra": "y" },
      },
      "example",
    );
    assert.equal(result, undefined);
  });

  it("returns undefined when oauth is set, even with no headers", () => {
    const result = theiaMcpConfigTransform(
      { url: "https://mcp.example.com", oauth: { clientId: "abc" } },
      "example",
    );
    assert.equal(result, undefined);
  });

  it("ignores auth entirely for local configs (auth only applies to remote)", () => {
    const result = theiaMcpConfigTransform({ command: "npx" }, "some-pkg");
    assert.deepEqual(result, {
      servers: {
        "some-pkg": { command: "npx", args: undefined, env: undefined },
      },
    });
  });
});
