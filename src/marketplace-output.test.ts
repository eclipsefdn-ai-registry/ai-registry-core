import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildMarketplace,
  marketplaceEntryName,
  buildOrgMarketplace,
} from "./marketplace-output.js";
import type { PluginEntry } from "./consolidate.js";

const COMMIT = "7b4a44e40e0112233445566778899aabbccddeef";

function plugin(overrides: Partial<PluginEntry> = {}): PluginEntry {
  return {
    pluginId: "io.github.gemini-cli-extensions/looker",
    name: "looker",
    description: "Query Looker from the CLI",
    source: {
      url: "https://github.com/google/skills.git",
      path: "plugins/looker",
      commit: COMMIT,
    },
    contentHash: "49b0db08bdaa",
    containedSkills: [],
    containedMcpServers: [],
    approvals: [
      {
        organizationId: "google",
        date: "2026-09-11",
        configHash: "f400c1e06354",
        installConfigs: [],
      },
    ],
    ...overrides,
  };
}

// Entries this can't publish are skipped with a warning, so a test that
// exercises one captures the warning instead of letting it reach the test
// output. Same shape as the console.warn capture in consolidate.test.ts.
function buildQuietly(
  plugins: PluginEntry[],
  org?: Parameters<typeof buildMarketplace>[1],
) {
  const warnings: unknown[][] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => warnings.push(args);
  try {
    return { file: buildMarketplace(plugins, org), warnings };
  } finally {
    console.warn = originalWarn;
  }
}

// --- marketplaceEntryName ---

describe("marketplaceEntryName", () => {
  it("replaces the id separator, which Claude Code entry names can't carry", () => {
    assert.equal(
      marketplaceEntryName("io.github.gemini-cli-extensions/looker"),
      "io.github.gemini-cli-extensions.looker",
    );
  });

  it("has no name for an id that can't produce a usable one", () => {
    assert.equal(marketplaceEntryName("io.github.acme/../escape"), undefined);
    assert.equal(marketplaceEntryName("io.github.acme/has space"), undefined);
    // Derived from a vendor marketplace file listing a dotted folder, which
    // no schema constrains.
    assert.equal(marketplaceEntryName("io.github.acme/.hidden"), undefined);
  });
});

// --- buildMarketplace: file level ---

describe("buildMarketplace", () => {
  it("names the aggregate and the per-organization file differently", () => {
    assert.equal(buildMarketplace([plugin()]).name, "ai-registry");

    const org = buildMarketplace([plugin()], { id: "google", name: "Google" });
    assert.equal(org.name, "ai-registry-google");
    assert.match(org.description, /approved by Google/);
  });

  it("carries no generatedAt, since the schema is not ours to extend", () => {
    assert.deepEqual(Object.keys(buildMarketplace([])), [
      "$schema",
      "name",
      "description",
      "owner",
      "plugins",
    ]);
  });

  it("leaves forceRemoveDeletedPlugins unset", () => {
    assert.equal(
      "forceRemoveDeletedPlugins" in buildMarketplace([plugin()]),
      false,
    );
  });

  it("sorts entries by name, independently of input order", () => {
    const file = buildMarketplace([
      plugin({ pluginId: "io.github.acme/zebra" }),
      plugin({ pluginId: "io.github.acme/alpha" }),
    ]);
    assert.deepEqual(
      file.plugins.map((p) => p.name),
      ["io.github.acme.alpha", "io.github.acme.zebra"],
    );
  });

  it("leaves out an entry it can't name, rather than failing the build", () => {
    const { file, warnings } = buildQuietly([
      plugin({ pluginId: "io.github.acme/.hidden" }),
      plugin({ pluginId: "io.github.acme/good" }),
    ]);
    assert.deepEqual(
      file.plugins.map((p) => p.name),
      ["io.github.acme.good"],
    );
    assert.match(String(warnings[0][0]), /io\.github\.acme\/\.hidden/);
  });

  it("leaves out the second of two ids that derive one name", () => {
    const { file, warnings } = buildQuietly([
      plugin({ pluginId: "io.github.acme.b/c" }),
      plugin({ pluginId: "io.github.acme/b.c" }),
    ]);
    assert.deepEqual(
      file.plugins.map((p) => p.metadata.pluginId),
      ["io.github.acme.b/c"],
    );
    assert.match(String(warnings[0][0]), /io\.github\.acme\/b\.c/);
  });

  it("picks the same collision winner whatever order it is given", () => {
    const a = plugin({ pluginId: "io.github.acme.b/c" });
    const b = plugin({ pluginId: "io.github.acme/b.c" });
    const first = buildQuietly([a, b]).file.plugins[0].metadata.pluginId;
    const second = buildQuietly([b, a]).file.plugins[0].metadata.pluginId;
    assert.equal(first, second);
  });
});

// --- buildMarketplace: per-organization filtering ---

describe("buildMarketplace per organization", () => {
  const approved = (organizationId: string) => ({
    organizationId,
    date: "2026-09-11",
    configHash: "f400c1e06354",
    installConfigs: [],
  });

  it("keeps only plugins that organization approved", () => {
    const file = buildMarketplace(
      [
        plugin({
          pluginId: "io.github.acme/one",
          approvals: [approved("aws")],
        }),
        plugin({
          pluginId: "io.github.acme/two",
          approvals: [approved("google")],
        }),
      ],
      { id: "aws", name: "AWS" },
    );
    assert.deepEqual(
      file.plugins.map((p) => p.metadata.pluginId),
      ["io.github.acme/one"],
    );
  });

  it("narrows an entry's recorded approvals to that organization", () => {
    const shared = plugin({
      approvals: [approved("aws"), approved("google")],
    });

    const org = buildMarketplace([shared], { id: "aws", name: "AWS" });
    assert.deepEqual(
      org.plugins[0].metadata.approvals.map((a) => a.organizationId),
      ["aws"],
    );

    const all = buildMarketplace([shared]);
    assert.deepEqual(
      all.plugins[0].metadata.approvals.map((a) => a.organizationId),
      ["aws", "google"],
    );
  });

  it("leaves an organization that approved another revision off the entry", () => {
    const shared = plugin({
      pluginId: "io.github.acme/one",
      approvals: [approved("aws"), approved("google")],
    });
    const mismatches = new Set(["io.github.acme/one::google"]);

    // The entry's source is AWS's, the one that was fetched and hashed, so
    // Google can't be shown beside it.
    const all = buildMarketplace([shared], undefined, mismatches);
    assert.deepEqual(
      all.plugins[0].metadata.approvals.map((a) => a.organizationId),
      ["aws"],
    );

    // And Google's own marketplace doesn't offer it at all.
    const google = buildMarketplace(
      [shared],
      { id: "google", name: "Google" },
      mismatches,
    );
    assert.deepEqual(google.plugins, []);

    // AWS's is unaffected.
    const aws = buildMarketplace(
      [shared],
      { id: "aws", name: "AWS" },
      mismatches,
    );
    assert.equal(aws.plugins.length, 1);
  });

  it("leaves off an approval trusted from an organization that approved another revision", () => {
    const shared = plugin({
      pluginId: "io.github.acme/one",
      approvals: [
        approved("aws"),
        approved("google"),
        { ...approved("theia"), viaTrust: "google" },
        { ...approved("eclipse"), viaTrust: "aws" },
      ],
    });
    const mismatches = new Set(["io.github.acme/one::google"]);

    // Theia's approval is Google's, copied through trust, so it vouches for
    // the revision Google approved, not the AWS one the entry pins. Eclipse's
    // is AWS's, the revision the entry pins, so it stays.
    const all = buildMarketplace([shared], undefined, mismatches);
    assert.deepEqual(
      all.plugins[0].metadata.approvals.map((a) => a.organizationId),
      ["aws", "eclipse"],
    );

    const theia = buildMarketplace(
      [shared],
      { id: "theia", name: "Theia" },
      mismatches,
    );
    assert.deepEqual(theia.plugins, []);
  });

  it("carries viaTrust and sourcedFrom, and drops approval fields a client can't use", () => {
    const sourcedFrom = {
      marketplaceUrl: "https://github.com/google/skills.git",
      format: "codex",
    };
    const file = buildMarketplace([
      plugin({
        approvals: [{ ...approved("google"), viaTrust: "theia", sourcedFrom }],
      }),
    ]);
    assert.deepEqual(file.plugins[0].metadata.approvals, [
      {
        organizationId: "google",
        date: "2026-09-11",
        viaTrust: "theia",
        sourcedFrom,
      },
    ]);
  });
});

// --- buildOrgMarketplace ---

describe("buildOrgMarketplace", () => {
  const google = { id: "google", name: "Google" };

  it("builds the organization's marketplace when it lists something", () => {
    assert.equal(buildOrgMarketplace([plugin()], google)?.plugins.length, 1);
  });

  it("has none for an organization that approved no plugin", () => {
    assert.equal(
      buildOrgMarketplace([plugin()], { id: "aws", name: "AWS" }),
      undefined,
    );
  });

  it("has none for an organization whose every approval was left off", () => {
    // Google approves, but at a revision that lost to another organization's,
    // so orgs/google.json lists the plugin while no marketplace file exists.
    assert.equal(
      buildOrgMarketplace(
        [plugin({ pluginId: "io.github.acme/one" })],
        google,
        new Set(["io.github.acme/one::google"]),
      ),
      undefined,
    );
  });
});

// --- buildMarketplace: entries ---

describe("buildMarketplace entries", () => {
  const entryOf = (p: PluginEntry) => buildMarketplace([p]).plugins[0];

  it("uses git-subdir for a plugin in a subdirectory", () => {
    assert.deepEqual(entryOf(plugin()).source, {
      source: "git-subdir",
      url: "https://github.com/google/skills.git",
      path: "plugins/looker",
      sha: COMMIT,
    });
  });

  it("uses url for a plugin that is the whole repository", () => {
    const entry = entryOf(
      plugin({ source: { url: "https://github.com/acme/p.git" } }),
    );
    assert.deepEqual(entry.source, {
      source: "url",
      url: "https://github.com/acme/p.git",
    });
  });

  it("sends ref alongside sha rather than instead of it", () => {
    const entry = entryOf(
      plugin({
        source: {
          url: "https://github.com/google/skills.git",
          path: "plugins/looker",
          ref: "0.3.10",
          commit: COMMIT,
        },
      }),
    );
    assert.equal(entry.source.ref, "0.3.10");
    assert.equal(entry.source.sha, COMMIT);
  });

  it("omits a sha that isn't a full commit, which Claude Code rejects", () => {
    const entry = entryOf(
      plugin({
        source: {
          url: "https://github.com/google/skills.git",
          path: "plugins/looker",
          commit: "7b4a44e",
        },
      }),
    );
    assert.equal("sha" in entry.source, false);
  });

  it("names the entry from the id and shows the plugin's own name", () => {
    const entry = entryOf(plugin());
    assert.equal(entry.name, "io.github.gemini-cli-extensions.looker");
    assert.equal(entry.displayName, "looker");
  });

  it("records provenance a client can trace back", () => {
    assert.deepEqual(entryOf(plugin()).metadata, {
      pluginId: "io.github.gemini-cli-extensions/looker",
      registryUrl:
        "https://ai.open-vsx.org/?plugin=io.github.gemini-cli-extensions%2Flooker",
      contentHash: "49b0db08bdaa",
      approvals: [{ organizationId: "google", date: "2026-09-11" }],
    });
  });

  it("carries the display fields a vendor's plugin.json provided", () => {
    const entry = entryOf(
      plugin({
        version: "0.3.10",
        author: "Google",
        homepage: "https://cloud.google.com/looker",
        keywords: ["looker", "bi"],
      }),
    );
    assert.equal(entry.version, "0.3.10");
    assert.deepEqual(entry.author, { name: "Google" });
    assert.equal(entry.homepage, "https://cloud.google.com/looker");
    assert.deepEqual(entry.keywords, ["looker", "bi"]);
  });

  it("drops a homepage that isn't a URL, which would fail the plugin's load", () => {
    assert.equal(
      "homepage" in entryOf(plugin({ homepage: "see README" })),
      false,
    );
    assert.equal(
      "homepage" in entryOf(plugin({ homepage: "javascript:alert(1)" })),
      false,
    );
  });

  it("omits empty optional fields rather than writing them blank", () => {
    const entry = entryOf(plugin({ description: "", keywords: [] }));
    assert.equal("description" in entry, false);
    assert.equal("keywords" in entry, false);
  });
});
