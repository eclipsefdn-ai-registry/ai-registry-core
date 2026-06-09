import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  addOrganization,
  addApproval,
  addSkillApproval,
  enrichWithRegistryData,
  buildToolView,
  buildToolSkillView,
  type ConsolidatedOutput,
  type ApprovalData,
  type SkillApprovalData,
  type McpEntry,
  type SkillEntry,
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
