import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  addOrganization,
  addApproval,
  buildToolView,
  type ConsolidatedOutput,
  type ApprovalData,
  type McpEntry,
} from "./consolidate.js";

function emptyOutput(): ConsolidatedOutput {
  return { organizations: [], tools: [], mcp: [] };
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
});

describe("addApproval", () => {
  const approval: ApprovalData = {
    serverId: "io.example/server",
    date: "2026-05-01",
    versionRange: "^1.0.0",
    installConfigs: [{ tool: "tool-a", instructions: "do stuff" }],
  };

  it("creates a new MCP entry when server is new", () => {
    const output = emptyOutput();
    addApproval(approval, "acme", undefined, output);

    assert.equal(output.mcp.length, 1);
    assert.equal(output.mcp[0].serverId, "io.example/server");
    assert.equal(output.mcp[0].mcpRegistryVerified, false);
    assert.equal(output.mcp[0].name, "io.example/server");
    assert.equal(output.mcp[0].approvals.length, 1);
    assert.equal(output.mcp[0].approvals[0].organizationId, "acme");
  });

  it("uses registry metadata when available", () => {
    const output = emptyOutput();
    addApproval(
      approval,
      "acme",
      { name: "Example Server", description: "A great server", verified: true },
      output,
    );

    assert.equal(output.mcp[0].name, "Example Server");
    assert.equal(output.mcp[0].description, "A great server");
    assert.equal(output.mcp[0].mcpRegistryVerified, true);
  });

  it("merges approvals from multiple vendors for the same server", () => {
    const output = emptyOutput();
    addApproval(approval, "acme", undefined, output);
    addApproval(
      {
        ...approval,
        versionRange: "^2.0.0",
        installConfigs: [{ tool: "tool-b" }],
      },
      "other-org",
      undefined,
      output,
    );

    assert.equal(output.mcp.length, 1);
    assert.equal(output.mcp[0].approvals.length, 2);
    assert.equal(output.mcp[0].approvals[0].organizationId, "acme");
    assert.equal(output.mcp[0].approvals[1].organizationId, "other-org");
    assert.equal(output.mcp[0].approvals[1].versionRange, "^2.0.0");
  });

  it("omits versionRange when not provided", () => {
    const output = emptyOutput();
    const noVersion: ApprovalData = {
      serverId: "io.example/server",
      date: "2026-05-01",
      installConfigs: [{ tool: "tool-a" }],
    };
    addApproval(noVersion, "acme", undefined, output);

    assert.equal("versionRange" in output.mcp[0].approvals[0], false);
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
            installConfigs: [{ tool: "tool-a", instructions: "use tool-a" }],
          },
          {
            organizationId: "other",
            date: "2026-05-02",
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

  it("does not mutate the original input", () => {
    const original = servers();
    buildToolView("tool-a", original);

    assert.equal(original.length, 2);
    assert.equal(original[0].approvals[1].installConfigs.length, 1);
  });
});
