import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkToolIds, validateVendorData } from "./validate.js";

// --- checkToolIds ---

describe("checkToolIds", () => {
  const toolIds = new Set(["theia-ide", "other-tool"]);

  it("returns no errors for valid tool IDs", () => {
    const errors = checkToolIds(
      {
        serverId: "io.example/server",
        date: "2026-05-01",
        installConfigs: [{ tool: "theia-ide" }, { tool: "other-tool" }],
      },
      toolIds,
    );
    assert.equal(errors.length, 0);
  });

  it("reports tool IDs not in organization", () => {
    const errors = checkToolIds(
      {
        serverId: "io.example/server",
        date: "2026-05-01",
        installConfigs: [{ tool: "nonexistent" }],
      },
      toolIds,
    );
    assert.equal(errors.length, 1);
    assert.ok(errors[0].includes("nonexistent"));
  });

  it("reports multiple invalid tool IDs", () => {
    const errors = checkToolIds(
      {
        serverId: "io.example/server",
        date: "2026-05-01",
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
});
