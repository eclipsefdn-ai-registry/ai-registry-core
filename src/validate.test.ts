import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  checkToolIds,
  checkTrustedOrgIds,
  validateVendorData,
  validateVendorFiles,
  validateApproval,
  validateOrganization,
  validatePluginApproval,
  readApprovalDir,
  validateSimpleApprovals,
  type SkillApprovalEntry,
  type PluginApprovalEntry,
  type AgentApprovalEntry,
  type VendorValidationResult,
  type ValidationResult,
} from "./validate.js";

// --- checkTrustedOrgIds ---

describe("checkTrustedOrgIds", () => {
  const knownOrgIds = new Set(["anthropic", "openai", "aws"]);

  it("returns no errors when every trusted org is registered", () => {
    const errors = checkTrustedOrgIds(
      [{ org: "anthropic" }, { org: "aws" }],
      knownOrgIds,
    );
    assert.equal(errors.length, 0);
  });

  it("reports a trusted org that isn't registered", () => {
    const errors = checkTrustedOrgIds([{ org: "nonexistent" }], knownOrgIds);
    assert.equal(errors.length, 1);
    assert.ok(errors[0].includes("nonexistent"));
  });

  it("returns no errors when trusts is undefined", () => {
    const errors = checkTrustedOrgIds(undefined, knownOrgIds);
    assert.equal(errors.length, 0);
  });
});

// --- checkToolIds ---

describe("checkToolIds", () => {
  const toolIds = new Set(["theia-ide", "other-tool"]);

  it("returns no errors for valid tool IDs", () => {
    const errors = checkToolIds(
      { installConfigs: [{ tool: "theia-ide" }, { tool: "other-tool" }] },
      toolIds,
    );
    assert.equal(errors.length, 0);
  });

  it("reports tool IDs not in organization", () => {
    const errors = checkToolIds(
      { installConfigs: [{ tool: "nonexistent" }] },
      toolIds,
    );
    assert.equal(errors.length, 1);
    assert.ok(errors[0].includes("nonexistent"));
  });

  it("reports multiple invalid tool IDs", () => {
    const errors = checkToolIds(
      {
        installConfigs: [
          { tool: "bad-a" },
          { tool: "theia-ide" },
          { tool: "bad-b" },
        ],
      },
      toolIds,
    );
    assert.equal(errors.length, 2);
  });
});

// --- validateVendorData ---

const validOrg = {
  id: "test-vendor",
  name: "Test Vendor",
  description: "A test vendor",
  website: "https://test.com",
  tools: [{ id: "test-tool", name: "Test Tool" }],
};

function approval(serverId = "io.example/server") {
  return {
    file: serverId.replace(/\//g, "--") + ".json",
    data: {
      serverId,
      date: "2026-05-01",
      installConfigs: [{ tool: "test-tool" }],
    },
  };
}

describe("validateVendorData", () => {
  it("passes for valid org and approvals", () => {
    const result = validateVendorData(validOrg, [approval()]);
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
    assert.equal(result.approvals.length, 1);
  });

  it("fails when organization fails schema validation", () => {
    const result = validateVendorData({ id: "x", name: "X" }, []);
    assert.equal(result.valid, false);
    assert.ok(result.errors[0].includes("organization.json"));
  });

  it("passes for an inferred organization", () => {
    const inferredOrg = {
      id: "test-vendor",
      name: "Test Vendor",
      description: "Pre-seeded from an official public source",
      website: "https://test.com",
      inferred: true,
    };
    const result = validateVendorData(inferredOrg, []);
    assert.equal(result.valid, true);
  });

  it("fails when org id does not match expected vendor id", () => {
    const result = validateVendorData(validOrg, [], {
      expectedVendorId: "wrong-id",
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors[0].includes("does not match vendor id"));
  });

  it("passes when expected vendor id matches", () => {
    const result = validateVendorData(validOrg, [], {
      expectedVendorId: "test-vendor",
    });
    assert.equal(result.valid, true);
  });

  it("skips vendor id check when not provided", () => {
    const result = validateVendorData(validOrg, []);
    assert.equal(result.valid, true);
  });

  it("passes with no approvals", () => {
    const result = validateVendorData(validOrg, []);
    assert.equal(result.valid, true);
    assert.equal(result.approvals.length, 0);
  });

  it("fails when approval fails schema validation", () => {
    const result = validateVendorData(validOrg, [
      { file: "bad.json", data: { serverId: "x" } as never },
    ]);
    assert.equal(result.valid, false);
  });

  it("fails on duplicate tool IDs in organization", () => {
    const orgWithDuplicateTools = {
      ...validOrg,
      tools: [
        { id: "test-tool", name: "Test Tool" },
        { id: "test-tool", name: "Test Tool Copy" },
      ],
    };
    const result = validateVendorData(orgWithDuplicateTools, []);
    assert.equal(result.valid, false);
    assert.ok(
      result.errors.some((e) => e.includes('duplicate tool ID "test-tool"')),
    );
  });

  it("passes with a valid trusts entry", () => {
    const orgWithTrust = {
      ...validOrg,
      trusts: [{ org: "anthropic", artifactTypes: { skills: {} } }],
    };
    const result = validateVendorData(orgWithTrust, []);
    assert.equal(result.valid, true);
  });

  it("fails on duplicate trust entries for the same organization", () => {
    const orgWithDuplicateTrust = {
      ...validOrg,
      trusts: [
        { org: "anthropic", artifactTypes: { skills: {} } },
        { org: "anthropic", artifactTypes: { skills: {} } },
      ],
    };
    const result = validateVendorData(orgWithDuplicateTrust, []);
    assert.equal(result.valid, false);
    assert.ok(
      result.errors.some((e) =>
        e.includes('duplicate trust entry for organization "anthropic"'),
      ),
    );
  });

  it("fails when an organization trusts itself", () => {
    const orgTrustingItself = {
      ...validOrg,
      trusts: [{ org: "test-vendor", artifactTypes: { skills: {} } }],
    };
    const result = validateVendorData(orgTrustingItself, []);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("cannot trust itself")));
  });

  it("fails on duplicate serverId across approvals", () => {
    const result = validateVendorData(validOrg, [
      approval("io.example/server"),
      {
        file: "io.example--server-copy.json",
        data: {
          serverId: "io.example/server",
          date: "2026-05-02",
          installConfigs: [{ tool: "test-tool" }],
        },
      },
    ]);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("duplicate approval")));
  });

  it("fails when tool ID in approval is not in organization", () => {
    const result = validateVendorData(validOrg, [
      {
        file: "io.example--server.json",
        data: {
          serverId: "io.example/server",
          date: "2026-05-01",
          installConfigs: [{ tool: "nonexistent-tool" }],
        },
      },
    ]);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("nonexistent-tool")));
  });

  it("warns on filename mismatch", () => {
    const result = validateVendorData(validOrg, [
      {
        file: "wrong-name.json",
        data: {
          serverId: "io.example/server",
          date: "2026-05-01",
          installConfigs: [{ tool: "test-tool" }],
        },
      },
    ]);
    assert.equal(result.valid, true);
    assert.ok(result.warnings.some((w) => w.includes("filename should be")));
  });

  it("populates organization in result", () => {
    const result = validateVendorData(validOrg, []);
    assert.equal(result.organization?.id, "test-vendor");
    assert.equal(result.organization?.tools.length, 1);
  });

  it("passes for approval without installConfigs", () => {
    const result = validateVendorData(validOrg, [
      {
        file: "io.example--server.json",
        data: {
          serverId: "io.example/server",
          date: "2026-05-01",
        },
      },
    ]);
    assert.equal(result.valid, true);
    assert.equal(result.approvals.length, 1);
  });

  it("passes for organization without tools", () => {
    const curatorOrg = {
      id: "curator",
      name: "Curator Org",
      description: "An org without tools",
      website: "https://curator.com",
    };
    const result = validateVendorData(curatorOrg, [
      {
        file: "io.example--server.json",
        data: {
          serverId: "io.example/server",
          date: "2026-05-01",
        },
      },
    ]);
    assert.equal(result.valid, true);
    assert.equal(result.organization?.tools.length, 0);
    assert.equal(result.approvals.length, 1);
  });
});

// --- Skill approval validation ---

function skillApproval(skillId = "io.example/my-skill"): SkillApprovalEntry {
  return {
    file: skillId.replace(/\//g, "--") + ".json",
    data: {
      skillId,
      date: "2026-06-01",
      source: {
        url: "https://github.com/example/skills.git",
        path: "skills/my-skill",
      },
      installConfigs: [{ tool: "test-tool" }],
    },
  };
}

describe("validateVendorData — skill approvals", () => {
  it("passes for valid org with skill approvals", () => {
    const result = validateVendorData(validOrg, [], {
      skillApprovals: [skillApproval()],
    });
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
    assert.equal(result.skillApprovals.length, 1);
  });

  it("passes with both MCP and skill approvals", () => {
    const result = validateVendorData(validOrg, [approval()], {
      skillApprovals: [skillApproval()],
    });
    assert.equal(result.valid, true);
    assert.equal(result.approvals.length, 1);
    assert.equal(result.skillApprovals.length, 1);
  });

  it("fails when skill approval fails schema validation", () => {
    const result = validateVendorData(validOrg, [], {
      skillApprovals: [{ file: "bad.json", data: { skillId: "x" } as never }],
    });
    assert.equal(result.valid, false);
  });

  it("fails on duplicate skillId across skill approvals", () => {
    const result = validateVendorData(validOrg, [], {
      skillApprovals: [
        skillApproval("io.example/my-skill"),
        {
          file: "io.example--my-skill-copy.json",
          data: {
            skillId: "io.example/my-skill",
            date: "2026-06-02",
            source: {
              url: "https://github.com/example/skills.git",
              path: "skills/my-skill",
            },
            installConfigs: [{ tool: "test-tool" }],
          },
        },
      ],
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("duplicate approval")));
  });

  it("fails when tool ID in skill approval is not in organization", () => {
    const result = validateVendorData(validOrg, [], {
      skillApprovals: [
        {
          file: "io.example--my-skill.json",
          data: {
            skillId: "io.example/my-skill",
            date: "2026-06-01",
            source: {
              url: "https://github.com/example/skills.git",
              path: "skills/my-skill",
            },
            installConfigs: [{ tool: "nonexistent-tool" }],
          },
        },
      ],
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("nonexistent-tool")));
  });

  it("warns on skill filename mismatch", () => {
    const result = validateVendorData(validOrg, [], {
      skillApprovals: [
        {
          file: "wrong-name.json",
          data: {
            skillId: "io.example/my-skill",
            date: "2026-06-01",
            source: {
              url: "https://github.com/example/skills.git",
              path: "skills/my-skill",
            },
            installConfigs: [{ tool: "test-tool" }],
          },
        },
      ],
    });
    assert.equal(result.valid, true);
    assert.ok(result.warnings.some((w) => w.includes("filename should be")));
  });

  it("passes for skill approval without installConfigs", () => {
    const result = validateVendorData(validOrg, [], {
      skillApprovals: [
        {
          file: "io.example--my-skill.json",
          data: {
            skillId: "io.example/my-skill",
            date: "2026-06-01",
            source: {
              url: "https://github.com/example/skills.git",
              path: "skills/my-skill",
            },
          },
        },
      ],
    });
    assert.equal(result.valid, true);
    assert.equal(result.skillApprovals.length, 1);
  });

  it("backward compatible — works without options", () => {
    const result = validateVendorData(validOrg, [approval()]);
    assert.equal(result.valid, true);
    assert.equal(result.skillApprovals.length, 0);
  });

  it("passes for skill approval with array path", () => {
    const result = validateVendorData(validOrg, [], {
      skillApprovals: [
        {
          file: "io.example.json",
          data: {
            skillId: "io.example",
            date: "2026-06-01",
            source: {
              url: "https://github.com/example/skills.git",
              path: ["skills/a", "skills/b"],
            },
          },
        },
      ],
    });
    assert.equal(result.valid, true);
    assert.equal(result.skillApprovals.length, 1);
  });

  it("passes for skill approval with glob path", () => {
    const result = validateVendorData(validOrg, [], {
      skillApprovals: [
        {
          file: "io.example.json",
          data: {
            skillId: "io.example",
            date: "2026-06-01",
            source: {
              url: "https://github.com/example/skills.git",
              path: "skills/*",
            },
          },
        },
      ],
    });
    assert.equal(result.valid, true);
    assert.equal(result.skillApprovals.length, 1);
  });

  it("fails for skill approval with empty path array", () => {
    const result = validateVendorData(validOrg, [], {
      skillApprovals: [
        {
          file: "io.example.json",
          data: {
            skillId: "io.example",
            date: "2026-06-01",
            source: {
              url: "https://github.com/example/skills.git",
              path: [],
            },
          },
        },
      ],
    });
    assert.equal(result.valid, false);
  });

  it("fails when multi-path skillId contains /", () => {
    const result = validateVendorData(validOrg, [], {
      skillApprovals: [
        {
          file: "io.example--bad.json",
          data: {
            skillId: "io.example/bad",
            date: "2026-06-01",
            source: {
              url: "https://github.com/example/skills.git",
              path: ["skills/a", "skills/b"],
            },
          },
        },
      ],
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("must not contain")));
  });

  it("fails when glob-path skillId contains /", () => {
    const result = validateVendorData(validOrg, [], {
      skillApprovals: [
        {
          file: "io.example--bad.json",
          data: {
            skillId: "io.example/bad",
            date: "2026-06-01",
            source: {
              url: "https://github.com/example/skills.git",
              path: "skills/*",
            },
          },
        },
      ],
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("must not contain")));
  });

  it("fails when a multi-path source sets an explicit installUrl", () => {
    const result = validateVendorData(validOrg, [], {
      skillApprovals: [
        {
          file: "io.example.json",
          data: {
            skillId: "io.example",
            date: "2026-06-01",
            source: {
              url: "https://github.com/example/skills.git",
              path: "skills/*",
            },
            installConfigs: [
              {
                tool: "test-tool",
                installUrl: "test-tool://install?id=io.example",
              },
            ],
          },
        },
      ],
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("explicit installUrl")));
  });

  it("allows a multi-path source with prefix-based installConfigs", () => {
    const result = validateVendorData(validOrg, [], {
      skillApprovals: [
        {
          file: "io.example.json",
          data: {
            skillId: "io.example",
            date: "2026-06-01",
            source: {
              url: "https://github.com/example/skills.git",
              path: ["skills/a", "skills/b"],
            },
            installConfigs: [{ tool: "test-tool" }],
          },
        },
      ],
    });
    assert.equal(result.valid, true);
  });
});

// --- Plugin approval validation ---

function pluginApproval(
  pluginId = "io.example/my-plugin",
): PluginApprovalEntry {
  return {
    file: pluginId.replace(/\//g, "--") + ".json",
    data: {
      pluginId,
      date: "2026-08-01",
      source: {
        url: "https://github.com/example/plugins.git",
        path: "plugins/my-plugin",
      },
      installConfigs: [{ tool: "test-tool" }],
    },
  };
}

describe("validatePluginApproval — source.path pattern", () => {
  function pluginApprovalData(path: string) {
    return {
      pluginId: "io.example/my-plugin",
      date: "2026-08-01",
      source: {
        url: "https://github.com/example/plugins.git",
        path,
      },
    };
  }

  it("accepts a normal relative path", () => {
    const result = validatePluginApproval(
      pluginApprovalData("plugins/my-plugin"),
    );
    assert.equal(result.valid, true);
  });

  it("accepts a single path segment", () => {
    const result = validatePluginApproval(pluginApprovalData("my-plugin"));
    assert.equal(result.valid, true);
  });

  it("rejects a path with a shell command separator", () => {
    const result = validatePluginApproval(
      pluginApprovalData("plugin; rm -rf /"),
    );
    assert.equal(result.valid, false);
  });

  it("rejects a path with a space", () => {
    const result = validatePluginApproval(pluginApprovalData("my plugin"));
    assert.equal(result.valid, false);
  });

  it("rejects a path with a backtick", () => {
    const result = validatePluginApproval(
      pluginApprovalData("plugin`touch /tmp/x`"),
    );
    assert.equal(result.valid, false);
  });

  it("rejects a path with a dollar sign", () => {
    const result = validatePluginApproval(pluginApprovalData("$(whoami)"));
    assert.equal(result.valid, false);
  });

  it("accepts a dot-prefixed path segment", () => {
    const result = validatePluginApproval(
      pluginApprovalData(".claude/plugins/foo"),
    );
    assert.equal(result.valid, true);
  });

  it("accepts a dot-prefixed segment in the middle of the path", () => {
    const result = validatePluginApproval(pluginApprovalData("a/.claude/b"));
    assert.equal(result.valid, true);
  });

  it("rejects a path traversal segment", () => {
    const result = validatePluginApproval(pluginApprovalData("a/../b"));
    assert.equal(result.valid, false);
  });

  it("rejects a lone dot segment", () => {
    const result = validatePluginApproval(pluginApprovalData("a/./b"));
    assert.equal(result.valid, false);
  });

  it("rejects a double slash (empty segment)", () => {
    const result = validatePluginApproval(pluginApprovalData("a//b"));
    assert.equal(result.valid, false);
  });

  it("rejects a bare double-dot path", () => {
    const result = validatePluginApproval(pluginApprovalData(".."));
    assert.equal(result.valid, false);
  });

  it("accepts a literal name that merely starts with two dots", () => {
    const result = validatePluginApproval(pluginApprovalData("..hidden"));
    assert.equal(result.valid, true);
  });
});

describe("validateVendorData — plugin approvals", () => {
  it("passes for valid org with plugin approvals", () => {
    const result = validateVendorData(validOrg, [], {
      pluginApprovals: [pluginApproval()],
    });
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
    assert.equal(result.pluginApprovals.length, 1);
  });

  it("passes with MCP, skill, and plugin approvals together", () => {
    const result = validateVendorData(validOrg, [approval()], {
      skillApprovals: [skillApproval()],
      pluginApprovals: [pluginApproval()],
    });
    assert.equal(result.valid, true);
    assert.equal(result.approvals.length, 1);
    assert.equal(result.skillApprovals.length, 1);
    assert.equal(result.pluginApprovals.length, 1);
  });

  it("fails when plugin approval fails schema validation", () => {
    const result = validateVendorData(validOrg, [], {
      pluginApprovals: [{ file: "bad.json", data: { pluginId: "x" } as never }],
    });
    assert.equal(result.valid, false);
  });

  it("fails on duplicate pluginId across plugin approvals", () => {
    const result = validateVendorData(validOrg, [], {
      pluginApprovals: [
        pluginApproval("io.example/my-plugin"),
        {
          file: "io.example--my-plugin-copy.json",
          data: {
            pluginId: "io.example/my-plugin",
            date: "2026-08-02",
            source: {
              url: "https://github.com/example/plugins.git",
              path: "plugins/my-plugin",
            },
            installConfigs: [{ tool: "test-tool" }],
          },
        },
      ],
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("duplicate approval")));
  });

  it("fails when tool ID in plugin approval is not in organization", () => {
    const result = validateVendorData(validOrg, [], {
      pluginApprovals: [
        {
          file: "io.example--my-plugin.json",
          data: {
            pluginId: "io.example/my-plugin",
            date: "2026-08-01",
            source: {
              url: "https://github.com/example/plugins.git",
              path: "plugins/my-plugin",
            },
            installConfigs: [{ tool: "nonexistent-tool" }],
          },
        },
      ],
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("nonexistent-tool")));
  });

  it("warns on plugin filename mismatch", () => {
    const result = validateVendorData(validOrg, [], {
      pluginApprovals: [
        {
          file: "wrong-name.json",
          data: {
            pluginId: "io.example/my-plugin",
            date: "2026-08-01",
            source: {
              url: "https://github.com/example/plugins.git",
              path: "plugins/my-plugin",
            },
            installConfigs: [{ tool: "test-tool" }],
          },
        },
      ],
    });
    assert.equal(result.valid, true);
    assert.ok(result.warnings.some((w) => w.includes("filename should be")));
  });

  it("passes for plugin approval without installConfigs", () => {
    const result = validateVendorData(validOrg, [], {
      pluginApprovals: [
        {
          file: "io.example--my-plugin.json",
          data: {
            pluginId: "io.example/my-plugin",
            date: "2026-08-01",
            source: {
              url: "https://github.com/example/plugins.git",
              path: "plugins/my-plugin",
            },
          },
        },
      ],
    });
    assert.equal(result.valid, true);
    assert.equal(result.pluginApprovals.length, 1);
  });

  it("passes for plugin approval without a path (plugin at repo root)", () => {
    const result = validateVendorData(validOrg, [], {
      pluginApprovals: [
        {
          file: "io.example--my-plugin.json",
          data: {
            pluginId: "io.example/my-plugin",
            date: "2026-08-01",
            source: { url: "https://github.com/example/my-plugin.git" },
          },
        },
      ],
    });
    assert.equal(result.valid, true);
    assert.equal(result.pluginApprovals.length, 1);
  });

  it("backward compatible — works without options", () => {
    const result = validateVendorData(validOrg, [approval()]);
    assert.equal(result.valid, true);
    assert.equal(result.pluginApprovals.length, 0);
  });
});

// --- Agent approval validation ---

function agentApproval(agentId = "io.example/my-agent"): AgentApprovalEntry {
  return {
    file: agentId.replace(/\//g, "--") + ".json",
    data: {
      agentId,
      date: "2026-08-01",
      source: {
        url: "https://example.com/agent_card.json",
      },
      installConfigs: [{ tool: "test-tool" }],
    },
  };
}

describe("validateVendorData — agent approvals", () => {
  it("passes for valid org with agent approvals", () => {
    const result = validateVendorData(validOrg, [], {
      agentApprovals: [agentApproval()],
    });
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
    assert.equal(result.agentApprovals.length, 1);
  });

  it("passes with MCP, skill, plugin, and agent approvals together", () => {
    const result = validateVendorData(validOrg, [approval()], {
      skillApprovals: [skillApproval()],
      pluginApprovals: [pluginApproval()],
      agentApprovals: [agentApproval()],
    });
    assert.equal(result.valid, true);
    assert.equal(result.approvals.length, 1);
    assert.equal(result.skillApprovals.length, 1);
    assert.equal(result.pluginApprovals.length, 1);
    assert.equal(result.agentApprovals.length, 1);
  });

  it("fails when agent approval fails schema validation", () => {
    const result = validateVendorData(validOrg, [], {
      agentApprovals: [{ file: "bad.json", data: { agentId: "x" } as never }],
    });
    assert.equal(result.valid, false);
  });

  it("fails on duplicate agentId across agent approvals", () => {
    const result = validateVendorData(validOrg, [], {
      agentApprovals: [
        agentApproval("io.example/my-agent"),
        {
          file: "io.example--my-agent-copy.json",
          data: {
            agentId: "io.example/my-agent",
            date: "2026-08-02",
            source: { url: "https://example.com/agent_card.json" },
            installConfigs: [{ tool: "test-tool" }],
          },
        },
      ],
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("duplicate approval")));
  });

  it("fails when tool ID in agent approval is not in organization", () => {
    const result = validateVendorData(validOrg, [], {
      agentApprovals: [
        {
          file: "io.example--my-agent.json",
          data: {
            agentId: "io.example/my-agent",
            date: "2026-08-01",
            source: { url: "https://example.com/agent_card.json" },
            installConfigs: [{ tool: "nonexistent-tool" }],
          },
        },
      ],
    });
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("nonexistent-tool")));
  });

  it("warns on agent filename mismatch", () => {
    const result = validateVendorData(validOrg, [], {
      agentApprovals: [
        {
          file: "wrong-name.json",
          data: {
            agentId: "io.example/my-agent",
            date: "2026-08-01",
            source: { url: "https://example.com/agent_card.json" },
            installConfigs: [{ tool: "test-tool" }],
          },
        },
      ],
    });
    assert.equal(result.valid, true);
    assert.ok(result.warnings.some((w) => w.includes("filename should be")));
  });

  it("passes for agent approval without installConfigs", () => {
    const result = validateVendorData(validOrg, [], {
      agentApprovals: [
        {
          file: "io.example--my-agent.json",
          data: {
            agentId: "io.example/my-agent",
            date: "2026-08-01",
            source: { url: "https://example.com/agent_card.json" },
          },
        },
      ],
    });
    assert.equal(result.valid, true);
    assert.equal(result.agentApprovals.length, 1);
  });

  it("backward compatible — works without options", () => {
    const result = validateVendorData(validOrg, [approval()]);
    assert.equal(result.valid, true);
    assert.equal(result.agentApprovals.length, 0);
  });
});

// --- validateApproval — root config and derived marker ---

describe("validateApproval — root config and derived marker", () => {
  it("accepts an approval with a root remote config", () => {
    const result = validateApproval({
      serverId: "io.example/foo",
      date: "2026-08-05",
      config: { url: "https://mcp.example.com" },
    });
    assert.equal(result.valid, true);
  });

  it("accepts an approval with a root local config", () => {
    const result = validateApproval({
      serverId: "io.example/foo",
      date: "2026-08-05",
      config: { command: "npx", args: ["-y", "pkg"] },
    });
    assert.equal(result.valid, true);
  });

  it("rejects a root config with neither url nor command", () => {
    const result = validateApproval({
      serverId: "io.example/foo",
      date: "2026-08-05",
      config: { foo: "bar" },
    });
    assert.equal(result.valid, false);
  });

  it("accepts a root config with type, headers, and oauth", () => {
    const result = validateApproval({
      serverId: "io.example/foo",
      date: "2026-08-05",
      config: {
        type: "http",
        url: "https://mcp.example.com",
        headers: { Authorization: "Bearer abc" },
        oauth: { scopes: "read write", clientId: "abc123" },
      },
    });
    assert.equal(result.valid, true);
  });

  it("accepts sse and ws as remote type values", () => {
    assert.equal(
      validateApproval({
        serverId: "io.example/foo",
        date: "2026-08-05",
        config: { type: "sse", url: "https://mcp.example.com" },
      }).valid,
      true,
    );
    assert.equal(
      validateApproval({
        serverId: "io.example/foo",
        date: "2026-08-05",
        config: { type: "ws", url: "wss://mcp.example.com" },
      }).valid,
      true,
    );
  });

  it("accepts a root config with type stdio", () => {
    const result = validateApproval({
      serverId: "io.example/foo",
      date: "2026-08-05",
      config: { type: "stdio", command: "npx" },
    });
    assert.equal(result.valid, true);
  });

  it("rejects headers on the local branch (additionalProperties false)", () => {
    const result = validateApproval({
      serverId: "io.example/foo",
      date: "2026-08-05",
      config: { command: "npx", headers: { Authorization: "Bearer abc" } },
    });
    assert.equal(result.valid, false);
  });

  it("rejects a mismatched type (stdio paired with url)", () => {
    const result = validateApproval({
      serverId: "io.example/foo",
      date: "2026-08-05",
      config: { type: "stdio", url: "https://mcp.example.com" },
    });
    assert.equal(result.valid, false);
  });

  it('accepts an installConfigs entry with config: "derived"', () => {
    const result = validateApproval({
      serverId: "io.example/foo",
      date: "2026-08-05",
      installConfigs: [{ tool: "some-tool", config: "derived" }],
    });
    assert.equal(result.valid, true);
  });

  it("still accepts an installConfigs entry with an explicit object config", () => {
    const result = validateApproval({
      serverId: "io.example/foo",
      date: "2026-08-05",
      installConfigs: [{ tool: "some-tool", config: { servers: {} } }],
    });
    assert.equal(result.valid, true);
  });

  it("rejects an installConfigs entry with config set to any other string", () => {
    const result = validateApproval({
      serverId: "io.example/foo",
      date: "2026-08-05",
      installConfigs: [{ tool: "some-tool", config: "auto" }],
    });
    assert.equal(result.valid, false);
  });
});

// --- validateOrganization — tools[].pluginInstallUrlPrefix ---

describe("validateOrganization — tools[].pluginInstallUrlPrefix", () => {
  it("accepts a tool with pluginInstallUrlPrefix", () => {
    const result = validateOrganization({
      id: "theia",
      name: "Theia IDE",
      description: "IDE",
      website: "https://theia-ide.org",
      tools: [
        {
          id: "theia-ide",
          name: "Theia IDE",
          pluginInstallUrlPrefix: "theia://install-plugin?id=",
        },
      ],
    });
    assert.equal(result.valid, true);
  });

  it("still accepts a tool without pluginInstallUrlPrefix", () => {
    const result = validateOrganization({
      id: "theia",
      name: "Theia IDE",
      description: "IDE",
      website: "https://theia-ide.org",
      tools: [{ id: "theia-ide", name: "Theia IDE" }],
    });
    assert.equal(result.valid, true);
  });
});

// --- validateOrganization — tools[].agentInstallUrlPrefix ---

describe("validateOrganization — tools[].agentInstallUrlPrefix", () => {
  it("accepts a tool with agentInstallUrlPrefix", () => {
    const result = validateOrganization({
      id: "theia",
      name: "Theia IDE",
      description: "IDE",
      website: "https://theia-ide.org",
      tools: [
        {
          id: "theia-ide",
          name: "Theia IDE",
          agentInstallUrlPrefix: "theia://install-agent?id=",
        },
      ],
    });
    assert.equal(result.valid, true);
  });

  it("still accepts a tool without agentInstallUrlPrefix", () => {
    const result = validateOrganization({
      id: "theia",
      name: "Theia IDE",
      description: "IDE",
      website: "https://theia-ide.org",
      tools: [{ id: "theia-ide", name: "Theia IDE" }],
    });
    assert.equal(result.valid, true);
  });
});

// --- validateOrganization — trusts.artifactTypes.mcp ---

describe("validateOrganization — trusts.artifactTypes.mcp", () => {
  it("accepts a trusts entry with artifactTypes.mcp", () => {
    const result = validateOrganization({
      id: "theia",
      name: "Theia IDE",
      description: "IDE",
      website: "https://theia-ide.org",
      trusts: [{ org: "eclipsesource", artifactTypes: { mcp: {} } }],
    });
    assert.equal(result.valid, true);
  });

  it("still accepts a trusts entry with artifactTypes.skills", () => {
    const result = validateOrganization({
      id: "theia",
      name: "Theia IDE",
      description: "IDE",
      website: "https://theia-ide.org",
      trusts: [{ org: "anthropic", artifactTypes: { skills: {} } }],
    });
    assert.equal(result.valid, true);
  });

  it("rejects an unrecognized artifactTypes key", () => {
    const result = validateOrganization({
      id: "theia",
      name: "Theia IDE",
      description: "IDE",
      website: "https://theia-ide.org",
      trusts: [{ org: "eclipsesource", artifactTypes: { bogus: {} } }],
    });
    assert.equal(result.valid, false);
  });
});

// --- validateVendorFiles ---
//
// validateVendorData (above) is exercised directly everywhere else in this
// file with in-memory approval arrays and never touches disk, so this is
// the only place the mcp/, skills/, and plugins/ directory-read branches in
// validateVendorFiles are covered. One fixture vendor dir covers all three.

describe("validateVendorFiles", () => {
  function makeFixtureVendor(withApprovals: boolean): string {
    const dir = mkdtempSync(join(tmpdir(), "vendor-fixture-"));
    writeFileSync(
      join(dir, "organization.json"),
      JSON.stringify({
        id: "acme",
        name: "Acme",
        description: "Test vendor",
        website: "https://acme.com",
        tools: [{ id: "test-tool", name: "Test Tool" }],
      }),
    );

    if (withApprovals) {
      mkdirSync(join(dir, "mcp"));
      writeFileSync(
        join(dir, "mcp", "io.example--server.json"),
        JSON.stringify({
          serverId: "io.example/server",
          date: "2026-05-01",
          installConfigs: [{ tool: "test-tool" }],
        }),
      );

      mkdirSync(join(dir, "skills"));
      writeFileSync(
        join(dir, "skills", "io.example--skill.json"),
        JSON.stringify({
          skillId: "io.example/skill",
          date: "2026-06-01",
          source: {
            url: "https://github.com/example/skills.git",
            path: "skills/skill",
          },
        }),
      );

      mkdirSync(join(dir, "plugins"));
      writeFileSync(
        join(dir, "plugins", "io.example--plugin.json"),
        JSON.stringify({
          pluginId: "io.example/plugin",
          date: "2026-08-01",
          source: { url: "https://github.com/example/plugin.git" },
        }),
      );
    }

    return dir;
  }

  it("reads and validates mcp/, skills/, and plugins/ directories from disk", () => {
    const dir = makeFixtureVendor(true);
    try {
      const result = validateVendorFiles(dir);
      assert.equal(result.valid, true);
      assert.equal(result.approvals.length, 1);
      assert.equal(result.approvals[0].data.serverId, "io.example/server");
      assert.equal(result.skillApprovals.length, 1);
      assert.equal(result.skillApprovals[0].data.skillId, "io.example/skill");
      assert.equal(result.pluginApprovals.length, 1);
      assert.equal(
        result.pluginApprovals[0].data.pluginId,
        "io.example/plugin",
      );
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("returns valid empty results when mcp/, skills/, and plugins/ are absent", () => {
    const dir = makeFixtureVendor(false);
    try {
      const result = validateVendorFiles(dir);
      assert.equal(result.valid, true);
      assert.equal(result.approvals.length, 0);
      assert.equal(result.skillApprovals.length, 0);
      assert.equal(result.pluginApprovals.length, 0);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });
});

// --- readApprovalDir ---

describe("readApprovalDir", () => {
  it("reads a temp directory of .json files correctly", () => {
    const dir = mkdtempSync(join(tmpdir(), "approval-dir-"));
    mkdirSync(join(dir, "agents"));
    writeFileSync(
      join(dir, "agents", "io.example--my-agent.json"),
      JSON.stringify({ agentId: "io.example/my-agent" }),
    );
    try {
      const result = readApprovalDir<{ agentId: string }>(dir, "agents");
      assert.ok("entries" in result);
      if ("entries" in result) {
        assert.equal(result.entries.length, 1);
        assert.equal(result.entries[0].file, "io.example--my-agent.json");
        assert.equal(result.entries[0].data.agentId, "io.example/my-agent");
      }
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("returns { entries: [] } when the directory doesn't exist", () => {
    const dir = mkdtempSync(join(tmpdir(), "approval-dir-"));
    try {
      const result = readApprovalDir(dir, "nonexistent");
      assert.deepEqual(result, { entries: [] });
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("returns { error } with a dir-name-prefixed message on invalid JSON", () => {
    const dir = mkdtempSync(join(tmpdir(), "approval-dir-"));
    mkdirSync(join(dir, "agents"));
    writeFileSync(join(dir, "agents", "bad.json"), "{ not valid json");
    try {
      const result = readApprovalDir(dir, "agents");
      assert.ok("error" in result);
      if ("error" in result) {
        assert.ok(result.error.startsWith("agents/bad.json"));
      }
    } finally {
      rmSync(dir, { recursive: true });
    }
  });
});

// --- validateSimpleApprovals ---

function freshVendorResult(): VendorValidationResult {
  return {
    valid: true,
    errors: [],
    warnings: [],
    approvals: [],
    skillApprovals: [],
    pluginApprovals: [],
    agentApprovals: [],
  };
}

function fakeValidate(_data: unknown): ValidationResult {
  return { valid: true, errors: [] };
}

function fakeSimpleApprovalConfig() {
  return {
    validate: fakeValidate,
    getId: (d: { thingId: string }) => d.thingId,
    idLabel: "thingId",
  };
}

describe("validateSimpleApprovals", () => {
  it("accepts valid entries and dedupes by id", () => {
    const result = freshVendorResult();
    const accepted = validateSimpleApprovals(
      [
        { file: "io.example--a.json", data: { thingId: "io.example/a" } },
        { file: "io.example--a-copy.json", data: { thingId: "io.example/a" } },
      ],
      fakeSimpleApprovalConfig(),
      new Set<string>(),
      result,
    );
    assert.equal(accepted.length, 1);
    assert.equal(result.valid, false);
    assert.ok(
      result.errors.some(
        (e) => e.includes("duplicate approval") && e.includes("thingId"),
      ),
    );
  });

  it("warns when the filename doesn't match the expected pattern", () => {
    const result = freshVendorResult();
    validateSimpleApprovals(
      [{ file: "wrong-name.json", data: { thingId: "io.example/a" } }],
      fakeSimpleApprovalConfig(),
      new Set<string>(),
      result,
    );
    assert.ok(result.warnings.some((w) => w.includes("filename should be")));
  });

  it("wires in checkToolIds for tool-id validation", () => {
    const result = freshVendorResult();
    validateSimpleApprovals(
      [
        {
          file: "io.example--a.json",
          data: {
            thingId: "io.example/a",
            installConfigs: [{ tool: "bad-tool" }],
          },
        },
      ],
      fakeSimpleApprovalConfig(),
      new Set(["good-tool"]),
      result,
    );
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("bad-tool")));
  });
});
