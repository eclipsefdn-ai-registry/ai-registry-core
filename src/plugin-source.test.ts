import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parsePluginManifest, parseMcpServers } from "./plugin-source.js";

// --- parsePluginManifest ---

describe("parsePluginManifest", () => {
  it("extracts name, description, version, author, homepage, keywords", () => {
    const content = JSON.stringify({
      $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
      name: "bigquery-data-analytics",
      version: "0.2.1",
      description: "Connect, query, and generate data insights for BigQuery.",
      author: { name: "Google LLC", email: "team@example.com" },
      homepage: "https://cloud.google.com/bigquery",
      repository:
        "https://github.com/gemini-cli-extensions/bigquery-data-analytics",
      license: "Apache-2.0",
      keywords: ["bigquery", "data-analytics"],
    });
    const result = parsePluginManifest(content);
    assert.equal(result.name, "bigquery-data-analytics");
    assert.equal(
      result.description,
      "Connect, query, and generate data insights for BigQuery.",
    );
    assert.equal(result.version, "0.2.1");
    assert.equal(result.author, "Google LLC");
    assert.equal(result.homepage, "https://cloud.google.com/bigquery");
    assert.deepEqual(result.keywords, ["bigquery", "data-analytics"]);
  });

  it("returns empty name/description when missing", () => {
    const content = JSON.stringify({
      $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
    });
    const result = parsePluginManifest(content);
    assert.equal(result.name, "");
    assert.equal(result.description, "");
  });

  it("handles a manifest with only the required fields", () => {
    const content = JSON.stringify({
      $schema: "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
      name: "minimal-plugin",
    });
    const result = parsePluginManifest(content);
    assert.equal(result.name, "minimal-plugin");
    assert.equal(result.description, "");
    assert.equal(result.version, "");
    assert.equal(result.author, "");
    assert.equal(result.homepage, "");
    assert.deepEqual(result.keywords, []);
  });

  it("throws on invalid JSON", () => {
    assert.throws(() => parsePluginManifest("not json"));
  });

  it("ignores a non-string author.name", () => {
    const content = JSON.stringify({ name: "p", author: { name: 123 } });
    const result = parsePluginManifest(content);
    assert.equal(result.author, "");
  });
});

// --- parseMcpServers ---

describe("parseMcpServers", () => {
  it("extracts server names and transport types", () => {
    const content = JSON.stringify({
      $schema: "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
      mcpServers: {
        bigquery: { type: "stdio", command: "npx" },
        remote: { type: "streamable-http", url: "https://example.com/mcp" },
      },
    });
    const result = parseMcpServers(content);
    assert.deepEqual(result, [
      { name: "bigquery", transport: "stdio" },
      { name: "remote", transport: "streamable-http" },
    ]);
  });

  it("returns an empty array when mcpServers is missing", () => {
    const result = parseMcpServers(JSON.stringify({ $schema: "x" }));
    assert.deepEqual(result, []);
  });

  it("defaults transport to an empty string when type is missing", () => {
    const content = JSON.stringify({
      mcpServers: { orphan: { command: "npx" } },
    });
    const result = parseMcpServers(content);
    assert.deepEqual(result, [{ name: "orphan", transport: "" }]);
  });

  it("throws on invalid JSON", () => {
    assert.throws(() => parseMcpServers("not json"));
  });
});
