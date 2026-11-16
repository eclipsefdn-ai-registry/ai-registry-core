import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parseCodexMarketplace,
  resolveCodexEntry,
  deriveRepoNamespace,
  derivePluginIdFromSource,
  fetchMarketplaceEntries,
  normalizeGithubShorthand,
} from "./marketplace-source.js";
import { makeMarketplaceRepo } from "./marketplace-test-fixtures.js";

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

// --- deriveRepoNamespace ---

describe("deriveRepoNamespace", () => {
  it("extracts owner and repo from a .git URL", () => {
    assert.deepEqual(
      deriveRepoNamespace("https://github.com/google/skills.git"),
      { namespace: "io.github.google", repo: "skills" },
    );
  });

  it("extracts owner and repo from a URL without .git", () => {
    assert.deepEqual(deriveRepoNamespace("https://github.com/google/skills"), {
      namespace: "io.github.google",
      repo: "skills",
    });
  });

  it("lowercases mixed-case owners", () => {
    assert.deepEqual(
      deriveRepoNamespace(
        "https://github.com/GoogleCloudPlatform/db-context-enrichment.git",
      ),
      {
        namespace: "io.github.googlecloudplatform",
        repo: "db-context-enrichment",
      },
    );
  });

  it("reverses a non-GitHub host and keeps only the top-level group of a nested path", () => {
    assert.deepEqual(
      deriveRepoNamespace(
        "https://gitlab.com/gitlab-org/ai/gitlab-duo-plugins.git",
      ),
      { namespace: "com.gitlab.gitlab-org", repo: "gitlab-duo-plugins" },
    );
  });

  it("handles a self-hosted instance", () => {
    assert.deepEqual(
      deriveRepoNamespace(
        "https://gitlab.eclipse.org/eclipse-research-labs/mosaico-project/plugins",
      ),
      {
        namespace: "org.eclipse.gitlab.eclipse-research-labs",
        repo: "plugins",
      },
    );
  });

  it("throws on a URL without an owner and a repo", () => {
    assert.throws(() => deriveRepoNamespace("https://example.com/foo"));
  });

  it("throws on a non-http URL", () => {
    assert.throws(() =>
      deriveRepoNamespace("git@github.com:google/skills.git"),
    );
    assert.throws(() => deriveRepoNamespace("file:///srv/repos/foo/bar"));
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

  it("uses the last path segment when a path is present and marked descriptive", () => {
    assert.equal(
      derivePluginIdFromSource({
        url: "https://github.com/google/skills.git",
        path: "plugins/cloud/google-cloud-developer",
        pathIsDescriptive: true,
      }),
      "io.github.google/google-cloud-developer",
    );
  });

  it("lowercases the owner segment", () => {
    assert.equal(
      derivePluginIdFromSource({
        url: "https://github.com/GoogleCloudPlatform/db-context-enrichment.git",
        path: "plugins/cloud/google-cloud-developer",
        pathIsDescriptive: true,
      }),
      "io.github.googlecloudplatform/google-cloud-developer",
    );
  });

  it("derives the same ID a direct approval uses for a GitLab-hosted local entry", () => {
    assert.equal(
      derivePluginIdFromSource({
        url: "https://gitlab.com/gitlab-org/ai/gitlab-duo-plugins.git",
        path: "plugins/mr-review",
        pathIsDescriptive: true,
      }),
      "com.gitlab.gitlab-org/mr-review",
    );
  });

  it("throws when the derived ID would not be a valid pluginId", () => {
    assert.throws(() =>
      derivePluginIdFromSource({
        url: "https://github.com/acme/repo",
        path: "plugins/My Plugin",
        pathIsDescriptive: true,
      }),
    );
  });

  it("falls back to the repo name for a git-subdir-shaped source whose path is not marked descriptive, avoiding a generic-path collision", () => {
    assert.equal(
      derivePluginIdFromSource({
        url: "https://github.com/GoogleCloudPlatform/db-context-enrichment.git",
        path: "plugin",
      }),
      "io.github.googlecloudplatform/db-context-enrichment",
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
      pathIsDescriptive: true,
    });
  });

  it('resolves a {source: "local", path} object', () => {
    const resolved = resolveCodexEntry(marketplaceUrl, {
      name: "x",
      source: { source: "local", path: "plugins/x" },
    });
    assert.deepEqual(resolved, {
      url: marketplaceUrl,
      path: "plugins/x",
      pathIsDescriptive: true,
    });
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

  it('resolves a {source: "git-subdir"} entry, carrying path and ref, without marking the path descriptive', () => {
    const resolved = resolveCodexEntry(marketplaceUrl, {
      name: "db-context-engineering",
      source: {
        source: "git-subdir",
        url: "https://github.com/GoogleCloudPlatform/db-context-enrichment",
        path: "plugin",
        ref: "v0.7.2",
      },
    });
    assert.ok(!resolved?.pathIsDescriptive);
    assert.deepEqual(resolved, {
      url: "https://github.com/GoogleCloudPlatform/db-context-enrichment",
      path: "plugin",
      ref: "v0.7.2",
    });
  });

  it('resolves a {source: "git-subdir"} entry with a bare owner/repo shorthand url into a full GitHub URL, without marking the path descriptive', () => {
    const resolved = resolveCodexEntry(marketplaceUrl, {
      name: "db-context-engineering",
      source: {
        source: "git-subdir",
        url: "GoogleCloudPlatform/db-context-enrichment",
        path: "plugin",
        ref: "v0.7.2",
      },
    });
    assert.ok(!resolved?.pathIsDescriptive);
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

  it('rejects a path-traversal path for a bare-string local source ("../../etc")', () => {
    const resolved = resolveCodexEntry(marketplaceUrl, {
      name: "x",
      source: "../../etc",
    });
    assert.equal(resolved, undefined);
  });

  it('rejects a path containing a ".." segment for a {source: "local"} entry ("a/../b")', () => {
    const resolved = resolveCodexEntry(marketplaceUrl, {
      name: "x",
      source: { source: "local", path: "a/../b" },
    });
    assert.equal(resolved, undefined);
  });

  it('rejects a path-traversal path for a {source: "git-subdir"} entry', () => {
    const resolved = resolveCodexEntry(marketplaceUrl, {
      name: "x",
      source: {
        source: "git-subdir",
        url: "https://github.com/example/x.git",
        path: "../../etc",
      },
    });
    assert.equal(resolved, undefined);
  });

  it("still resolves a normal, safe path for both local and git-subdir sources", () => {
    const local = resolveCodexEntry(marketplaceUrl, {
      name: "x",
      source: { source: "local", path: "plugins/data-tools" },
    });
    assert.deepEqual(local, {
      url: marketplaceUrl,
      path: "plugins/data-tools",
      pathIsDescriptive: true,
    });

    const subdir = resolveCodexEntry(marketplaceUrl, {
      name: "y",
      source: {
        source: "git-subdir",
        url: "https://github.com/example/x.git",
        path: "plugins/data-tools",
      },
    });
    assert.deepEqual(subdir, {
      url: "https://github.com/example/x.git",
      path: "plugins/data-tools",
    });
  });

  it('resolves a {source: "url"} entry with neither ref nor sha, tracking the default branch', () => {
    const resolved = resolveCodexEntry(marketplaceUrl, {
      name: "x",
      source: {
        source: "url",
        url: "https://github.com/example/x.git",
      },
    });
    assert.deepEqual(resolved, {
      url: "https://github.com/example/x.git",
    });
  });

  it('resolves a {source: "url"} entry that also carries a path, without marking it descriptive', () => {
    const resolved = resolveCodexEntry(marketplaceUrl, {
      name: "db-context-engineering",
      source: {
        source: "url",
        url: "https://github.com/GoogleCloudPlatform/db-context-enrichment.git",
        path: "plugin",
        ref: "v0.7.2",
      },
    });
    assert.ok(!resolved?.pathIsDescriptive);
    assert.deepEqual(resolved, {
      url: "https://github.com/GoogleCloudPlatform/db-context-enrichment.git",
      path: "plugin",
      ref: "v0.7.2",
    });
  });

  it('strips a leading "./" from a {source: "url"} entry\'s path', () => {
    const resolved = resolveCodexEntry(marketplaceUrl, {
      name: "x",
      source: {
        source: "url",
        url: "https://github.com/example/x.git",
        path: "./plugin",
      },
    });
    assert.equal(resolved?.path, "plugin");
  });

  it('returns undefined for a {source: "git-subdir"} entry pinned only by sha', () => {
    const resolved = resolveCodexEntry(marketplaceUrl, {
      name: "x",
      source: {
        source: "git-subdir",
        url: "https://github.com/example/x.git",
        path: "plugin",
        sha: "abc123",
      },
    });
    assert.equal(resolved, undefined);
  });

  it('strips a leading "./" from a {source: "git-subdir"} entry\'s path', () => {
    const resolved = resolveCodexEntry(marketplaceUrl, {
      name: "db-context-engineering",
      source: {
        source: "git-subdir",
        url: "https://github.com/GoogleCloudPlatform/db-context-enrichment.git",
        path: "./plugin",
        ref: "v0.7.2",
      },
    });
    assert.equal(resolved?.path, "plugin");
  });
});

// --- fetchMarketplaceEntries ---

describe("fetchMarketplaceEntries", () => {
  it("clones the repo, reads the marketplace file at its default path, and resolves entries", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "marketplace-test-"));
    const { sourceUrl, cleanup } = makeMarketplaceRepo([
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
    ]);
    try {
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
        resolved: {
          url: sourceUrl,
          path: "plugins/local-one",
          pathIsDescriptive: true,
        },
      });
      assert.equal(result.warnings.length, 1);
      assert.match(result.warnings[0], /unsupported-npm/);
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
      cleanup();
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
