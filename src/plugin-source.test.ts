import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { execSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parsePluginManifest,
  parseMcpServers,
  normalizePluginPath,
  pluginCloneKey,
  stripPathPrefix,
  fetchPluginManifest,
} from "./plugin-source.js";

// --- normalizePluginPath ---

describe("normalizePluginPath", () => {
  it("strips a single trailing slash", () => {
    assert.equal(normalizePluginPath("pluginA/"), "pluginA");
  });

  it("strips multiple trailing slashes", () => {
    assert.equal(normalizePluginPath("pluginA//"), "pluginA");
  });

  it("leaves a path without a trailing slash unchanged", () => {
    assert.equal(normalizePluginPath("pluginA"), "pluginA");
  });

  it("leaves a nested path without a trailing slash unchanged", () => {
    assert.equal(normalizePluginPath("plugins/my-plugin"), "plugins/my-plugin");
  });

  it("strips a trailing slash from a nested path", () => {
    assert.equal(
      normalizePluginPath("plugins/my-plugin/"),
      "plugins/my-plugin",
    );
  });

  it("returns undefined unchanged", () => {
    assert.equal(normalizePluginPath(undefined), undefined);
  });
});

// --- stripPathPrefix ---

describe("stripPathPrefix", () => {
  it("strips a simple single-segment prefix", () => {
    assert.equal(
      stripPathPrefix("my-plugin/skills/alpha", "my-plugin"),
      "skills/alpha",
    );
  });

  it("strips a nested prefix", () => {
    assert.equal(
      stripPathPrefix("plugins/my-plugin/skills/alpha", "plugins/my-plugin"),
      "skills/alpha",
    );
  });

  it("is robust to a stray double slash in the prefix", () => {
    // A string-length-based slice would be off by one here — the prefix
    // string is longer than the segment count it actually represents.
    assert.equal(
      stripPathPrefix("sub/pluginC/skills/gamma", "sub//pluginC"),
      "skills/gamma",
    );
  });
});

// --- pluginCloneKey ---

describe("pluginCloneKey", () => {
  it("produces the same key for the same url and path", () => {
    const a = pluginCloneKey("https://github.com/example/repo.git", "a");
    const b = pluginCloneKey("https://github.com/example/repo.git", "a");
    assert.equal(a, b);
  });

  it("produces different keys for different paths in the same repo", () => {
    const a = pluginCloneKey("https://github.com/example/repo.git", "plugin-a");
    const b = pluginCloneKey("https://github.com/example/repo.git", "plugin-b");
    assert.notEqual(a, b);
  });

  it("produces different keys for a root-level plugin vs a subdirectory one", () => {
    const root = pluginCloneKey(
      "https://github.com/example/repo.git",
      undefined,
    );
    const sub = pluginCloneKey(
      "https://github.com/example/repo.git",
      "plugin-a",
    );
    assert.notEqual(root, sub);
  });

  it("produces different keys for different repos with the same path", () => {
    const a = pluginCloneKey("https://github.com/example/repo-a.git", "p");
    const b = pluginCloneKey("https://github.com/example/repo-b.git", "p");
    assert.notEqual(a, b);
  });

  it("produces different keys for the same url/path with different refs", () => {
    const a = pluginCloneKey(
      "https://github.com/example/repo.git",
      "p",
      "0.1.0",
    );
    const b = pluginCloneKey(
      "https://github.com/example/repo.git",
      "p",
      "0.2.0",
    );
    assert.notEqual(a, b);
  });

  it("produces the same key when ref is omitted vs explicitly undefined", () => {
    const a = pluginCloneKey("https://github.com/example/repo.git", "p");
    const b = pluginCloneKey(
      "https://github.com/example/repo.git",
      "p",
      undefined,
    );
    assert.equal(a, b);
  });
});

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
    assert.equal(result.version, undefined);
    assert.equal(result.author, undefined);
    assert.equal(result.homepage, undefined);
    assert.equal(result.keywords, undefined);
  });

  it("throws on invalid JSON", () => {
    assert.throws(() => parsePluginManifest("not json"));
  });

  it("ignores a non-string author.name", () => {
    const content = JSON.stringify({ name: "p", author: { name: 123 } });
    const result = parsePluginManifest(content);
    assert.equal(result.author, undefined);
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

// --- fetchPluginManifest with ref ---

describe("fetchPluginManifest with ref", () => {
  it("checks out the pinned ref instead of the default branch", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "plugin-ref-test-"));
    const sourceDir = mkdtempSync(join(tmpdir(), "plugin-ref-src-"));
    try {
      execSync("git init -b main", { cwd: sourceDir, stdio: "pipe" });
      execSync('git config user.email "test@test.com"', {
        cwd: sourceDir,
        stdio: "pipe",
      });
      execSync('git config user.name "Test"', {
        cwd: sourceDir,
        stdio: "pipe",
      });

      writeFileSync(
        join(sourceDir, "plugin.json"),
        JSON.stringify({ name: "on-main", version: "2.0.0" }),
      );
      execSync("git add -A && git commit -m main", {
        cwd: sourceDir,
        stdio: "pipe",
      });

      execSync("git checkout -b v1.0.0", { cwd: sourceDir, stdio: "pipe" });
      writeFileSync(
        join(sourceDir, "plugin.json"),
        JSON.stringify({ name: "on-v1", version: "1.0.0" }),
      );
      execSync("git add -A && git commit -m v1", {
        cwd: sourceDir,
        stdio: "pipe",
      });
      execSync("git checkout main", { cwd: sourceDir, stdio: "pipe" });

      const metadata = fetchPluginManifest(
        `file://${sourceDir}`,
        undefined,
        tmpDir,
        "v1.0.0",
      );
      assert.equal(metadata.name, "on-v1");
      assert.equal(metadata.version, "1.0.0");
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
      rmSync(sourceDir, { recursive: true, force: true });
    }
  });
});
