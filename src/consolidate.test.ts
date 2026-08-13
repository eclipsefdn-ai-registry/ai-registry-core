import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  addOrganization,
  addApproval,
  addSkillApproval,
  addPluginApproval,
  addAgentApproval,
  resolveSkillInstallUrls,
  resolveSkillTrust,
  resolveMcpTrust,
  resolvePluginTrust,
  resolveAgentTrust,
  filterValidTrusts,
  enrichWithRegistryData,
  resolveVendorMetadata,
  pickWinningGenericConfig,
  resolveMcpCrossVendorConfigs,
  buildToolView,
  buildToolSkillView,
  buildToolPluginView,
  buildToolAgentView,
  buildOrgEntryView,
  findOrCreate,
  configHashOf,
  type ConsolidatedOutput,
  type ApprovalData,
  type SkillApprovalData,
  type PluginApprovalData,
  type AgentApprovalData,
  type Approval,
  type McpEntry,
  type SkillEntry,
  type PluginEntry,
  type AgentEntry,
  type SkillTrustEntry,
  type McpTrustEntry,
  type PluginTrustEntry,
  type AgentTrustEntry,
} from "./consolidate.js";

function emptyOutput(): ConsolidatedOutput {
  return {
    organizations: [],
    tools: [],
    mcp: [],
    skills: [],
    plugins: [],
    agents: [],
  };
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
    addApproval(approval, "acme", output);

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
    addApproval(approval, "acme", output);
    addApproval(
      {
        ...approval,
        version: "2.0.0",
        installConfigs: [{ tool: "tool-b" }],
      },
      "other-org",
      output,
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
    addApproval(approval, "acme", output1);
    addApproval(approval, "acme", output2);

    const hash1 = output1.mcp[0].approvals[0].configHash;
    const hash2 = output2.mcp[0].approvals[0].configHash;
    assert.equal(typeof hash1, "string");
    assert.ok(hash1.length > 0);
    assert.equal(hash1, hash2, "same input should produce same hash");
  });

  it("produces different configHash when approval data changes", () => {
    const output1 = emptyOutput();
    const output2 = emptyOutput();
    addApproval(approval, "acme", output1);
    addApproval(
      {
        ...approval,
        installConfigs: [{ tool: "tool-a", instructions: "changed" }],
      },
      "acme",
      output2,
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
    addApproval(noVersion, "acme", output);

    assert.equal("version" in output.mcp[0].approvals[0], false);
  });

  it("defaults installConfigs to empty array when omitted", () => {
    const output = emptyOutput();
    const approval: ApprovalData = {
      serverId: "io.example/server",
      date: "2026-05-01",
    };
    addApproval(approval, "curator", output);

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

describe("addPluginApproval", () => {
  const pluginApproval: PluginApprovalData = {
    pluginId: "io.example/my-plugin",
    date: "2026-08-01",
    source: {
      url: "https://github.com/example/my-plugin.git",
    },
    installConfigs: [{ tool: "tool-a" }],
  };

  it("creates a new plugin entry", () => {
    const output = emptyOutput();
    addPluginApproval(pluginApproval, "acme", output);

    assert.equal(output.plugins.length, 1);
    assert.equal(output.plugins[0].pluginId, "io.example/my-plugin");
    assert.equal(output.plugins[0].name, "io.example/my-plugin");
    assert.equal(output.plugins[0].description, "");
    assert.equal(output.plugins[0].contentHash, "");
    assert.deepEqual(output.plugins[0].containedSkills, []);
    assert.deepEqual(output.plugins[0].containedMcpServers, []);
    assert.equal(output.plugins[0].approvals.length, 1);
    assert.equal(output.plugins[0].approvals[0].organizationId, "acme");
  });

  it("merges approvals from multiple vendors for the same plugin", () => {
    const output = emptyOutput();
    addPluginApproval(pluginApproval, "acme", output);
    addPluginApproval(
      { ...pluginApproval, installConfigs: [{ tool: "tool-b" }] },
      "other-org",
      output,
    );

    assert.equal(output.plugins.length, 1);
    assert.equal(output.plugins[0].approvals.length, 2);
    assert.equal(output.plugins[0].approvals[1].organizationId, "other-org");
  });

  it("produces a stable configHash", () => {
    const output1 = emptyOutput();
    const output2 = emptyOutput();
    addPluginApproval(pluginApproval, "acme", output1);
    addPluginApproval(pluginApproval, "acme", output2);

    assert.equal(
      output1.plugins[0].approvals[0].configHash,
      output2.plugins[0].approvals[0].configHash,
    );
  });

  it("produces different configHash when approval data changes", () => {
    const output1 = emptyOutput();
    const output2 = emptyOutput();
    addPluginApproval(pluginApproval, "acme", output1);
    addPluginApproval(
      { ...pluginApproval, date: "2026-08-02" },
      "acme",
      output2,
    );

    assert.notEqual(
      output1.plugins[0].approvals[0].configHash,
      output2.plugins[0].approvals[0].configHash,
    );
  });

  it("defaults installConfigs to an empty array when omitted", () => {
    const output = emptyOutput();
    addPluginApproval(
      {
        pluginId: "io.example/bare",
        date: "2026-08-01",
        source: pluginApproval.source,
      },
      "acme",
      output,
    );
    assert.deepEqual(output.plugins[0].approvals[0].installConfigs, []);
  });

  it("keeps the first-collected source when a second vendor's source differs", () => {
    const output = emptyOutput();
    addPluginApproval(pluginApproval, "acme", output);
    addPluginApproval(
      {
        ...pluginApproval,
        source: { url: "https://github.com/other/fork.git" },
      },
      "other-org",
      output,
    );

    assert.equal(output.plugins.length, 1);
    assert.deepEqual(output.plugins[0].source, pluginApproval.source);
  });

  it("still records both approvals when sources differ", () => {
    const output = emptyOutput();
    addPluginApproval(pluginApproval, "acme", output);
    addPluginApproval(
      {
        ...pluginApproval,
        source: { url: "https://github.com/other/fork.git" },
      },
      "other-org",
      output,
    );

    assert.equal(output.plugins[0].approvals.length, 2);
    assert.equal(output.plugins[0].approvals[0].organizationId, "acme");
    assert.equal(output.plugins[0].approvals[1].organizationId, "other-org");
  });

  it("does not warn when a second vendor's source matches exactly", () => {
    const output = emptyOutput();
    const warnCalls: unknown[][] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => warnCalls.push(args);
    try {
      addPluginApproval(pluginApproval, "acme", output);
      addPluginApproval(pluginApproval, "other-org", output);
    } finally {
      console.warn = originalWarn;
    }
    assert.equal(warnCalls.length, 0);
  });

  it("warns when a second vendor's source differs", () => {
    const output = emptyOutput();
    const warnCalls: unknown[][] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => warnCalls.push(args);
    try {
      addPluginApproval(pluginApproval, "acme", output);
      addPluginApproval(
        {
          ...pluginApproval,
          source: { url: "https://github.com/other/fork.git" },
        },
        "other-org",
        output,
      );
    } finally {
      console.warn = originalWarn;
    }
    assert.equal(warnCalls.length, 1);
    assert.match(String(warnCalls[0][0]), /io\.example\/my-plugin/);
  });
});

describe("addAgentApproval", () => {
  const agentApproval: AgentApprovalData = {
    agentId: "io.example/my-agent",
    date: "2026-08-01",
    source: {
      url: "https://example.com/agent_card.json",
    },
    installConfigs: [{ tool: "tool-a" }],
  };

  it("creates a new agent entry", () => {
    const output = emptyOutput();
    addAgentApproval(agentApproval, "acme", output);

    assert.equal(output.agents.length, 1);
    assert.equal(output.agents[0].agentId, "io.example/my-agent");
    assert.equal(output.agents[0].name, "io.example/my-agent");
    assert.equal(output.agents[0].description, "");
    assert.equal(output.agents[0].contentHash, "");
    assert.equal(output.agents[0].approvals.length, 1);
    assert.equal(output.agents[0].approvals[0].organizationId, "acme");
  });

  it("merges approvals from multiple vendors for the same agent", () => {
    const output = emptyOutput();
    addAgentApproval(agentApproval, "acme", output);
    addAgentApproval(
      { ...agentApproval, installConfigs: [{ tool: "tool-b" }] },
      "other-org",
      output,
    );

    assert.equal(output.agents.length, 1);
    assert.equal(output.agents[0].approvals.length, 2);
    assert.equal(output.agents[0].approvals[1].organizationId, "other-org");
  });

  it("produces a stable configHash", () => {
    const output1 = emptyOutput();
    const output2 = emptyOutput();
    addAgentApproval(agentApproval, "acme", output1);
    addAgentApproval(agentApproval, "acme", output2);

    assert.equal(
      output1.agents[0].approvals[0].configHash,
      output2.agents[0].approvals[0].configHash,
    );
  });

  it("produces different configHash when approval data changes", () => {
    const output1 = emptyOutput();
    const output2 = emptyOutput();
    addAgentApproval(agentApproval, "acme", output1);
    addAgentApproval({ ...agentApproval, date: "2026-08-02" }, "acme", output2);

    assert.notEqual(
      output1.agents[0].approvals[0].configHash,
      output2.agents[0].approvals[0].configHash,
    );
  });

  it("defaults installConfigs to an empty array when omitted", () => {
    const output = emptyOutput();
    addAgentApproval(
      {
        agentId: "io.example/bare",
        date: "2026-08-01",
        source: agentApproval.source,
      },
      "acme",
      output,
    );
    assert.deepEqual(output.agents[0].approvals[0].installConfigs, []);
  });

  it("keeps the first-collected source when a second vendor's source differs", () => {
    const output = emptyOutput();
    addAgentApproval(agentApproval, "acme", output);
    addAgentApproval(
      {
        ...agentApproval,
        source: { url: "https://example.com/other-agent-card.json" },
      },
      "other-org",
      output,
    );

    assert.equal(output.agents.length, 1);
    assert.deepEqual(output.agents[0].source, agentApproval.source);
  });

  it("still records both approvals when sources differ", () => {
    const output = emptyOutput();
    addAgentApproval(agentApproval, "acme", output);
    addAgentApproval(
      {
        ...agentApproval,
        source: { url: "https://example.com/other-agent-card.json" },
      },
      "other-org",
      output,
    );

    assert.equal(output.agents[0].approvals.length, 2);
    assert.equal(output.agents[0].approvals[0].organizationId, "acme");
    assert.equal(output.agents[0].approvals[1].organizationId, "other-org");
  });

  it("does not warn when a second vendor's source matches exactly", () => {
    const output = emptyOutput();
    const warnCalls: unknown[][] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => warnCalls.push(args);
    try {
      addAgentApproval(agentApproval, "acme", output);
      addAgentApproval(agentApproval, "other-org", output);
    } finally {
      console.warn = originalWarn;
    }
    assert.equal(warnCalls.length, 0);
  });

  it("warns when a second vendor's source differs", () => {
    const output = emptyOutput();
    const warnCalls: unknown[][] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => warnCalls.push(args);
    try {
      addAgentApproval(agentApproval, "acme", output);
      addAgentApproval(
        {
          ...agentApproval,
          source: { url: "https://example.com/other-agent-card.json" },
        },
        "other-org",
        output,
      );
    } finally {
      console.warn = originalWarn;
    }
    assert.equal(warnCalls.length, 1);
    assert.match(String(warnCalls[0][0]), /io\.example\/my-agent/);
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

describe("filterValidTrusts", () => {
  const vendorIds = new Set(["theia", "anthropic", "openai", "aws"]);

  it("keeps trust entries referencing registered vendors", () => {
    const { valid, unknown } = filterValidTrusts(
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
    const { valid, unknown } = filterValidTrusts(
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
    );
    const cfg = output.mcp[0].approvals[0].installConfigs[0];
    assert.equal(cfg.installUrl, undefined);
  });
});

describe("installUrl auto-generation (plugins)", () => {
  function outputWithTool(pluginInstallUrlPrefix?: string): ConsolidatedOutput {
    const output = emptyOutput();
    addOrganization(
      {
        id: "acme",
        name: "Acme",
        description: "Test",
        website: "https://acme.com",
        tools: [{ id: "tool-a", name: "Tool A", pluginInstallUrlPrefix }],
      },
      output,
    );
    return output;
  }

  it("generates installUrl when prefix is set and installUrl is absent", () => {
    const output = outputWithTool("tool-a://install-plugin?id=");
    addPluginApproval(
      {
        pluginId: "io.example/my-plugin",
        date: "2026-08-01",
        source: { url: "https://github.com/example/my-plugin.git" },
        installConfigs: [{ tool: "tool-a" }],
      },
      "acme",
      output,
    );
    const cfg = output.plugins[0].approvals[0].installConfigs[0];
    assert.equal(
      cfg.installUrl,
      "tool-a://install-plugin?id=io.example/my-plugin",
    );
  });

  it("does not overwrite an explicit installUrl", () => {
    const output = outputWithTool("tool-a://install-plugin?id=");
    addPluginApproval(
      {
        pluginId: "io.example/my-plugin",
        date: "2026-08-01",
        source: { url: "https://github.com/example/my-plugin.git" },
        installConfigs: [{ tool: "tool-a", installUrl: "custom://explicit" }],
      },
      "acme",
      output,
    );
    const cfg = output.plugins[0].approvals[0].installConfigs[0];
    assert.equal(cfg.installUrl, "custom://explicit");
  });

  it("leaves installUrl absent when no prefix is defined", () => {
    const output = outputWithTool(undefined);
    addPluginApproval(
      {
        pluginId: "io.example/my-plugin",
        date: "2026-08-01",
        source: { url: "https://github.com/example/my-plugin.git" },
        installConfigs: [{ tool: "tool-a" }],
      },
      "acme",
      output,
    );
    const cfg = output.plugins[0].approvals[0].installConfigs[0];
    assert.equal(cfg.installUrl, undefined);
  });
});

describe("installUrl auto-generation (agents)", () => {
  function outputWithTool(agentInstallUrlPrefix?: string): ConsolidatedOutput {
    const output = emptyOutput();
    addOrganization(
      {
        id: "acme",
        name: "Acme",
        description: "Test",
        website: "https://acme.com",
        tools: [{ id: "tool-a", name: "Tool A", agentInstallUrlPrefix }],
      },
      output,
    );
    return output;
  }

  it("generates installUrl when prefix is set and installUrl is absent", () => {
    const output = outputWithTool("tool-a://install-agent?id=");
    addAgentApproval(
      {
        agentId: "io.example/my-agent",
        date: "2026-08-01",
        source: { url: "https://example.com/agent_card.json" },
        installConfigs: [{ tool: "tool-a" }],
      },
      "acme",
      output,
    );
    const cfg = output.agents[0].approvals[0].installConfigs[0];
    assert.equal(
      cfg.installUrl,
      "tool-a://install-agent?id=io.example/my-agent",
    );
  });

  it("does not overwrite an explicit installUrl", () => {
    const output = outputWithTool("tool-a://install-agent?id=");
    addAgentApproval(
      {
        agentId: "io.example/my-agent",
        date: "2026-08-01",
        source: { url: "https://example.com/agent_card.json" },
        installConfigs: [{ tool: "tool-a", installUrl: "custom://explicit" }],
      },
      "acme",
      output,
    );
    const cfg = output.agents[0].approvals[0].installConfigs[0];
    assert.equal(cfg.installUrl, "custom://explicit");
  });

  it("leaves installUrl absent when no prefix is defined", () => {
    const output = outputWithTool(undefined);
    addAgentApproval(
      {
        agentId: "io.example/my-agent",
        date: "2026-08-01",
        source: { url: "https://example.com/agent_card.json" },
        installConfigs: [{ tool: "tool-a" }],
      },
      "acme",
      output,
    );
    const cfg = output.agents[0].approvals[0].installConfigs[0];
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

describe("buildToolPluginView", () => {
  function plugins(): PluginEntry[] {
    return [
      {
        pluginId: "io.example/plugin-1",
        name: "Plugin 1",
        description: "For both tools",
        source: { url: "https://github.com/example/plugin-1.git" },
        contentHash: "abc123",
        containedSkills: [],
        containedMcpServers: [],
        approvals: [
          {
            organizationId: "acme",
            date: "2026-08-01",
            configHash: "aaa",
            installConfigs: [
              { tool: "tool-a", installUrl: "tool-a://install" },
            ],
          },
          {
            organizationId: "other",
            date: "2026-08-02",
            configHash: "bbb",
            installConfigs: [{ tool: "tool-b" }],
          },
        ],
      },
      {
        pluginId: "io.example/plugin-2",
        name: "Plugin 2",
        description: "For tool-b only",
        source: { url: "https://github.com/example/plugin-2.git" },
        contentHash: "def456",
        containedSkills: [],
        containedMcpServers: [],
        approvals: [
          {
            organizationId: "other",
            date: "2026-08-01",
            configHash: "ccc",
            installConfigs: [{ tool: "tool-b" }],
          },
        ],
      },
    ];
  }

  it("only includes plugins approved for the target tool", () => {
    const view = buildToolPluginView("tool-a", plugins());
    assert.equal(view.length, 1);
    assert.equal(view[0].pluginId, "io.example/plugin-1");
  });

  it("filters installConfigs to the target tool", () => {
    const view = buildToolPluginView("tool-a", plugins());
    const acmeApproval = view[0].approvals.find(
      (a) => a.organizationId === "acme",
    )!;
    assert.equal(acmeApproval.installConfigs.length, 1);
    assert.equal(acmeApproval.installConfigs[0].tool, "tool-a");
  });

  it("preserves all approvals on included plugins", () => {
    const view = buildToolPluginView("tool-a", plugins());
    assert.equal(view[0].approvals.length, 2);
  });

  it("does not mutate the original input", () => {
    const original = plugins();
    buildToolPluginView("tool-a", original);

    assert.equal(original.length, 2);
    assert.equal(original[0].approvals[1].installConfigs.length, 1);
  });
});

describe("buildToolAgentView", () => {
  function agents(): AgentEntry[] {
    return [
      {
        agentId: "io.example/agent-1",
        name: "Agent 1",
        description: "For both tools",
        source: { url: "https://example.com/agent-1-card.json" },
        contentHash: "abc123",
        approvals: [
          {
            organizationId: "acme",
            date: "2026-08-01",
            configHash: "aaa",
            installConfigs: [
              { tool: "tool-a", installUrl: "tool-a://install" },
            ],
          },
          {
            organizationId: "other",
            date: "2026-08-02",
            configHash: "bbb",
            installConfigs: [{ tool: "tool-b" }],
          },
        ],
      },
      {
        agentId: "io.example/agent-2",
        name: "Agent 2",
        description: "For tool-b only",
        source: { url: "https://example.com/agent-2-card.json" },
        contentHash: "def456",
        approvals: [
          {
            organizationId: "other",
            date: "2026-08-01",
            configHash: "ccc",
            installConfigs: [{ tool: "tool-b" }],
          },
        ],
      },
    ];
  }

  it("only includes agents approved for the target tool", () => {
    const view = buildToolAgentView("tool-a", agents());
    assert.equal(view.length, 1);
    assert.equal(view[0].agentId, "io.example/agent-1");
  });

  it("filters installConfigs to the target tool", () => {
    const view = buildToolAgentView("tool-a", agents());
    const acmeApproval = view[0].approvals.find(
      (a) => a.organizationId === "acme",
    )!;
    assert.equal(acmeApproval.installConfigs.length, 1);
    assert.equal(acmeApproval.installConfigs[0].tool, "tool-a");
  });

  it("preserves all approvals on included agents", () => {
    const view = buildToolAgentView("tool-a", agents());
    assert.equal(view[0].approvals.length, 2);
  });

  it("does not mutate the original input", () => {
    const original = agents();
    buildToolAgentView("tool-a", original);

    assert.equal(original.length, 2);
    assert.equal(original[0].approvals[1].installConfigs.length, 1);
  });
});

describe("buildOrgEntryView", () => {
  function servers(): McpEntry[] {
    return [
      {
        serverId: "io.example/server-1",
        name: "Server 1",
        description: "Approved by acme",
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
        description: "Approved by other only",
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
      {
        serverId: "io.example/server-3",
        name: "Server 3",
        description: "Approved by acme via trust delegation",
        mcpRegistryVerified: true,
        approvals: [
          {
            organizationId: "acme",
            date: "2026-05-03",
            configHash: "ddd",
            installConfigs: [{ tool: "tool-a" }],
            viaTrust: "other",
          },
        ],
      },
    ];
  }

  it("only includes entries approved by the target org", () => {
    const view = buildOrgEntryView("acme", servers());
    assert.deepEqual(
      view.map((s) => s.serverId),
      ["io.example/server-1", "io.example/server-3"],
    );
  });

  it("includes trust-derived approvals, since organizationId is the trusting org", () => {
    const view = buildOrgEntryView("acme", servers());
    const viaTrust = view.find((s) => s.serverId === "io.example/server-3")!;
    assert.equal(viaTrust.approvals[0].viaTrust, "other");
  });

  it("excludes entries with no approval from the target org", () => {
    const view = buildOrgEntryView("acme", servers());
    assert.equal(
      view.some((s) => s.serverId === "io.example/server-2"),
      false,
    );
  });

  it("keeps all approvals intact, including other orgs' install configs", () => {
    const view = buildOrgEntryView("acme", servers());
    const entry = view.find((s) => s.serverId === "io.example/server-1")!;
    assert.equal(entry.approvals.length, 2);
    const otherApproval = entry.approvals.find(
      (a) => a.organizationId === "other",
    )!;
    assert.equal(otherApproval.installConfigs.length, 1);
    assert.equal(otherApproval.installConfigs[0].tool, "tool-b");
  });

  it("does not mutate the original input", () => {
    const original = servers();
    buildOrgEntryView("acme", original);

    assert.equal(original.length, 3);
    assert.equal(original[0].approvals.length, 2);
  });

  it("works across entry types other than mcp", () => {
    const skills: SkillEntry[] = [
      {
        skillId: "io.example/skill-1",
        name: "Skill 1",
        description: "Approved by acme",
        source: { url: "https://github.com/example/skills.git" },
        contentHash: "abc123",
        approvals: [
          {
            organizationId: "acme",
            date: "2026-05-01",
            configHash: "aaa",
            installConfigs: [],
          },
        ],
      },
      {
        skillId: "io.example/skill-2",
        name: "Skill 2",
        description: "Approved by other only",
        source: { url: "https://github.com/example/skills.git" },
        contentHash: "def456",
        approvals: [
          {
            organizationId: "other",
            date: "2026-05-01",
            configHash: "bbb",
            installConfigs: [],
          },
        ],
      },
    ];

    const view = buildOrgEntryView("acme", skills);
    assert.deepEqual(
      view.map((s) => s.skillId),
      ["io.example/skill-1"],
    );
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

describe("addOrganization — plugin/agent trust extraction", () => {
  it("collects a plugin trust entry", () => {
    const output = emptyOutput();
    const pluginTrusts: PluginTrustEntry[] = [];
    addOrganization(
      {
        id: "theia",
        name: "Theia IDE",
        description: "IDE",
        website: "https://theia-ide.org",
        trusts: [{ org: "anthropic", artifactTypes: { plugins: {} } }],
      },
      output,
      [],
      [],
      pluginTrusts,
    );
    assert.deepEqual(pluginTrusts, [{ org: "theia", trustedOrg: "anthropic" }]);
  });

  it("collects an agent trust entry", () => {
    const output = emptyOutput();
    const agentTrusts: AgentTrustEntry[] = [];
    addOrganization(
      {
        id: "theia",
        name: "Theia IDE",
        description: "IDE",
        website: "https://theia-ide.org",
        trusts: [{ org: "anthropic", artifactTypes: { agents: {} } }],
      },
      output,
      [],
      [],
      [],
      agentTrusts,
    );
    assert.deepEqual(agentTrusts, [{ org: "theia", trustedOrg: "anthropic" }]);
  });

  it("collects skill, mcp, plugin, and agent trust entries from the same organization", () => {
    const output = emptyOutput();
    const skillTrusts: SkillTrustEntry[] = [];
    const mcpTrusts: McpTrustEntry[] = [];
    const pluginTrusts: PluginTrustEntry[] = [];
    const agentTrusts: AgentTrustEntry[] = [];
    addOrganization(
      {
        id: "theia",
        name: "Theia IDE",
        description: "IDE",
        website: "https://theia-ide.org",
        trusts: [
          { org: "anthropic", artifactTypes: { skills: {} } },
          { org: "eclipsesource", artifactTypes: { mcp: {} } },
          { org: "gemini-cli-extensions", artifactTypes: { plugins: {} } },
          { org: "mosaico", artifactTypes: { agents: {} } },
        ],
      },
      output,
      skillTrusts,
      mcpTrusts,
      pluginTrusts,
      agentTrusts,
    );
    assert.deepEqual(skillTrusts, [{ org: "theia", trustedOrg: "anthropic" }]);
    assert.deepEqual(mcpTrusts, [
      { org: "theia", trustedOrg: "eclipsesource" },
    ]);
    assert.deepEqual(pluginTrusts, [
      { org: "theia", trustedOrg: "gemini-cli-extensions" },
    ]);
    assert.deepEqual(agentTrusts, [{ org: "theia", trustedOrg: "mosaico" }]);
  });
});

describe("addApproval — genericConfig", () => {
  it("populates Approval.genericConfig verbatim from the approval's own root config", () => {
    const output = emptyOutput();
    addApproval(
      {
        serverId: "io.example/foo",
        date: "2026-08-05",
        config: { url: "https://mcp.example.com" },
      },
      "eclipsesource",
      output,
    );
    assert.deepEqual(output.mcp[0].approvals[0].genericConfig, {
      url: "https://mcp.example.com",
    });
  });

  it("leaves genericConfig unset when the approval has no root config", () => {
    const output = emptyOutput();
    addApproval(
      { serverId: "io.example/foo", date: "2026-08-05" },
      "eclipsesource",
      output,
    );
    assert.equal("genericConfig" in output.mcp[0].approvals[0], false);
  });

  it('leaves installConfigs config: "derived" untouched — resolveMcpCrossVendorConfigs resolves it later', () => {
    const output = emptyOutput();
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
    );
    assert.equal(
      output.mcp[0].approvals[0].installConfigs[0].config,
      "derived",
    );
  });

  it("leaves an explicit object config untouched, ignoring any root config", () => {
    const output = emptyOutput();
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
    );
    assert.deepEqual(output.mcp[0].approvals[0].installConfigs[0].config, {
      servers: { custom: {} },
    });
  });
});

describe("pickWinningGenericConfig", () => {
  function candidate(
    organizationId: string,
    date: string,
    url: string,
  ): Approval {
    return {
      organizationId,
      date,
      configHash: "abc",
      installConfigs: [],
      genericConfig: { url },
    };
  }

  it("returns undefined for an empty candidate list", () => {
    assert.equal(pickWinningGenericConfig([], "io.example/foo"), undefined);
  });

  it("returns the only candidate's config when there's exactly one", () => {
    const only = candidate(
      "eclipsesource",
      "2026-08-01",
      "https://a.example.com",
    );
    assert.deepEqual(pickWinningGenericConfig([only], "io.example/foo"), {
      url: "https://a.example.com",
    });
  });

  it("picks the newest by date when two different orgs both contribute one", () => {
    const older = candidate("vendor-a", "2026-01-01", "https://a.example.com");
    const newer = candidate("vendor-b", "2026-06-01", "https://b.example.com");
    assert.deepEqual(
      pickWinningGenericConfig([older, newer], "io.example/foo"),
      { url: "https://b.example.com" },
    );
  });

  it("prefers preferOrg's config over another org's newer one", () => {
    const older = candidate("vendor-a", "2026-01-01", "https://a.example.com");
    const newer = candidate("vendor-b", "2026-06-01", "https://b.example.com");
    assert.deepEqual(
      pickWinningGenericConfig([older, newer], "io.example/foo", "vendor-a"),
      { url: "https://a.example.com" },
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
          organizationId: "eclipsesource",
          date: "2026-08-01",
          configHash: "xyz",
          installConfigs: [],
          genericConfig: { url: "https://mcp.example.com" },
        },
        {
          organizationId: "theia",
          date: "2026-08-05",
          configHash: "abc",
          installConfigs: [{ tool: "theia-ide", config: "derived" }],
        },
      ],
    });

    resolveMcpCrossVendorConfigs(output);

    assert.deepEqual(output.mcp[0].approvals[1].installConfigs[0].config, {
      servers: { foo: { serverUrl: "https://mcp.example.com" } },
    });
  });

  it("prefers the approval's own org's config over another vendor's newer one when deriving", () => {
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
          date: "2026-08-01",
          configHash: "abc",
          installConfigs: [{ tool: "theia-ide", config: "derived" }],
          genericConfig: { url: "https://theias-own.example.com" },
        },
        {
          organizationId: "eclipsesource",
          date: "2026-08-05",
          configHash: "xyz",
          installConfigs: [],
          genericConfig: { url: "https://newer-vendor.example.com" },
        },
      ],
    });

    resolveMcpCrossVendorConfigs(output);

    assert.deepEqual(output.mcp[0].approvals[0].installConfigs[0].config, {
      servers: { foo: { serverUrl: "https://theias-own.example.com" } },
    });
  });

  it("drops the card (does not fall back to another vendor) when the approval's own config can't be represented", () => {
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
          date: "2026-08-01",
          configHash: "abc",
          installConfigs: [{ tool: "theia-ide", config: "derived" }],
          genericConfig: {
            url: "https://mcp.example.com",
            headers: { Authorization: "Bearer x", "X-Extra": "y" },
          },
        },
        {
          organizationId: "eclipsesource",
          date: "2026-08-05",
          configHash: "xyz",
          installConfigs: [],
          genericConfig: { url: "https://newer-vendor.example.com" },
        },
      ],
    });

    resolveMcpCrossVendorConfigs(output);

    assert.equal(
      "config" in output.mcp[0].approvals[0].installConfigs[0],
      false,
    );
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

    resolveMcpCrossVendorConfigs(output);

    assert.equal(
      "config" in output.mcp[0].approvals[0].installConfigs[0],
      false,
    );
  });

  it("strips without leaving any undefined-valued keys behind", () => {
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

    resolveMcpCrossVendorConfigs(output);

    assert.deepEqual(output.mcp[0].approvals[0].installConfigs[0], {
      tool: "theia-ide",
    });
  });

  it("strips to unset when a generic config exists but no transform is registered for the tool", () => {
    const output = emptyOutput();
    output.tools.push({
      id: "unregistered-tool",
      name: "Unregistered Tool",
      organizationId: "acme",
    });
    output.mcp.push({
      serverId: "io.example/foo",
      name: "foo",
      description: "",
      mcpRegistryVerified: false,
      approvals: [
        {
          organizationId: "acme",
          date: "2026-08-05",
          configHash: "abc",
          installConfigs: [{ tool: "unregistered-tool", config: "derived" }],
          genericConfig: { url: "https://mcp.example.com" },
        },
      ],
    });

    resolveMcpCrossVendorConfigs(output);

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

    resolveMcpCrossVendorConfigs(output);

    assert.deepEqual(output.mcp[0].approvals[0].installConfigs[0].config, {
      servers: { custom: {} },
    });
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

    resolveMcpTrust(output, [{ org: "theia", trustedOrg: "eclipsesource" }]);

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

    resolveMcpTrust(output, [{ org: "theia", trustedOrg: "eclipsesource" }]);

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
    resolveMcpTrust(output, [{ org: "openai", trustedOrg: "eclipsesource" }]);
    // A third org trusting "openai" should get nothing: openai's only
    // approval for this server is itself trust-derived.
    resolveMcpTrust(output, [{ org: "acme", trustedOrg: "openai" }]);

    assert.equal(
      output.mcp[0].approvals.some((a) => a.organizationId === "acme"),
      false,
    );
  });

  it("auto-generates installUrl for derived installConfigs entries when the trusting org's tool defines mcpInstallUrlPrefix", () => {
    const output = baseOutput();

    resolveMcpTrust(output, [{ org: "theia", trustedOrg: "eclipsesource" }]);

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
    delete output.mcp[0].approvals[0].genericConfig;

    resolveMcpTrust(output, [{ org: "theia", trustedOrg: "eclipsesource" }]);

    const derived = output.mcp[0].approvals.find(
      (a) => a.organizationId === "theia",
    );
    assert.ok(derived);
    assert.equal(derived!.installConfigs.length, 2);
    assert.equal("config" in derived!.installConfigs[0], false);
  });
});

describe("resolvePluginTrust", () => {
  function pluginWithApproval(
    pluginId: string,
    organizationId: string,
  ): PluginEntry {
    return {
      pluginId,
      name: pluginId,
      description: "",
      source: { url: "https://github.com/example/plugin.git" },
      contentHash: "",
      containedSkills: [],
      containedMcpServers: [],
      approvals: [
        {
          organizationId,
          date: "2026-08-04",
          configHash: "abc123",
          installConfigs: [],
        },
      ],
    };
  }

  it("adds a derived approval tagged with viaTrust", () => {
    const output = emptyOutput();
    output.plugins = [
      pluginWithApproval("io.example/my-plugin", "gemini-cli-extensions"),
    ];

    resolvePluginTrust(output, [
      { org: "theia", trustedOrg: "gemini-cli-extensions" },
    ]);

    assert.equal(output.plugins[0].approvals.length, 2);
    const derived = output.plugins[0].approvals[1];
    assert.equal(derived.organizationId, "theia");
    assert.equal(derived.viaTrust, "gemini-cli-extensions");
    assert.equal(derived.date, "2026-08-04");
  });

  it("gives the derived approval an installConfig with installUrl for each of the trusting org's own tools", () => {
    const output = emptyOutput();
    output.tools = [
      {
        id: "theia-ide",
        name: "Theia IDE",
        organizationId: "theia",
        pluginInstallUrlPrefix: "theia://install-plugin?id=",
      },
      { id: "other-tool", name: "Other Tool", organizationId: "other-org" },
    ];
    output.plugins = [
      pluginWithApproval("io.example/my-plugin", "gemini-cli-extensions"),
    ];

    resolvePluginTrust(output, [
      { org: "theia", trustedOrg: "gemini-cli-extensions" },
    ]);

    const derived = output.plugins[0].approvals[1];
    assert.equal(derived.installConfigs.length, 1);
    assert.equal(derived.installConfigs[0].tool, "theia-ide");
    assert.equal(
      derived.installConfigs[0].installUrl,
      "theia://install-plugin?id=io.example/my-plugin",
    );
  });

  it("does not add a derived approval when the trusted org has none", () => {
    const output = emptyOutput();
    output.plugins = [pluginWithApproval("io.example/a", "openai")];

    resolvePluginTrust(output, [
      { org: "theia", trustedOrg: "gemini-cli-extensions" },
    ]);

    assert.equal(output.plugins[0].approvals.length, 1);
  });

  it("does not add a derived approval when the trusting org already approved directly", () => {
    const output = emptyOutput();
    const plugin = pluginWithApproval("io.example/a", "gemini-cli-extensions");
    plugin.approvals.push({
      organizationId: "theia",
      date: "2026-08-05",
      configHash: "def456",
      installConfigs: [],
    });
    output.plugins = [plugin];

    resolvePluginTrust(output, [
      { org: "theia", trustedOrg: "gemini-cli-extensions" },
    ]);

    const theiaApprovals = output.plugins[0].approvals.filter(
      (a) => a.organizationId === "theia",
    );
    assert.equal(theiaApprovals.length, 1);
    assert.equal(theiaApprovals[0].viaTrust, undefined);
  });

  it("does not chain trust through a trust-derived approval", () => {
    const output = emptyOutput();
    output.plugins = [
      pluginWithApproval("io.example/a", "gemini-cli-extensions"),
    ];
    resolvePluginTrust(output, [
      { org: "openai", trustedOrg: "gemini-cli-extensions" },
    ]);

    resolvePluginTrust(output, [{ org: "theia", trustedOrg: "openai" }]);

    assert.equal(
      output.plugins[0].approvals.some((a) => a.organizationId === "theia"),
      false,
    );
  });
});

describe("resolveAgentTrust", () => {
  function agentWithApproval(
    agentId: string,
    organizationId: string,
  ): AgentEntry {
    return {
      agentId,
      name: agentId,
      description: "",
      source: { url: "https://example.com/agent_card.json" },
      contentHash: "",
      approvals: [
        {
          organizationId,
          date: "2026-08-04",
          configHash: "abc123",
          installConfigs: [],
        },
      ],
    };
  }

  it("adds a derived approval tagged with viaTrust", () => {
    const output = emptyOutput();
    output.agents = [agentWithApproval("io.example/my-agent", "mosaico")];

    resolveAgentTrust(output, [{ org: "theia", trustedOrg: "mosaico" }]);

    assert.equal(output.agents[0].approvals.length, 2);
    const derived = output.agents[0].approvals[1];
    assert.equal(derived.organizationId, "theia");
    assert.equal(derived.viaTrust, "mosaico");
    assert.equal(derived.date, "2026-08-04");
  });

  it("gives the derived approval an installConfig with installUrl for each of the trusting org's own tools", () => {
    const output = emptyOutput();
    output.tools = [
      {
        id: "theia-ide",
        name: "Theia IDE",
        organizationId: "theia",
        agentInstallUrlPrefix: "theia://install-agent?id=",
      },
      { id: "other-tool", name: "Other Tool", organizationId: "other-org" },
    ];
    output.agents = [agentWithApproval("io.example/my-agent", "mosaico")];

    resolveAgentTrust(output, [{ org: "theia", trustedOrg: "mosaico" }]);

    const derived = output.agents[0].approvals[1];
    assert.equal(derived.installConfigs.length, 1);
    assert.equal(derived.installConfigs[0].tool, "theia-ide");
    assert.equal(
      derived.installConfigs[0].installUrl,
      "theia://install-agent?id=io.example/my-agent",
    );
  });

  it("does not add a derived approval when the trusted org has none", () => {
    const output = emptyOutput();
    output.agents = [agentWithApproval("io.example/a", "openai")];

    resolveAgentTrust(output, [{ org: "theia", trustedOrg: "mosaico" }]);

    assert.equal(output.agents[0].approvals.length, 1);
  });

  it("does not add a derived approval when the trusting org already approved directly", () => {
    const output = emptyOutput();
    const agent = agentWithApproval("io.example/a", "mosaico");
    agent.approvals.push({
      organizationId: "theia",
      date: "2026-08-05",
      configHash: "def456",
      installConfigs: [],
    });
    output.agents = [agent];

    resolveAgentTrust(output, [{ org: "theia", trustedOrg: "mosaico" }]);

    const theiaApprovals = output.agents[0].approvals.filter(
      (a) => a.organizationId === "theia",
    );
    assert.equal(theiaApprovals.length, 1);
    assert.equal(theiaApprovals[0].viaTrust, undefined);
  });

  it("does not chain trust through a trust-derived approval", () => {
    const output = emptyOutput();
    output.agents = [agentWithApproval("io.example/a", "mosaico")];
    resolveAgentTrust(output, [{ org: "openai", trustedOrg: "mosaico" }]);

    resolveAgentTrust(output, [{ org: "theia", trustedOrg: "openai" }]);

    assert.equal(
      output.agents[0].approvals.some((a) => a.organizationId === "theia"),
      false,
    );
  });
});

// --- findOrCreate ---

describe("findOrCreate", () => {
  it("creates and pushes a new entry when no match is found", () => {
    const list: { id: string }[] = [];
    const { entry, created } = findOrCreate(
      list,
      (e) => e.id === "a",
      () => ({ id: "a" }),
    );
    assert.equal(created, true);
    assert.equal(entry.id, "a");
    assert.equal(list.length, 1);
    assert.equal(list[0], entry);
  });

  it("returns the existing entry without pushing a duplicate when a match is found", () => {
    const existing = { id: "a" };
    const list = [existing];
    const { entry, created } = findOrCreate(
      list,
      (e) => e.id === "a",
      () => ({ id: "a" }),
    );
    assert.equal(created, false);
    assert.equal(entry, existing);
    assert.equal(list.length, 1);
  });
});

// --- configHashOf ---

describe("configHashOf", () => {
  it("produces a 12-hex-char string", () => {
    const hash = configHashOf({ foo: "bar" });
    assert.match(hash, /^[0-9a-f]{12}$/);
  });

  it("is stable for identical input", () => {
    assert.equal(
      configHashOf({ foo: "bar", date: "2026-08-01" }),
      configHashOf({ foo: "bar", date: "2026-08-01" }),
    );
  });

  it("differs for different input", () => {
    assert.notEqual(configHashOf({ foo: "bar" }), configHashOf({ foo: "baz" }));
  });
});
