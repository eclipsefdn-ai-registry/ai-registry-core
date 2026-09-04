import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { execSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parseCodexMarketplace,
  resolveCodexEntry,
  deriveGithubOwnerRepo,
  derivePluginIdFromSource,
  fetchMarketplaceEntries,
  normalizeGithubShorthand,
} from "./marketplace-source.js";

// --- parseCodexMarketplace ---

describe("parseCodexMarketplace", () => {
  it("parses a plugins array with mixed source shapes", () => {
    const content = JSON.stringify({
      name: "google-plugins",
      interface: { displayName: "Google Plugins" },
      plugins: [
        {
          name: "alloydb",
          source: {
            source: "url",
            url: "https://github.com/gemini-cli-extensions/alloydb.git",
            ref: "0.2.0",
          },
        },
        {
          name: "google-cloud-developer",
          source: "./plugins/cloud/google-cloud-developer",
        },
      ],
    });

    const entries = parseCodexMarketplace(content);
    assert.equal(entries.length, 2);
    assert.equal(entries[0].name, "alloydb");
    assert.equal(entries[1].name, "google-cloud-developer");
  });

  it("returns an empty array when plugins is missing", () => {
    assert.deepEqual(parseCodexMarketplace(JSON.stringify({ name: "x" })), []);
  });

  it("throws on invalid JSON", () => {
    assert.throws(() => parseCodexMarketplace("not json"));
  });
});

// --- normalizeGithubShorthand ---

describe("normalizeGithubShorthand", () => {
  it("expands a bare owner/repo shorthand into a full GitHub URL", () => {
    assert.equal(
      normalizeGithubShorthand("GoogleCloudPlatform/db-context-enrichment"),
      "https://github.com/GoogleCloudPlatform/db-context-enrichment.git",
    );
  });

  it("returns an already-full GitHub URL unchanged", () => {
    assert.equal(
      normalizeGithubShorthand("https://github.com/google/skills.git"),
      "https://github.com/google/skills.git",
    );
  });

  it("returns an already-full URL without .git unchanged (does not double-append .git)", () => {
    assert.equal(
      normalizeGithubShorthand("https://github.com/google/skills"),
      "https://github.com/google/skills",
    );
  });

  it("returns a string with more than one slash unchanged", () => {
    assert.equal(
      normalizeGithubShorthand("some/path/like/value"),
      "some/path/like/value",
    );
  });
});

// --- deriveGithubOwnerRepo ---

describe("deriveGithubOwnerRepo", () => {
  it("extracts owner and repo from a .git URL", () => {
    assert.deepEqual(
      deriveGithubOwnerRepo("https://github.com/google/skills.git"),
      { owner: "google", repo: "skills" },
    );
  });

  it("extracts owner and repo from a URL without .git", () => {
    assert.deepEqual(
      deriveGithubOwnerRepo("https://github.com/google/skills"),
      { owner: "google", repo: "skills" },
    );
  });

  it("lowercases mixed-case owners", () => {
    assert.deepEqual(
      deriveGithubOwnerRepo(
        "https://github.com/GoogleCloudPlatform/db-context-enrichment.git",
      ),
      { owner: "googlecloudplatform", repo: "db-context-enrichment" },
    );
  });

  it("throws on a non-GitHub URL", () => {
    assert.throws(() => deriveGithubOwnerRepo("https://example.com/foo/bar"));
  });
});

// --- derivePluginIdFromSource ---

describe("derivePluginIdFromSource", () => {
  it("uses the repo name when there is no path", () => {
    assert.equal(
      derivePluginIdFromSource({
        url: "https://github.com/gemini-cli-extensions/bigquery-data-analytics.git",
      }),
      "io.github.gemini-cli-extensions/bigquery-data-analytics",
    );
  });

  it("uses the last path segment when a path is present", () => {
    assert.equal(
      derivePluginIdFromSource({
        url: "https://github.com/google/skills.git",
        path: "plugins/cloud/google-cloud-developer",
      }),
      "io.github.google/google-cloud-developer",
    );
  });

  it("lowercases the owner segment", () => {
    assert.equal(
      derivePluginIdFromSource({
        url: "https://github.com/GoogleCloudPlatform/db-context-enrichment.git",
        path: "plugin",
      }),
      "io.github.googlecloudplatform/plugin",
    );
  });
});

// --- resolveCodexEntry ---

describe("resolveCodexEntry", () => {
  const marketplaceUrl = "https://github.com/google/skills.git";

  it("resolves a bare-string local path relative to the marketplace repo", () => {
    const resolved = resolveCodexEntry(marketplaceUrl, {
      name: "google-cloud-developer",
      source: "./plugins/cloud/google-cloud-developer",
    });
    assert.deepEqual(resolved, {
      url: marketplaceUrl,
      path: "plugins/cloud/google-cloud-developer",
    });
  });

  it('resolves a {source: "local", path} object', () => {
    const resolved = resolveCodexEntry(marketplaceUrl, {
      name: "x",
      source: { source: "local", path: "plugins/x" },
    });
    assert.deepEqual(resolved, { url: marketplaceUrl, path: "plugins/x" });
  });

  it('resolves a {source: "url"} entry, carrying its ref', () => {
    const resolved = resolveCodexEntry(marketplaceUrl, {
      name: "alloydb",
      source: {
        source: "url",
        url: "https://github.com/gemini-cli-extensions/alloydb.git",
        ref: "0.2.0",
      },
    });
    assert.deepEqual(resolved, {
      url: "https://github.com/gemini-cli-extensions/alloydb.git",
      ref: "0.2.0",
    });
  });

  it('resolves a {source: "git-subdir"} entry, carrying path and ref', () => {
    const resolved = resolveCodexEntry(marketplaceUrl, {
      name: "db-context-engineering",
      source: {
        source: "git-subdir",
        url: "https://github.com/GoogleCloudPlatform/db-context-enrichment",
        path: "plugin",
        ref: "v0.7.2",
      },
    });
    assert.deepEqual(resolved, {
      url: "https://github.com/GoogleCloudPlatform/db-context-enrichment",
      path: "plugin",
      ref: "v0.7.2",
    });
  });

  it('resolves a {source: "git-subdir"} entry with a bare owner/repo shorthand url into a full GitHub URL', () => {
    const resolved = resolveCodexEntry(marketplaceUrl, {
      name: "db-context-engineering",
      source: {
        source: "git-subdir",
        url: "GoogleCloudPlatform/db-context-enrichment",
        path: "plugin",
        ref: "v0.7.2",
      },
    });
    assert.deepEqual(resolved, {
      url: "https://github.com/GoogleCloudPlatform/db-context-enrichment.git",
      path: "plugin",
      ref: "v0.7.2",
    });
  });

  it('returns undefined for a {source: "npm"} entry', () => {
    const resolved = resolveCodexEntry(marketplaceUrl, {
      name: "some-npm-plugin",
      source: { source: "npm", package: "@scope/plugin" },
    });
    assert.equal(resolved, undefined);
  });

  it('returns undefined for a {source: "url"} entry pinned only by sha', () => {
    const resolved = resolveCodexEntry(marketplaceUrl, {
      name: "x",
      source: {
        source: "url",
        url: "https://github.com/example/x.git",
        sha: "abc123",
      },
    });
    assert.equal(resolved, undefined);
  });

  it("returns undefined for an unrecognized source shape", () => {
    const resolved = resolveCodexEntry(marketplaceUrl, {
      name: "x",
      source: 42,
    });
    assert.equal(resolved, undefined);
  });
});

// --- fetchMarketplaceEntries ---

describe("fetchMarketplaceEntries", () => {
  it("clones the repo, reads the marketplace file at its default path, and resolves entries", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "marketplace-test-"));
    const sourceDir = mkdtempSync(join(tmpdir(), "marketplace-src-"));
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

      mkdirSync(join(sourceDir, ".agents", "plugins"), { recursive: true });
      writeFileSync(
        join(sourceDir, ".agents", "plugins", "marketplace.json"),
        JSON.stringify({
          name: "test-plugins",
          plugins: [
            {
              name: "alloydb",
              source: {
                source: "url",
                url: "https://github.com/gemini-cli-extensions/alloydb.git",
                ref: "0.2.0",
              },
            },
            {
              name: "local-one",
              source: "./plugins/local-one",
            },
            {
              name: "unsupported-npm",
              source: { source: "npm", package: "@scope/x" },
            },
          ],
        }),
      );
      execSync("git add -A && git commit -m init", {
        cwd: sourceDir,
        stdio: "pipe",
      });

      const sourceUrl = `file://${sourceDir}`;
      const result = fetchMarketplaceEntries(
        sourceUrl,
        "codex",
        undefined,
        tmpDir,
      );

      assert.equal(result.entries.length, 2);
      assert.deepEqual(result.entries[0], {
        name: "alloydb",
        resolved: {
          url: "https://github.com/gemini-cli-extensions/alloydb.git",
          ref: "0.2.0",
        },
      });
      assert.deepEqual(result.entries[1], {
        name: "local-one",
        resolved: { url: sourceUrl, path: "plugins/local-one" },
      });
      assert.equal(result.warnings.length, 1);
      assert.match(result.warnings[0], /unsupported-npm/);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
      rmSync(sourceDir, { recursive: true, force: true });
    }
  });

  it("throws a clear error for an unknown format", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "marketplace-badformat-"));
    try {
      assert.throws(
        () =>
          fetchMarketplaceEntries(
            "https://example.com/repo.git",
            "not-a-real-format",
            undefined,
            tmpDir,
          ),
        /Unknown marketplace format/,
      );
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
