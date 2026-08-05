import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  addOrganization,
  addApproval,
  addSkillApproval,
  resolveSkillInstallUrls,
  resolveSkillTrust,
  filterValidSkillTrusts,
  resolveMcpTrust,
  filterValidMcpTrusts,
  enrichWithRegistryData,
  resolveVendorMetadata,
  pickWinningGenericConfig,
  resolveMcpCrossVendorConfigs,
  buildToolView,
  buildToolSkillView,
  type ConsolidatedOutput,
  type ApprovalData,
  type SkillApprovalData,
  type McpEntry,
  type SkillEntry,
  type SkillTrustEntry,
  type McpTrustEntry,
  type GenericMcpConfigEntry,
} from "./consolidate.js";

function emptyOutput(): ConsolidatedOutput {
  return { organizations: [], tools: [], mcp: [], skills: [] };
}

describe("addOrganization", () => {
  it("adds organization and tools to output", () => {
    const output = emptyOutput();
    addOrganization(
      {
        id: "acme",
        name: "Acme Corp",
        description: "Test org",
        website: "https://acme.com",
        tools: [
          { id: "tool-a", name: "Tool A" },
          { id: "tool-b", name: "Tool B" },
        ],
      },
      output,
    );

    assert.equal(output.organizations.length, 1);
    assert.equal(output.organizations[0].id, "acme");
    assert.equal(output.tools.length, 2);
    assert.equal(output.tools[0].organizationId, "acme");
    assert.equal(output.tools[1].id, "tool-b");
  });

  it("does not include tools array in organization entry", () => {
    const output = emptyOutput();
    addOrganization(
      {
        id: "acme",
        name: "Acme",
        description: "Test",
        website: "https://acme.com",
        tools: [{ id: "t", name: "T" }],
      },
      output,
    );

    assert.equal("tools" in output.organizations[0], false);
  });

  it("carries the inferred flag through to the organization entry", () => {
    const output = emptyOutput();
    addOrganization(
      {
        id: "anthropic",
        name: "Anthropic",
        description: "Pre-seeded from an official public source",
        website: "https://anthropic.com",
        inferred: true,
      },
      output,
    );

    assert.equal(output.organizations[0].inferred, true);
  });

  it("omits inferred when not provided (direct participant)", () => {
    const output = emptyOutput();
    addOrganization(
      {
        id: "acme",
        name: "Acme",
        description: "Test",
        website: "https://acme.com",
      },
      output,
    );

    assert.equal("inferred" in output.organizations[0], false);
  });
});

describe("addOrganization — duplicate tool IDs across vendors", () => {
  it("produces duplicate tool IDs when two vendors declare the same tool ID", () => {
    const output = emptyOutput();
    addOrganization(
      {
        id: "vendor-a",
        name: "Vendor A",
        description: "First vendor",
        website: "https://a.com",
        tools: [{ id: "shared-tool", name: "Shared Tool A" }],
      },
      output,
    );
    addOrganization(
      {
        id: "vendor-b",
        name: "Vendor B",
        description: "Second vendor",
        website: "https://b.com",
        tools: [{ id: "shared-tool", name: "Shared Tool B" }],
      },
      output,
    );

    // Replicate the cross-vendor duplicate check from consolidate main()
    const seenToolIds = new Set<string>();
    let duplicateFound = false;
    for (const tool of output.tools) {
      if (seenToolIds.has(tool.id)) {
        duplicateFound = true;
        break;
      }
      seenToolIds.add(tool.id);
    }
    assert.equal(
      duplicateFound,
      true,
      "should detect duplicate tool ID across vendors",
    );
  });
});

describe("addApproval", () => {
  const approval: ApprovalData = {
    serverId: "io.example/server",
    date: "2026-05-01",
    version: "1.0.0",
    installConfigs: [{ tool: "tool-a", instructions: "do stuff" }],
  };

  it("creates a new MCP entry with serverId as name", () => {
    const output = emptyOutput();
    addApproval(approval, "acme", output, new Map());

    assert.equal(output.mcp.length, 1);
    assert.equal(output.mcp[0].serverId, "io.example/server");
    assert.equal(output.mcp[0].name, "io.example/server");
    assert.equal(output.mcp[0].description, "");
    assert.equal(output.mcp[0].mcpRegistryVerified, false);
    assert.equal(output.mcp[0].approvals.length, 1);
    assert.equal(output.mcp[0].approvals[0].organizationId, "acme");
  });

  it("merges approvals from multiple vendors for the same server", () => {
    const output = emptyOutput();
    addApproval(approval, "acme", output, new Map());
    addApproval(
      {
        ...approval,
        version: "2.0.0",
        installConfigs: [{ tool: "tool-b" }],
      },
      "other-org",
      output,
      new Map(),
    );

    assert.equal(output.mcp.length, 1);
    assert.equal(output.mcp[0].approvals.length, 2);
    assert.equal(output.mcp[0].approvals[0].organizationId, "acme");
    assert.equal(output.mcp[0].approvals[1].organizationId, "other-org");
    assert.equal(output.mcp[0].approvals[1].version, "2.0.0");
  });

  it("produces a stable configHash from approval data", () => {
    const output1 = emptyOutput();
    const output2 = emptyOutput();
    addApproval(approval, "acme", output1, new Map());
    addApproval(approval, "acme", output2, new Map());

    const hash1 = output1.mcp[0].approvals[0].configHash;
    const hash2 = output2.mcp[0].approvals[0].configHash;
    assert.equal(typeof hash1, "string");
    assert.ok(hash1.length > 0);
    assert.equal(hash1, hash2, "same input should produce same hash");
  });

  it("produces different configHash when approval data changes", () => {
    const output1 = emptyOutput();
    const output2 = emptyOutput();
    addApproval(approval, "acme", output1, new Map());
    addApproval(
      {
        ...approval,
        installConfigs: [{ tool: "tool-a", instructions: "changed" }],
      },
      "acme",
      output2,
      new Map(),
    );

    assert.notEqual(
      output1.mcp[0].approvals[0].configHash,
      output2.mcp[0].approvals[0].configHash,
      "different input should produce different hash",
    );
  });

  it("omits version when not provided", () => {
    const output = emptyOutput();
    const noVersion: ApprovalData = {
      serverId: "io.example/server",
      date: "2026-05-01",
      installConfigs: [{ tool: "tool-a" }],
    };
    addApproval(noVersion, "acme", output, new Map());

    assert.equal("version" in output.mcp[0].approvals[0], false);
  });

  it("defaults installConfigs to empty array when omitted", () => {
    const output = emptyOutput();
    const approval: ApprovalData = {
      serverId: "io.example/server",
      date: "2026-05-01",
    };
    addApproval(approval, "curator", output, new Map());

    assert.equal(output.mcp[0].approvals[0].installConfigs.length, 0);
    assert.equal(output.mcp[0].approvals[0].organizationId, "curator");
  });
});

describe("enrichWithRegistryData", () => {
  it("updates name, description, latestVersion, and verified status", () => {
    const entry: McpEntry = {
      serverId: "io.example/server",
      name: "io.example/server",
      description: "",
      mcpRegistryVerified: false,
      approvals: [],
    };

    enrichWithRegistryData(entry, {
      name: "Example Server",
      description: "A great server",
      verified: true,
      latestVersion: "2.0.0",
    });

    assert.equal(entry.name, "Example Server");
    assert.equal(entry.description, "A great server");
    assert.equal(entry.latestVersion, "2.0.0");
    assert.equal(entry.mcpRegistryVerified, true);
  });

  it("sets version to latestVersion on approvals without a pinned version", () => {
    const entry: McpEntry = {
      serverId: "io.example/server",
      name: "io.example/server",
      description: "",
      mcpRegistryVerified: false,
      approvals: [
        {
          organizationId: "acme",
          date: "2026-05-01",
          configHash: "abc",
          installConfigs: [],
        },
      ],
    };

    enrichWithRegistryData(entry, {
      name: "Example Server",
      description: "A great server",
      verified: true,
      latestVersion: "3.1.0",
    });

    assert.equal(entry.approvals[0].version, "3.1.0");
  });

  it("preserves pinned version on approvals that already have one", () => {
    const entry: McpEntry = {
      serverId: "io.example/server",
      name: "io.example/server",
      description: "",
      mcpRegistryVerified: false,
      approvals: [
        {
          organizationId: "acme",
          date: "2026-05-01",
          version: "1.0.0",
          configHash: "abc",
          installConfigs: [],
        },
      ],
    };

    enrichWithRegistryData(entry, {
      name: "Example Server",
      description: "A great server",
      verified: true,
      latestVersion: "3.1.0",
    });

    assert.equal(entry.approvals[0].version, "1.0.0");
    assert.equal(entry.latestVersion, "3.1.0");
  });
});

describe("resolveVendorMetadata", () => {
  function baseEntry(overrides: Partial<McpEntry> = {}): McpEntry {
    return {
      serverId: "io.example/server",
      name: "io.example/server",
      description: "",
      mcpRegistryVerified: false,
      approvals: [],
      ...overrides,
    };
  }

  it("fills name/description from a single vendor-suggested metadata", () => {
    const entry = baseEntry({
      approvals: [
        {
          organizationId: "acme",
          date: "2026-05-01",
          configHash: "abc",
          installConfigs: [],
          metadata: { name: "Acme Server", description: "Suggested by Acme" },
        },
      ],
    });

    resolveVendorMetadata(entry);

    assert.equal(entry.name, "Acme Server");
    assert.equal(entry.description, "Suggested by Acme");
    assert.equal(entry.mcpRegistryVerified, false);
    assert.equal(entry.publisherClaimedBy, undefined);
  });

  it("prefers the earliest-dated metadata when two vendors disagree", () => {
    const entry = baseEntry({
      approvals: [
        {
          organizationId: "later-org",
          date: "2026-05-10",
          configHash: "abc",
          installConfigs: [],
          metadata: { name: "Later Name", description: "Later description" },
        },
        {
          organizationId: "earlier-org",
          date: "2026-05-01",
          configHash: "def",
          installConfigs: [],
          metadata: {
            name: "Earlier Name",
            description: "Earlier description",
          },
        },
      ],
    });

    resolveVendorMetadata(entry);

    assert.equal(entry.name, "Earlier Name");
    assert.equal(entry.description, "Earlier description");
  });

  it("breaks an exact date tie alphabetically by org id", () => {
    const entry = baseEntry({
      approvals: [
        {
          organizationId: "zebra-org",
          date: "2026-05-01",
          configHash: "abc",
          installConfigs: [],
          metadata: { name: "Zebra Name", description: "Zebra description" },
        },
        {
          organizationId: "acme",
          date: "2026-05-01",
          configHash: "def",
          installConfigs: [],
          metadata: { name: "Acme Name", description: "Acme description" },
        },
      ],
    });

    resolveVendorMetadata(entry);

    assert.equal(entry.name, "Acme Name");
    assert.equal(entry.description, "Acme description");
  });

  it("sets publisherClaimedBy and fills metadata for a publisher-claimed approval", () => {
    const entry = baseEntry({
      approvals: [
        {
          organizationId: "acme",
          date: "2026-05-01",
          configHash: "abc",
          installConfigs: [],
          selfPublished: true,
          metadata: { name: "Acme Server", description: "We built this" },
        },
      ],
    });

    resolveVendorMetadata(entry);

    assert.equal(entry.publisherClaimedBy, "acme");
    assert.equal(entry.name, "Acme Server");
    assert.equal(entry.description, "We built this");
  });

  it("throws when two different organizations both self-publish the same server", () => {
    const entry = baseEntry({
      approvals: [
        {
          organizationId: "acme",
          date: "2026-05-01",
          configHash: "abc",
          installConfigs: [],
          selfPublished: true,
        },
        {
          organizationId: "other-org",
          date: "2026-05-02",
          configHash: "def",
          installConfigs: [],
          selfPublished: true,
        },
      ],
    });

    assert.throws(() => {
      resolveVendorMetadata(entry);
    }, /io\.example\/server/);
  });

  it("does not overwrite registry-verified name/description with vendor metadata, but still marks publisherClaimedBy", () => {
    const entry = baseEntry({
      name: "Registry Name",
      description: "Registry description",
      mcpRegistryVerified: true,
      approvals: [
        {
          organizationId: "acme",
          date: "2026-05-01",
          configHash: "abc",
          installConfigs: [],
          selfPublished: true,
          metadata: { name: "Vendor Name", description: "Vendor description" },
        },
      ],
    });

    resolveVendorMetadata(entry);

    assert.equal(entry.name, "Registry Name");
    assert.equal(entry.description, "Registry description");
    assert.equal(entry.publisherClaimedBy, "acme");
  });
});

describe("buildToolView", () => {
  function servers(): McpEntry[] {
    return [
      {
        serverId: "io.example/server-1",
        name: "Server 1",
        description: "Approved for both tools",
        mcpRegistryVerified: true,
        approvals: [
          {
            organizationId: "acme",
            date: "2026-05-01",
            configHash: "aaa",
            installConfigs: [{ tool: "tool-a", instructions: "use tool-a" }],
          },
          {
            organizationId: "other",
            date: "2026-05-02",
            configHash: "bbb",
            installConfigs: [{ tool: "tool-b", instructions: "use tool-b" }],
          },
        ],
      },
      {
        serverId: "io.example/server-2",
        name: "Server 2",
        description: "Approved for tool-b only",
        mcpRegistryVerified: true,
        approvals: [
          {
            organizationId: "other",
            date: "2026-05-01",
            configHash: "ccc",
            installConfigs: [{ tool: "tool-b", instructions: "use tool-b" }],
          },
        ],
      },
    ];
  }

  it("only includes servers approved for the target tool", () => {
    const view = buildToolView("tool-a", servers());
    assert.equal(view.length, 1);
    assert.equal(view[0].serverId, "io.example/server-1");
  });

  it("keeps full install configs for the target tool's approvals", () => {
    const view = buildToolView("tool-a", servers());
    const acmeApproval = view[0].approvals.find(
      (a) => a.organizationId === "acme",
    )!;
    assert.equal(acmeApproval.installConfigs.length, 1);
    assert.equal(acmeApproval.installConfigs[0].tool, "tool-a");
  });

  it("strips install configs from other tools' approvals on the same server", () => {
    const view = buildToolView("tool-a", servers());
    const otherApproval = view[0].approvals.find(
      (a) => a.organizationId === "other",
    )!;
    assert.equal(otherApproval.installConfigs.length, 0);
  });

  it("preserves all approvals (from all orgs) on included servers", () => {
    const view = buildToolView("tool-a", servers());
    assert.equal(view[0].approvals.length, 2);
  });

  it("filters out other tools' install configs from multi-tool approvals", () => {
    const multiToolServers: McpEntry[] = [
      {
        serverId: "io.example/multi",
        name: "Multi",
        description: "One approval with configs for both tools",
        mcpRegistryVerified: true,
        approvals: [
          {
            organizationId: "acme",
            date: "2026-05-01",
            configHash: "ddd",
            installConfigs: [
              { tool: "tool-a", instructions: "use tool-a" },
              { tool: "tool-b", instructions: "use tool-b" },
            ],
          },
        ],
      },
    ];

    const view = buildToolView("tool-a", multiToolServers);
    assert.equal(view.length, 1);
    assert.equal(view[0].approvals[0].installConfigs.length, 1);
    assert.equal(view[0].approvals[0].installConfigs[0].tool, "tool-a");
  });

  it("does not mutate the original input", () => {
    const original = servers();
    buildToolView("tool-a", original);

    assert.equal(original.length, 2);
    assert.equal(original[0].approvals[1].installConfigs.length, 1);
  });
});

// --- Skill support ---

describe("addSkillApproval", () => {
  const skillApproval: SkillApprovalData = {
    skillId: "io.example/my-skill",
    date: "2026-06-01",
    source: {
      url: "https://github.com/example/skills.git",
      path: "skills/my-skill",
    },
    installConfigs: [
      {
        tool: "tool-a",
        installUrl: "tool-a://install-skill?id=io.example/my-skill",
      },
    ],
  };

  it("creates a new skill entry", () => {
    const output = emptyOutput();
    addSkillApproval(skillApproval, "acme", output);

    assert.equal(output.skills.length, 1);
    assert.equal(output.skills[0].skillId, "io.example/my-skill");
    assert.equal(output.skills[0].name, "io.example/my-skill");
    assert.equal(output.skills[0].description, "");
    assert.equal(output.skills[0].contentHash, "");
    assert.equal(output.skills[0].approvals.length, 1);
    assert.equal(output.skills[0].approvals[0].organizationId, "acme");
  });

  it("merges approvals from multiple vendors for the same skill", () => {
    const output = emptyOutput();
    addSkillApproval(skillApproval, "acme", output);
    addSkillApproval(
      { ...skillApproval, installConfigs: [{ tool: "tool-b" }] },
      "other-org",
      output,
    );

    assert.equal(output.skills.length, 1);
    assert.equal(output.skills[0].approvals.length, 2);
    assert.equal(output.skills[0].approvals[1].organizationId, "other-org");
  });

  it("produces a stable configHash", () => {
    const output1 = emptyOutput();
    const output2 = emptyOutput();
    addSkillApproval(skillApproval, "acme", output1);
    addSkillApproval(skillApproval, "acme", output2);

    assert.equal(
      output1.skills[0].approvals[0].configHash,
      output2.skills[0].approvals[0].configHash,
    );
  });

  it("produces different configHash when approval data changes", () => {
    const output1 = emptyOutput();
    const output2 = emptyOutput();
    addSkillApproval(skillApproval, "acme", output1);
    addSkillApproval({ ...skillApproval, date: "2026-06-02" }, "acme", output2);

    assert.notEqual(
      output1.skills[0].approvals[0].configHash,
      output2.skills[0].approvals[0].configHash,
    );
  });

  it("stores array path as-is", () => {
    const output = emptyOutput();
    addSkillApproval(
      {
        skillId: "io.example",
        date: "2026-06-01",
        source: {
          url: "https://github.com/example/repo.git",
          path: ["skills/a", "skills/b"],
        },
        installConfigs: [],
      },
      "acme",
      output,
    );
    assert.equal(output.skills.length, 1);
    assert.deepEqual(output.skills[0].source.path, ["skills/a", "skills/b"]);
  });

  it("stores glob path as-is", () => {
    const output = emptyOutput();
    addSkillApproval(
      {
        skillId: "io.example",
        date: "2026-06-01",
        source: {
          url: "https://github.com/example/repo.git",
          path: "skills/*",
        },
        installConfigs: [],
      },
      "acme",
      output,
    );
    assert.equal(output.skills.length, 1);
    assert.equal(output.skills[0].source.path, "skills/*");
  });
});

describe("addOrganization — trust extraction", () => {
  it("collects a skill trust entry", () => {
    const output = emptyOutput();
    const skillTrusts: SkillTrustEntry[] = [];
    addOrganization(
      {
        id: "theia",
        name: "Theia IDE",
        description: "Test",
        website: "https://theia-ide.org",
        trusts: [{ org: "anthropic", artifactTypes: { skills: {} } }],
      },
      output,
      skillTrusts,
    );

    assert.deepEqual(skillTrusts, [{ org: "theia", trustedOrg: "anthropic" }]);
  });

  it("does not include trusts in the organization entry", () => {
    const output = emptyOutput();
    addOrganization(
      {
        id: "theia",
        name: "Theia IDE",
        description: "Test",
        website: "https://theia-ide.org",
        trusts: [{ org: "anthropic", artifactTypes: { skills: {} } }],
      },
      output,
      [],
    );

    assert.equal("trusts" in output.organizations[0], false);
  });

  it("ignores a trust entry with no recognized artifact type", () => {
    const output = emptyOutput();
    const skillTrusts: SkillTrustEntry[] = [];
    addOrganization(
      {
        id: "theia",
        name: "Theia IDE",
        description: "Test",
        website: "https://theia-ide.org",
        trusts: [{ org: "anthropic", artifactTypes: {} }],
      },
      output,
      skillTrusts,
    );

    assert.deepEqual(skillTrusts, []);
  });
});

describe("filterValidSkillTrusts", () => {
  const vendorIds = new Set(["theia", "anthropic", "openai", "aws"]);

  it("keeps trust entries referencing registered vendors", () => {
    const { valid, unknown } = filterValidSkillTrusts(
      [
        { org: "theia", trustedOrg: "anthropic" },
        { org: "theia", trustedOrg: "aws" },
      ],
      vendorIds,
    );
    assert.equal(valid.length, 2);
    assert.equal(unknown.length, 0);
  });

  it("separates out trust entries referencing an unregistered org", () => {
    const { valid, unknown } = filterValidSkillTrusts(
      [
        { org: "theia", trustedOrg: "anthropic" },
        { org: "theia", trustedOrg: "nonexistent" },
      ],
      vendorIds,
    );
    assert.equal(valid.length, 1);
    assert.equal(valid[0].trustedOrg, "anthropic");
    assert.equal(unknown.length, 1);
    assert.equal(unknown[0].trustedOrg, "nonexistent");
  });
});

describe("resolveSkillTrust", () => {
  function skillWithApproval(
    skillId: string,
    organizationId: string,
  ): SkillEntry {
    return {
      skillId,
      name: skillId,
      description: "",
      source: { url: "https://github.com/example/skills.git" },
      contentHash: "",
      approvals: [
        {
          organizationId,
          date: "2026-06-01",
          configHash: "abc123",
          installConfigs: [],
        },
      ],
    };
  }

  it("adds a derived approval tagged with viaTrust", () => {
    const output = emptyOutput();
    output.skills = [skillWithApproval("io.example/a", "anthropic")];

    resolveSkillTrust(output, [{ org: "theia", trustedOrg: "anthropic" }]);

    assert.equal(output.skills[0].approvals.length, 2);
    const derived = output.skills[0].approvals[1];
    assert.equal(derived.organizationId, "theia");
    assert.equal(derived.viaTrust, "anthropic");
    // "theia" has no tools in output.tools here, so there's nothing to
    // generate an installConfig for — see the next test for the case where
    // the trusting org does provide tools.
    assert.deepEqual(derived.installConfigs, []);
    assert.equal(derived.date, "2026-06-01");
  });

  it("gives the derived approval an installConfig for each of the trusting org's own tools", () => {
    const output = emptyOutput();
    output.tools = [
      { id: "theia-ide", name: "Theia IDE", organizationId: "theia" },
      { id: "theia-ide-next", name: "Theia IDE Next", organizationId: "theia" },
      { id: "other-tool", name: "Other Tool", organizationId: "other-org" },
    ];
    output.skills = [skillWithApproval("io.example/a", "anthropic")];

    resolveSkillTrust(output, [{ org: "theia", trustedOrg: "anthropic" }]);

    const derived = output.skills[0].approvals[1];
    assert.deepEqual(derived.installConfigs.map((c) => c.tool).sort(), [
      "theia-ide",
      "theia-ide-next",
    ]);
  });

  it("lets resolveSkillInstallUrls fill in installUrl for a derived approval", () => {
    const output = emptyOutput();
    output.tools = [
      {
        id: "theia-ide",
        name: "Theia IDE",
        organizationId: "theia",
        skillInstallUrlPrefix: "theia://install-skill?id=",
      },
    ];
    output.skills = [skillWithApproval("io.example/a", "anthropic")];

    resolveSkillTrust(output, [{ org: "theia", trustedOrg: "anthropic" }]);
    resolveSkillInstallUrls(output);

    const derived = output.skills[0].approvals[1];
    assert.equal(
      derived.installConfigs[0].installUrl,
      "theia://install-skill?id=io.example/a",
    );
  });

  it("merges trust from multiple trusted organizations", () => {
    const output = emptyOutput();
    output.skills = [
      skillWithApproval("io.example/a", "anthropic"),
      skillWithApproval("io.example/b", "openai"),
      skillWithApproval("io.example/c", "aws"),
    ];

    resolveSkillTrust(output, [
      { org: "theia", trustedOrg: "anthropic" },
      { org: "theia", trustedOrg: "openai" },
      { org: "theia", trustedOrg: "aws" },
    ]);

    for (const skill of output.skills) {
      assert.ok(
        skill.approvals.some((a) => a.organizationId === "theia"),
        `expected ${skill.skillId} to have a theia approval`,
      );
    }
  });

  it("does not add a derived approval when the trusted org has none", () => {
    const output = emptyOutput();
    output.skills = [skillWithApproval("io.example/a", "openai")];

    resolveSkillTrust(output, [{ org: "theia", trustedOrg: "anthropic" }]);

    assert.equal(output.skills[0].approvals.length, 1);
  });

  it("does not add a derived approval when the trusting org already approved directly", () => {
    const output = emptyOutput();
    const skill = skillWithApproval("io.example/a", "anthropic");
    skill.approvals.push({
      organizationId: "theia",
      date: "2026-06-02",
      configHash: "def456",
      installConfigs: [],
    });
    output.skills = [skill];

    resolveSkillTrust(output, [{ org: "theia", trustedOrg: "anthropic" }]);

    const theiaApprovals = output.skills[0].approvals.filter(
      (a) => a.organizationId === "theia",
    );
    // Two entries for the same org would render as a duplicate badge (the
    // website keys badges by organizationId) and inflate the approval count,
    // so the org's own direct approval wins and no derived copy is added.
    assert.equal(theiaApprovals.length, 1);
    assert.equal(theiaApprovals[0].viaTrust, undefined);
  });

  it("does not chain trust through a trust-derived approval", () => {
    const output = emptyOutput();
    // "openai" has no direct approval, only one derived via trusting "anthropic"
    output.skills = [skillWithApproval("io.example/a", "anthropic")];
    resolveSkillTrust(output, [{ org: "openai", trustedOrg: "anthropic" }]);

    // a third org trusting "openai" should get nothing, since openai's only
    // approval for this skill is itself trust-derived
    resolveSkillTrust(output, [{ org: "theia", trustedOrg: "openai" }]);

    assert.equal(
      output.skills[0].approvals.some((a) => a.organizationId === "theia"),
      false,
    );
  });
});

describe("installUrl auto-generation (MCP)", () => {
  function outputWithTool(mcpInstallUrlPrefix?: string): ConsolidatedOutput {
    const output = emptyOutput();
    addOrganization(
      {
        id: "acme",
        name: "Acme",
        description: "Test",
        website: "https://acme.com",
        tools: [{ id: "tool-a", name: "Tool A", mcpInstallUrlPrefix }],
      },
      output,
    );
    return output;
  }

  it("generates installUrl when prefix is set and installUrl is absent", () => {
    const output = outputWithTool("tool-a://install-mcp?id=");
    addApproval(
      {
        serverId: "ai.example/my-server",
        date: "2026-06-01",
        installConfigs: [{ tool: "tool-a" }],
      },
      "acme",
      output,
      new Map(),
    );
    const cfg = output.mcp[0].approvals[0].installConfigs[0];
    assert.equal(
      cfg.installUrl,
      "tool-a://install-mcp?id=ai.example/my-server",
    );
  });

  it("does not overwrite an explicit installUrl", () => {
    const output = outputWithTool("tool-a://install-mcp?id=");
    addApproval(
      {
        serverId: "ai.example/my-server",
        date: "2026-06-01",
        installConfigs: [{ tool: "tool-a", installUrl: "custom://explicit" }],
      },
      "acme",
      output,
      new Map(),
    );
    const cfg = output.mcp[0].approvals[0].installConfigs[0];
    assert.equal(cfg.installUrl, "custom://explicit");
  });

  it("leaves installUrl absent when no prefix is defined", () => {
    const output = outputWithTool(undefined);
    addApproval(
      {
        serverId: "ai.example/my-server",
        date: "2026-06-01",
        installConfigs: [{ tool: "tool-a" }],
      },
      "acme",
      output,
      new Map(),
    );
    const cfg = output.mcp[0].approvals[0].installConfigs[0];
    assert.equal(cfg.installUrl, undefined);
  });
});

describe("installUrl auto-generation (skills)", () => {
  function outputWithTool(skillInstallUrlPrefix?: string): ConsolidatedOutput {
    const output = emptyOutput();
    addOrganization(
      {
        id: "acme",
        name: "Acme",
        description: "Test",
        website: "https://acme.com",
        tools: [{ id: "tool-a", name: "Tool A", skillInstallUrlPrefix }],
      },
      output,
    );
    return output;
  }

  it("generates installUrl when prefix is set and installUrl is absent", () => {
    const output = outputWithTool("tool-a://install-skill?id=");
    addSkillApproval(
      {
        skillId: "io.github.example/my-skill",
        date: "2026-06-01",
        source: { url: "https://github.com/example/skills.git" },
        installConfigs: [{ tool: "tool-a" }],
      },
      "acme",
      output,
    );
    resolveSkillInstallUrls(output);
    const cfg = output.skills[0].approvals[0].installConfigs[0];
    assert.equal(
      cfg.installUrl,
      "tool-a://install-skill?id=io.github.example/my-skill",
    );
  });

  it("uses the expanded skillId, not the base approval skillId", () => {
    const output = outputWithTool("tool-a://install-skill?id=");
    addSkillApproval(
      {
        skillId: "io.github.mattpocock",
        date: "2026-06-01",
        source: { url: "https://github.com/mattpocock/skills.git" },
        installConfigs: [{ tool: "tool-a" }],
      },
      "acme",
      output,
    );
    // Simulate glob expansion replacing the base entry with a sub-skill entry
    output.skills[0].skillId = "io.github.mattpocock/test";
    resolveSkillInstallUrls(output);
    const cfg = output.skills[0].approvals[0].installConfigs[0];
    assert.equal(
      cfg.installUrl,
      "tool-a://install-skill?id=io.github.mattpocock/test",
    );
  });

  it("does not overwrite an explicit installUrl", () => {
    const output = outputWithTool("tool-a://install-skill?id=");
    addSkillApproval(
      {
        skillId: "io.github.example/my-skill",
        date: "2026-06-01",
        source: { url: "https://github.com/example/skills.git" },
        installConfigs: [{ tool: "tool-a", installUrl: "custom://explicit" }],
      },
      "acme",
      output,
    );
    resolveSkillInstallUrls(output);
    const cfg = output.skills[0].approvals[0].installConfigs[0];
    assert.equal(cfg.installUrl, "custom://explicit");
  });

  it("leaves installUrl absent when no prefix is defined", () => {
    const output = outputWithTool(undefined);
    addSkillApproval(
      {
        skillId: "io.github.example/my-skill",
        date: "2026-06-01",
        source: { url: "https://github.com/example/skills.git" },
        installConfigs: [{ tool: "tool-a" }],
      },
      "acme",
      output,
    );
    resolveSkillInstallUrls(output);
    const cfg = output.skills[0].approvals[0].installConfigs[0];
    assert.equal(cfg.installUrl, undefined);
  });
});

describe("buildToolSkillView", () => {
  function skills(): SkillEntry[] {
    return [
      {
        skillId: "io.example/skill-1",
        name: "Skill 1",
        description: "For both tools",
        source: {
          url: "https://github.com/example/skills.git",
          path: "skills/skill-1",
        },
        contentHash: "abc123",
        approvals: [
          {
            organizationId: "acme",
            date: "2026-06-01",
            configHash: "aaa",
            installConfigs: [
              { tool: "tool-a", installUrl: "tool-a://install" },
            ],
          },
          {
            organizationId: "other",
            date: "2026-06-02",
            configHash: "bbb",
            installConfigs: [{ tool: "tool-b" }],
          },
        ],
      },
      {
        skillId: "io.example/skill-2",
        name: "Skill 2",
        description: "For tool-b only",
        source: {
          url: "https://github.com/example/skills.git",
          path: "skills/skill-2",
        },
        contentHash: "def456",
        approvals: [
          {
            organizationId: "other",
            date: "2026-06-01",
            configHash: "ccc",
            installConfigs: [{ tool: "tool-b" }],
          },
        ],
      },
    ];
  }

  it("only includes skills approved for the target tool", () => {
    const view = buildToolSkillView("tool-a", skills());
    assert.equal(view.length, 1);
    assert.equal(view[0].skillId, "io.example/skill-1");
  });

  it("filters installConfigs to the target tool", () => {
    const view = buildToolSkillView("tool-a", skills());
    const acmeApproval = view[0].approvals.find(
      (a) => a.organizationId === "acme",
    )!;
    assert.equal(acmeApproval.installConfigs.length, 1);
    assert.equal(acmeApproval.installConfigs[0].tool, "tool-a");
  });

  it("preserves all approvals on included skills", () => {
    const view = buildToolSkillView("tool-a", skills());
    assert.equal(view[0].approvals.length, 2);
  });

  it("does not mutate the original input", () => {
    const original = skills();
    buildToolSkillView("tool-a", original);

    assert.equal(original.length, 2);
    assert.equal(original[0].approvals[1].installConfigs.length, 1);
  });
});

describe("addOrganization — mcp trust extraction", () => {
  it("collects an mcp trust entry", () => {
    const output = emptyOutput();
    const skillTrusts: SkillTrustEntry[] = [];
    const mcpTrusts: McpTrustEntry[] = [];
    addOrganization(
      {
        id: "theia",
        name: "Theia IDE",
        description: "IDE",
        website: "https://theia-ide.org",
        trusts: [{ org: "eclipsesource", artifactTypes: { mcp: {} } }],
      },
      output,
      skillTrusts,
      mcpTrusts,
    );
    assert.deepEqual(mcpTrusts, [
      { org: "theia", trustedOrg: "eclipsesource" },
    ]);
    assert.deepEqual(skillTrusts, []);
  });

  it("collects both a skill and an mcp trust entry from the same organization", () => {
    const output = emptyOutput();
    const skillTrusts: SkillTrustEntry[] = [];
    const mcpTrusts: McpTrustEntry[] = [];
    addOrganization(
      {
        id: "theia",
        name: "Theia IDE",
        description: "IDE",
        website: "https://theia-ide.org",
        trusts: [
          { org: "anthropic", artifactTypes: { skills: {} } },
          { org: "eclipsesource", artifactTypes: { mcp: {} } },
        ],
      },
      output,
      skillTrusts,
      mcpTrusts,
    );
    assert.deepEqual(skillTrusts, [{ org: "theia", trustedOrg: "anthropic" }]);
    assert.deepEqual(mcpTrusts, [
      { org: "theia", trustedOrg: "eclipsesource" },
    ]);
  });
});

describe("addApproval — genericConfig and same-approval derivation", () => {
  it("populates Approval.genericConfig verbatim from the approval's own root config", () => {
    const output = emptyOutput();
    const genericConfigs = new Map<string, GenericMcpConfigEntry[]>();
    addApproval(
      {
        serverId: "io.example/foo",
        date: "2026-08-05",
        config: { url: "https://mcp.example.com" },
      },
      "eclipsesource",
      output,
      genericConfigs,
    );
    assert.deepEqual(output.mcp[0].approvals[0].genericConfig, {
      url: "https://mcp.example.com",
    });
  });

  it("leaves genericConfig unset when the approval has no root config", () => {
    const output = emptyOutput();
    const genericConfigs = new Map<string, GenericMcpConfigEntry[]>();
    addApproval(
      { serverId: "io.example/foo", date: "2026-08-05" },
      "eclipsesource",
      output,
      genericConfigs,
    );
    assert.equal("genericConfig" in output.mcp[0].approvals[0], false);
  });

  it("records the approval's root config in the genericConfigsByServerId side table", () => {
    const output = emptyOutput();
    const genericConfigs = new Map<string, GenericMcpConfigEntry[]>();
    addApproval(
      {
        serverId: "io.example/foo",
        date: "2026-08-05",
        config: { url: "https://mcp.example.com" },
      },
      "eclipsesource",
      output,
      genericConfigs,
    );
    assert.deepEqual(genericConfigs.get("io.example/foo"), [
      {
        organizationId: "eclipsesource",
        date: "2026-08-05",
        config: { url: "https://mcp.example.com" },
      },
    ]);
  });

  it('derives installConfigs config: "derived" from this approval\'s own root config', () => {
    const output = emptyOutput();
    const genericConfigs = new Map<string, GenericMcpConfigEntry[]>();
    output.tools.push({
      id: "theia-ide",
      name: "Theia IDE",
      organizationId: "theia",
    });
    addApproval(
      {
        serverId: "io.example/foo",
        date: "2026-08-05",
        config: { url: "https://mcp.example.com" },
        installConfigs: [{ tool: "theia-ide", config: "derived" }],
      },
      "theia",
      output,
      genericConfigs,
    );
    assert.deepEqual(output.mcp[0].approvals[0].installConfigs[0].config, {
      servers: { foo: { serverUrl: "https://mcp.example.com" } },
    });
  });

  it('leaves config as the literal "derived" string when no transform is registered for the tool', () => {
    const output = emptyOutput();
    const genericConfigs = new Map<string, GenericMcpConfigEntry[]>();
    output.tools.push({
      id: "unregistered-tool",
      name: "Unregistered Tool",
      organizationId: "acme",
    });
    addApproval(
      {
        serverId: "io.example/foo",
        date: "2026-08-05",
        config: { url: "https://mcp.example.com" },
        installConfigs: [{ tool: "unregistered-tool", config: "derived" }],
      },
      "acme",
      output,
      genericConfigs,
    );
    assert.equal(
      output.mcp[0].approvals[0].installConfigs[0].config,
      "derived",
    );
  });

  it("leaves an explicit object config untouched, ignoring any root config", () => {
    const output = emptyOutput();
    const genericConfigs = new Map<string, GenericMcpConfigEntry[]>();
    output.tools.push({
      id: "theia-ide",
      name: "Theia IDE",
      organizationId: "theia",
    });
    addApproval(
      {
        serverId: "io.example/foo",
        date: "2026-08-05",
        config: { url: "https://mcp.example.com" },
        installConfigs: [
          { tool: "theia-ide", config: { servers: { custom: {} } } },
        ],
      },
      "theia",
      output,
      genericConfigs,
    );
    assert.deepEqual(output.mcp[0].approvals[0].installConfigs[0].config, {
      servers: { custom: {} },
    });
  });
});

describe("pickWinningGenericConfig", () => {
  it("returns undefined for an empty candidate list", () => {
    assert.equal(pickWinningGenericConfig([], "io.example/foo"), undefined);
  });

  it("returns the only candidate when there's exactly one", () => {
    const candidate = {
      organizationId: "eclipsesource",
      date: "2026-08-01",
      config: { url: "https://a.example.com" },
    };
    assert.deepEqual(
      pickWinningGenericConfig([candidate], "io.example/foo"),
      candidate,
    );
  });

  it("picks the newest by date when two different orgs both contribute one", () => {
    const older = {
      organizationId: "vendor-a",
      date: "2026-01-01",
      config: { url: "https://a.example.com" },
    };
    const newer = {
      organizationId: "vendor-b",
      date: "2026-06-01",
      config: { url: "https://b.example.com" },
    };
    assert.deepEqual(
      pickWinningGenericConfig([older, newer], "io.example/foo"),
      newer,
    );
  });
});

describe("resolveMcpCrossVendorConfigs", () => {
  it('resolves a "derived" entry using another vendor\'s root config for the same server', () => {
    const output = emptyOutput();
    output.tools.push({
      id: "theia-ide",
      name: "Theia IDE",
      organizationId: "theia",
    });
    output.mcp.push({
      serverId: "io.example/foo",
      name: "foo",
      description: "",
      mcpRegistryVerified: false,
      approvals: [
        {
          organizationId: "theia",
          date: "2026-08-05",
          configHash: "abc",
          installConfigs: [{ tool: "theia-ide", config: "derived" }],
        },
      ],
    });
    const genericConfigs = new Map([
      [
        "io.example/foo",
        [
          {
            organizationId: "eclipsesource",
            date: "2026-08-01",
            config: { url: "https://mcp.example.com" },
          },
        ],
      ],
    ]);

    resolveMcpCrossVendorConfigs(output, genericConfigs);

    assert.deepEqual(output.mcp[0].approvals[0].installConfigs[0].config, {
      servers: { foo: { serverUrl: "https://mcp.example.com" } },
    });
  });

  it("strips config to unset when no generic config is available anywhere", () => {
    const output = emptyOutput();
    output.tools.push({
      id: "theia-ide",
      name: "Theia IDE",
      organizationId: "theia",
    });
    output.mcp.push({
      serverId: "io.example/foo",
      name: "foo",
      description: "",
      mcpRegistryVerified: false,
      approvals: [
        {
          organizationId: "theia",
          date: "2026-08-05",
          configHash: "abc",
          installConfigs: [{ tool: "theia-ide", config: "derived" }],
        },
      ],
    });

    resolveMcpCrossVendorConfigs(output, new Map());

    assert.equal(
      "config" in output.mcp[0].approvals[0].installConfigs[0],
      false,
    );
  });

  it("leaves an already-resolved config untouched", () => {
    const output = emptyOutput();
    output.mcp.push({
      serverId: "io.example/foo",
      name: "foo",
      description: "",
      mcpRegistryVerified: false,
      approvals: [
        {
          organizationId: "theia",
          date: "2026-08-05",
          configHash: "abc",
          installConfigs: [
            { tool: "theia-ide", config: { servers: { custom: {} } } },
          ],
        },
      ],
    });

    resolveMcpCrossVendorConfigs(output, new Map());

    assert.deepEqual(output.mcp[0].approvals[0].installConfigs[0].config, {
      servers: { custom: {} },
    });
  });
});

describe("filterValidMcpTrusts", () => {
  it("keeps trust entries referencing registered vendors", () => {
    const { valid, unknown } = filterValidMcpTrusts(
      [{ org: "theia", trustedOrg: "eclipsesource" }],
      new Set(["theia", "eclipsesource"]),
    );
    assert.equal(valid.length, 1);
    assert.equal(unknown.length, 0);
  });

  it("separates out trust entries referencing an unregistered org", () => {
    const { valid, unknown } = filterValidMcpTrusts(
      [
        { org: "theia", trustedOrg: "eclipsesource" },
        { org: "theia", trustedOrg: "nonexistent" },
      ],
      new Set(["theia", "eclipsesource"]),
    );
    assert.equal(valid.length, 1);
    assert.equal(valid[0].trustedOrg, "eclipsesource");
    assert.equal(unknown.length, 1);
    assert.equal(unknown[0].trustedOrg, "nonexistent");
  });
});

describe("resolveMcpTrust", () => {
  function baseOutput(): ConsolidatedOutput {
    const output = emptyOutput();
    output.tools.push({
      id: "theia-ide",
      name: "Theia IDE",
      organizationId: "theia",
      mcpInstallUrlPrefix: "theia://install-mcp?id=",
    });
    output.tools.push({
      id: "theia-ide-next",
      name: "Theia IDE Next",
      organizationId: "theia",
      mcpInstallUrlPrefix: "theia-next://install-mcp?id=",
    });
    output.mcp.push({
      serverId: "io.github.eclipsesource/review-guard",
      name: "review-guard",
      description: "",
      mcpRegistryVerified: false,
      approvals: [
        {
          organizationId: "eclipsesource",
          date: "2026-08-04",
          configHash: "abc",
          installConfigs: [],
          genericConfig: { url: "https://review-guard.example.com/mcp" },
        },
      ],
    });
    return output;
  }

  it("adds a viaTrust-tagged approval with derived tool cards for both of the trusting org's tools", () => {
    const output = baseOutput();
    const genericConfigs = new Map([
      [
        "io.github.eclipsesource/review-guard",
        [
          {
            organizationId: "eclipsesource",
            date: "2026-08-04",
            config: { url: "https://review-guard.example.com/mcp" },
          },
        ],
      ],
    ]);

    resolveMcpTrust(
      output,
      [{ org: "theia", trustedOrg: "eclipsesource" }],
      genericConfigs,
    );

    const derived = output.mcp[0].approvals.find(
      (a) => a.organizationId === "theia",
    );
    assert.ok(derived);
    assert.equal(derived!.viaTrust, "eclipsesource");
    assert.equal(derived!.installConfigs.length, 2);
    const theiaIde = derived!.installConfigs.find(
      (ic) => ic.tool === "theia-ide",
    );
    assert.deepEqual(theiaIde!.config, {
      servers: {
        "review-guard": { serverUrl: "https://review-guard.example.com/mcp" },
      },
    });
  });

  it("does not add a derived approval when the trusting org already approved directly", () => {
    const output = baseOutput();
    output.mcp[0].approvals.push({
      organizationId: "theia",
      date: "2026-08-05",
      configHash: "def",
      installConfigs: [],
    });

    resolveMcpTrust(
      output,
      [{ org: "theia", trustedOrg: "eclipsesource" }],
      new Map(),
    );

    const theiaApprovals = output.mcp[0].approvals.filter(
      (a) => a.organizationId === "theia",
    );
    assert.equal(theiaApprovals.length, 1);
    assert.equal(theiaApprovals[0].viaTrust, undefined);
  });

  it("does not chain trust through a trust-derived approval", () => {
    const output = baseOutput();
    // "openai" trusts eclipsesource and gets a derived (viaTrust) approval —
    // but has no tools, so no installConfigs entries are added.
    resolveMcpTrust(
      output,
      [{ org: "openai", trustedOrg: "eclipsesource" }],
      new Map(),
    );
    // A third org trusting "openai" should get nothing: openai's only
    // approval for this server is itself trust-derived.
    resolveMcpTrust(output, [{ org: "acme", trustedOrg: "openai" }], new Map());

    assert.equal(
      output.mcp[0].approvals.some((a) => a.organizationId === "acme"),
      false,
    );
  });

  it("auto-generates installUrl for derived installConfigs entries when the trusting org's tool defines mcpInstallUrlPrefix", () => {
    const output = baseOutput();
    const genericConfigs = new Map([
      [
        "io.github.eclipsesource/review-guard",
        [
          {
            organizationId: "eclipsesource",
            date: "2026-08-04",
            config: { url: "https://review-guard.example.com/mcp" },
          },
        ],
      ],
    ]);

    resolveMcpTrust(
      output,
      [{ org: "theia", trustedOrg: "eclipsesource" }],
      genericConfigs,
    );

    const derived = output.mcp[0].approvals.find(
      (a) => a.organizationId === "theia",
    );
    assert.ok(derived);
    const theiaIde = derived!.installConfigs.find(
      (ic) => ic.tool === "theia-ide",
    );
    const theiaIdeNext = derived!.installConfigs.find(
      (ic) => ic.tool === "theia-ide-next",
    );
    assert.ok(theiaIde);
    assert.ok(theiaIdeNext);
    assert.equal(
      theiaIde!.installUrl,
      "theia://install-mcp?id=io.github.eclipsesource/review-guard",
    );
    assert.equal(
      theiaIdeNext!.installUrl,
      "theia-next://install-mcp?id=io.github.eclipsesource/review-guard",
    );
    // installUrl coexists with the derived config, matching what a real
    // direct approval could produce.
    assert.deepEqual(theiaIde!.config, {
      servers: {
        "review-guard": { serverUrl: "https://review-guard.example.com/mcp" },
      },
    });
  });

  it("still adds the derived approval (with no install cards) when no generic config is available", () => {
    const output = baseOutput();
    // resolveMcpTrust only consults the genericConfigsByServerId map passed
    // in below, never approval.genericConfig directly — passing an empty
    // map here is what makes this "no generic config available" scenario.

    resolveMcpTrust(
      output,
      [{ org: "theia", trustedOrg: "eclipsesource" }],
      new Map(),
    );

    const derived = output.mcp[0].approvals.find(
      (a) => a.organizationId === "theia",
    );
    assert.ok(derived);
    assert.equal(derived!.installConfigs.length, 2);
    assert.equal("config" in derived!.installConfigs[0], false);
  });
});
