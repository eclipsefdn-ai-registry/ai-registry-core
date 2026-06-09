import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  checkToolIds,
  validateVendorData,
  type SkillApprovalEntry,
} from "./validate.js";

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
    const result = validateVendorData(validOrg, [], "wrong-id");
    assert.equal(result.valid, false);
    assert.ok(result.errors[0].includes("does not match vendor id"));
  });

  it("passes when expected vendor id matches", () => {
    const result = validateVendorData(validOrg, [], "test-vendor");
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
    const result = validateVendorData(validOrg, [], undefined, [
      skillApproval(),
    ]);
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
    assert.equal(result.skillApprovals.length, 1);
  });

  it("passes with both MCP and skill approvals", () => {
    const result = validateVendorData(validOrg, [approval()], undefined, [
      skillApproval(),
    ]);
    assert.equal(result.valid, true);
    assert.equal(result.approvals.length, 1);
    assert.equal(result.skillApprovals.length, 1);
  });

  it("fails when skill approval fails schema validation", () => {
    const result = validateVendorData(validOrg, [], undefined, [
      { file: "bad.json", data: { skillId: "x" } as never },
    ]);
    assert.equal(result.valid, false);
  });

  it("fails on duplicate skillId across skill approvals", () => {
    const result = validateVendorData(validOrg, [], undefined, [
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
    ]);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("duplicate approval")));
  });

  it("fails when tool ID in skill approval is not in organization", () => {
    const result = validateVendorData(validOrg, [], undefined, [
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
    ]);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("nonexistent-tool")));
  });

  it("warns on skill filename mismatch", () => {
    const result = validateVendorData(validOrg, [], undefined, [
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
    ]);
    assert.equal(result.valid, true);
    assert.ok(result.warnings.some((w) => w.includes("filename should be")));
  });

  it("passes for skill approval without installConfigs", () => {
    const result = validateVendorData(validOrg, [], undefined, [
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
    ]);
    assert.equal(result.valid, true);
    assert.equal(result.skillApprovals.length, 1);
  });

  it("backward compatible — works without skill approvals param", () => {
    const result = validateVendorData(validOrg, [approval()]);
    assert.equal(result.valid, true);
    assert.equal(result.skillApprovals.length, 0);
  });

  it("passes for skill approval with array path", () => {
    const result = validateVendorData(validOrg, [], undefined, [
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
    ]);
    assert.equal(result.valid, true);
    assert.equal(result.skillApprovals.length, 1);
  });

  it("passes for skill approval with glob path", () => {
    const result = validateVendorData(validOrg, [], undefined, [
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
    ]);
    assert.equal(result.valid, true);
    assert.equal(result.skillApprovals.length, 1);
  });

  it("fails for skill approval with empty path array", () => {
    const result = validateVendorData(validOrg, [], undefined, [
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
    ]);
    assert.equal(result.valid, false);
  });

  it("fails when multi-path skillId contains /", () => {
    const result = validateVendorData(validOrg, [], undefined, [
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
    ]);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("must not contain")));
  });

  it("fails when glob-path skillId contains /", () => {
    const result = validateVendorData(validOrg, [], undefined, [
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
    ]);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some((e) => e.includes("must not contain")));
  });
});
