import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
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
  enrichPluginMetadata,
} from "./plugin-source.js";
import { computeContentHash } from "./skill-source.js";
import { remoteBranchesLookup } from "./git-source.js";
import type { PluginEntry } from "./consolidate.js";

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

  it("checks out a full commit SHA", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "plugin-sha-test-"));
    const sourceDir = mkdtempSync(join(tmpdir(), "plugin-sha-src-"));
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
        JSON.stringify({ name: "pinned-commit", version: "1.0.0" }),
      );
      execSync("git add -A && git commit -m pinned", {
        cwd: sourceDir,
        stdio: "pipe",
      });
      const sha = execSync("git rev-parse HEAD", {
        cwd: sourceDir,
        stdio: "pipe",
      })
        .toString()
        .trim();

      writeFileSync(
        join(sourceDir, "plugin.json"),
        JSON.stringify({ name: "on-main", version: "2.0.0" }),
      );
      execSync("git add -A && git commit -m main", {
        cwd: sourceDir,
        stdio: "pipe",
      });

      const metadata = fetchPluginManifest(
        `file://${sourceDir}`,
        undefined,
        tmpDir,
        sha,
      );
      assert.equal(metadata.name, "pinned-commit");
      assert.equal(metadata.version, "1.0.0");
      assert.equal(metadata.commit, sha);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
      rmSync(sourceDir, { recursive: true, force: true });
    }
  });
});

// --- enrichPluginMetadata latestCommit and latestHash ---

describe("enrichPluginMetadata latest", () => {
  function git(dir: string, command: string): string {
    return execSync(`git ${command}`, { cwd: dir, stdio: "pipe" })
      .toString()
      .trim();
  }

  function initRepo(): string {
    const dir = mkdtempSync(join(tmpdir(), "plugin-latest-src-"));
    git(dir, "init -b main");
    git(dir, 'config user.email "test@test.com"');
    git(dir, 'config user.name "Test"');
    return dir;
  }

  function commitAll(dir: string, message: string): string {
    git(dir, "add -A");
    git(dir, `commit -m ${message}`);
    return git(dir, "rev-parse HEAD");
  }

  function writeManifest(
    dir: string,
    path: string,
    name: string,
    version: string,
  ): void {
    mkdirSync(join(dir, path), { recursive: true });
    writeFileSync(
      join(dir, path, "plugin.json"),
      JSON.stringify({ name, version }),
    );
  }

  function entry(
    pluginId: string,
    url: string,
    path?: string,
    ref?: string,
  ): PluginEntry {
    const source: PluginEntry["source"] = { url };
    if (path !== undefined) source.path = path;
    if (ref !== undefined) source.ref = ref;
    return {
      pluginId,
      name: pluginId,
      description: "",
      source,
      contentHash: "",
      containedSkills: [],
      containedMcpServers: [],
      approvals: [],
    };
  }

  it("compares each pinned plugin's own directory, not the repository", () => {
    const sourceDir = initRepo();
    try {
      writeManifest(sourceDir, "plugins/a", "a", "1.0.0");
      writeManifest(sourceDir, "plugins/b", "b", "1.0.0");
      const tagged = commitAll(sourceDir, "v1");
      git(sourceDir, "tag v1.0.0");
      writeManifest(sourceDir, "plugins/b", "b", "1.1.0");
      const tip = commitAll(sourceDir, "b-moved");

      const url = `file://${sourceDir}`;
      const [a, b, tracking] = enrichPluginMetadata(
        [
          entry("io.example/a", url, "plugins/a", "v1.0.0"),
          entry("io.example/b", url, "plugins/b", "v1.0.0"),
          entry("io.example/b-tracking", url, "plugins/b"),
        ],
        remoteBranchesLookup(),
      );

      assert.equal(a.source.commit, tagged);
      assert.equal(a.latestCommit, tip);
      assert.equal(a.latestHash, a.contentHash);

      assert.equal(b.latestCommit, tip);
      assert.notEqual(b.latestHash, b.contentHash);
      assert.equal(
        b.latestHash,
        computeContentHash(join(sourceDir, "plugins/b")),
      );

      assert.equal(tracking.latestCommit, tracking.source.commit);
      assert.equal(tracking.latestHash, tracking.contentHash);
    } finally {
      rmSync(sourceDir, { recursive: true, force: true });
    }
  });

  // Most pinned plugins in the wild sit at their repository's root, which is
  // checked out whole rather than through a sparse path. The default branch's
  // hash has to cover the same whole tree for the comparison to mean anything.
  it("hashes a pinned root plugin across the whole default branch", () => {
    const sourceDir = initRepo();
    try {
      writeManifest(sourceDir, ".", "root", "1.0.0");
      mkdirSync(join(sourceDir, "skills", "helper"), { recursive: true });
      writeFileSync(
        join(sourceDir, "skills", "helper", "SKILL.md"),
        "---\nname: helper\n---\n",
      );
      commitAll(sourceDir, "v1");
      git(sourceDir, "tag v1.0.0");
      writeFileSync(
        join(sourceDir, "skills", "helper", "SKILL.md"),
        "---\nname: helper\n---\nMore.\n",
      );
      commitAll(sourceDir, "helper-moved");

      const [root] = enrichPluginMetadata(
        [entry("io.example/root", `file://${sourceDir}`, undefined, "v1.0.0")],
        remoteBranchesLookup(),
      );
      assert.notEqual(root.latestHash, root.contentHash);
      assert.equal(root.latestHash, computeContentHash(sourceDir));
    } finally {
      rmSync(sourceDir, { recursive: true, force: true });
    }
  });
});
