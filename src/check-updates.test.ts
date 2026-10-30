import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  findBehindApprovals,
  formatReport,
  summarize,
  type BehindApproval,
  type Feed,
} from "./check-updates.js";
import type {
  PluginEntry,
  SandboxExtensionEntry,
  SkillEntry,
} from "./consolidate.js";

const COMMIT = "2df10e2a9c4b7e1f3d5a6b8c0e2f4a6b8c0d1e3f";
const LATEST = "9ac41f0b2d4e6a8c0e2f4a6b8c0d1e3f5a7b9c1d";

function feed(over: Partial<Feed> = {}): Feed {
  return {
    skills: [],
    plugins: [],
    sandboxTools: [],
    sandboxFeatures: [],
    ...over,
  };
}

// A skill pinned to v1.2.0 whose folder the default branch has since changed.
function skill(over: Partial<SkillEntry> = {}): SkillEntry {
  return {
    skillId: "io.example/review",
    name: "review",
    description: "",
    source: {
      url: "https://github.com/example/skills.git",
      path: "skills/review",
      ref: "v1.2.0",
      commit: COMMIT,
      pinned: true,
    },
    contentHash: "approved-hash",
    latestCommit: LATEST,
    latestHash: "latest-hash",
    approvals: [
      {
        organizationId: "acme",
        date: "2026-09-01",
        configHash: "c",
        installConfigs: [],
      },
    ],
    ...over,
  };
}

function plugin(over: Partial<PluginEntry> = {}): PluginEntry {
  return {
    pluginId: "io.example/tools",
    name: "tools",
    description: "",
    source: {
      url: "https://github.com/example/plugins.git",
      path: "plugins/tools",
      ref: "v2.0.0",
      commit: COMMIT,
      pinned: true,
    },
    contentHash: "approved-hash",
    latestCommit: LATEST,
    latestHash: "latest-hash",
    containedSkills: [],
    containedMcpServers: [],
    approvals: [
      {
        organizationId: "acme",
        date: "2026-09-01",
        configHash: "c",
        installConfigs: [],
      },
    ],
    ...over,
  };
}

function sandboxExtension(
  kind: SandboxExtensionEntry["kind"],
  path: string,
): SandboxExtensionEntry {
  return {
    sandboxExtensionId: `io.example/kits/${path}`,
    kind,
    name: path,
    extensionName: path.split("/").pop()!,
    description: "",
    source: {
      url: "https://github.com/example/kits.git",
      path,
      ref: "v3.0.0",
      commit: COMMIT,
      pinned: true,
    },
    contentHash: "approved-hash",
    latestCommit: LATEST,
    latestHash: "latest-hash",
    approvals: [
      { organizationId: "acme", date: "2026-09-01", configHash: "c" },
    ],
  };
}

describe("findBehindApprovals", () => {
  it("lists the direct approval of a skill whose source has changed", () => {
    assert.deepEqual(findBehindApprovals(feed({ skills: [skill()] })), [
      {
        organizationId: "acme",
        type: "skill",
        id: "io.example/review",
        ref: "v1.2.0",
        commit: COMMIT,
        latestCommit: LATEST,
      },
    ]);
  });

  it("lists nothing for a skill whose source ships what was approved", () => {
    const same = skill({ latestHash: "approved-hash" });
    assert.deepEqual(findBehindApprovals(feed({ skills: [same] })), []);
  });

  // Consolidation couldn't find out, which is neither current nor behind.
  it("lists nothing for a skill with no latestHash", () => {
    const unknown = skill({ latestCommit: undefined, latestHash: undefined });
    assert.deepEqual(findBehindApprovals(feed({ skills: [unknown] })), []);
  });

  // The trusting organization has no approval file to change, and the one it
  // trusts is listed through its own direct approval.
  it("skips a trust-derived approval", () => {
    const trusted = skill({
      approvals: [
        ...skill().approvals,
        {
          organizationId: "globex",
          date: "2026-09-01",
          configHash: "c",
          installConfigs: [],
          viaTrust: "acme",
        },
      ],
    });
    assert.deepEqual(
      findBehindApprovals(feed({ skills: [trusted] })).map(
        (a) => a.organizationId,
      ),
      ["acme"],
    );
  });

  it("lists the direct approval of a plugin whose source has changed", () => {
    assert.deepEqual(findBehindApprovals(feed({ plugins: [plugin()] })), [
      {
        organizationId: "acme",
        type: "plugin",
        id: "io.example/tools",
        ref: "v2.0.0",
        commit: COMMIT,
        latestCommit: LATEST,
      },
    ]);
  });

  // The organization approved the marketplace, not this plugin, so there's no
  // approval file whose ref a PR could change.
  it("skips a marketplace-derived approval", () => {
    const listed = plugin({
      approvals: [
        ...plugin().approvals,
        {
          organizationId: "initech",
          date: "2026-09-01",
          configHash: "c",
          installConfigs: [],
          sourcedFrom: {
            marketplaceUrl: "https://github.com/example/marketplace.git",
            format: "codex",
          },
        },
      ],
    });
    assert.deepEqual(
      findBehindApprovals(feed({ plugins: [listed] })).map(
        (a) => a.organizationId,
      ),
      ["acme"],
    );
  });

  it("lists sandbox tools and features whose source has changed", () => {
    const found = findBehindApprovals(
      feed({
        sandboxTools: [sandboxExtension("sandbox", "tools/openclaw")],
        sandboxFeatures: [sandboxExtension("mixin", "features/github-cli")],
      }),
    );
    assert.deepEqual(
      found.map((a) => [a.type, a.id]),
      [
        ["sandboxTool", "io.example/kits/tools/openclaw"],
        ["sandboxFeature", "io.example/kits/features/github-cli"],
      ],
    );
  });

  // An MCP approval's version is informational, not a pin, and an agent
  // records nothing about what was approved, so neither can be behind, even
  // given fields that look like it.
  it("ignores MCP servers and agents", () => {
    const approvals = skill().approvals;
    const whole = {
      ...feed(),
      mcp: [
        {
          serverId: "io.example/server",
          name: "server",
          description: "",
          latestVersion: "2.0.0",
          mcpRegistryVerified: true,
          approvals: [{ ...approvals[0], version: "1.0.0" }],
        },
      ],
      agents: [
        {
          agentId: "io.example/agent",
          name: "agent",
          description: "",
          source: { url: "https://example.com/agent_card.json" },
          contentHash: "approved-hash",
          latestHash: "latest-hash",
          approvals,
        },
      ],
    };
    assert.deepEqual(findBehindApprovals(whole), []);
  });
});

describe("formatReport", () => {
  const GENERATED_AT = "2026-10-16T03:00:00.000Z";
  const vendors = [
    {
      id: "acme",
      repo: "https://github.com/eclipsefdn-ai-registry/ai-registry-acme.git",
    },
  ];

  function behind(over: Partial<BehindApproval> = {}): BehindApproval {
    return {
      organizationId: "acme",
      type: "skill",
      id: "io.example/review",
      ref: "v1.2.0",
      commit: COMMIT,
      latestCommit: LATEST,
      ...over,
    };
  }

  it("lists an approval under its organization and vendor repo", () => {
    assert.equal(
      formatReport([behind()], vendors, GENERATED_AT, {
        behind: 1,
        unchecked: 0,
      }),
      [
        `Approvals whose source has changed, from the feed generated ${GENERATED_AT}`,
        "",
        "acme  https://github.com/eclipsefdn-ai-registry/ai-registry-acme.git",
        "  skill  io.example/review  pinned to v1.2.0 (2df10e2), the source has changed since; the default branch is at 9ac41f0",
        "",
        "1 entry behind its source · 0 pinned entries couldn't be checked",
      ].join("\n"),
    );
  });

  it("groups approvals by organization, saying when one has no vendor repo", () => {
    const found = [
      behind({ organizationId: "globex" }),
      behind(),
      behind({ type: "plugin", id: "io.example/tools", ref: "v2.0.0" }),
    ];
    const summary = { behind: 2, unchecked: 1 };
    const report = formatReport(found, vendors, GENERATED_AT, summary);
    assert.deepEqual(report.split("\n"), [
      `Approvals whose source has changed, from the feed generated ${GENERATED_AT}`,
      "",
      "acme  https://github.com/eclipsefdn-ai-registry/ai-registry-acme.git",
      "  skill  io.example/review  pinned to v1.2.0 (2df10e2), the source has changed since; the default branch is at 9ac41f0",
      "  plugin  io.example/tools  pinned to v2.0.0 (2df10e2), the source has changed since; the default branch is at 9ac41f0",
      "",
      "globex  (no vendor repo registered)",
      "  skill  io.example/review  pinned to v1.2.0 (2df10e2), the source has changed since; the default branch is at 9ac41f0",
      "",
      "2 entries behind their source · 1 pinned entry couldn't be checked",
    ]);
  });

  // An empty listing alone can't tell "every pin is current" from "nobody
  // could check".
  it("ends with the summary even when nothing is listed", () => {
    assert.deepEqual(
      formatReport([], vendors, GENERATED_AT, {
        behind: 0,
        unchecked: 2,
      }).split("\n"),
      [
        `Approvals whose source has changed, from the feed generated ${GENERATED_AT}`,
        "",
        "0 entries behind their source · 2 pinned entries couldn't be checked",
      ],
    );
  });
});

describe("summarize", () => {
  it("counts an entry whose source has changed as behind", () => {
    assert.deepEqual(summarize(feed({ skills: [skill()] })), {
      behind: 1,
      unchecked: 0,
    });
  });

  it("counts a pinned entry with no latestHash as unchecked", () => {
    const unknown = skill({ latestCommit: undefined, latestHash: undefined });
    assert.deepEqual(summarize(feed({ skills: [unknown] })), {
      behind: 0,
      unchecked: 1,
    });
  });

  // The ls-remote that sets latestHash also sets pinned, so a ref with
  // neither is a failed lookup, whether a tag or a full SHA.
  it("counts a ref with neither pinned nor latestHash as unchecked", () => {
    const url = "https://github.com/example/skills.git";
    const failed = [
      skill({ source: { url, ref: "v1.2.0" } }),
      skill({ source: { url, ref: COMMIT } }),
    ].map((e) => ({ ...e, latestCommit: undefined, latestHash: undefined }));
    assert.deepEqual(summarize(feed({ skills: failed })), {
      behind: 0,
      unchecked: 2,
    });
  });

  // A tracking entry can't fall behind, so nothing went unchecked.
  it("never counts a tracking entry as unchecked", () => {
    const url = "https://github.com/example/skills.git";
    const tracking = [
      skill({ source: { url, ref: "develop", pinned: false } }),
      skill({ source: { url, pinned: false } }),
    ].map((e) => ({ ...e, latestCommit: undefined, latestHash: undefined }));
    assert.deepEqual(summarize(feed({ skills: tracking })), {
      behind: 0,
      unchecked: 0,
    });
  });

  // The counts cover what the listing does, so a marketplace pinning a plugin
  // by sha can't give "1 entry behind" with nothing listed.
  it("doesn't count an entry with no direct approval", () => {
    const viaMarketplace = [
      {
        organizationId: "initech",
        date: "2026-09-01",
        configHash: "c",
        installConfigs: [],
        sourcedFrom: {
          marketplaceUrl: "https://github.com/example/marketplace.git",
          format: "codex" as const,
        },
      },
    ];
    const behind = plugin({ approvals: viaMarketplace });
    const unknown = plugin({
      approvals: viaMarketplace,
      latestCommit: undefined,
      latestHash: undefined,
    });
    assert.deepEqual(summarize(feed({ plugins: [behind, unknown] })), {
      behind: 0,
      unchecked: 0,
    });
  });
});
