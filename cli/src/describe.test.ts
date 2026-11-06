import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { describePlugin, describeSkill } from "./describe.js";
import type { Plugin, Skill } from "./types.js";

const COMMIT = "7b4a44e40e0112233445566778899aabbccddeef";

const ORGS = [
  { id: "anthropic", name: "Anthropic" },
  { id: "theia", name: "Theia" },
];

function skill(overrides: Partial<Skill> = {}): Skill {
  return {
    skillId: "io.github.anthropics/code-review",
    name: "code-review",
    description: "Reviews code",
    source: {
      url: "https://github.com/anthropics/skills.git",
      path: "skills/code-review",
      commit: COMMIT,
    },
    contentHash: "49b0db08bdaa",
    latestHash: "49b0db08bdaa",
    approvals: [{ organizationId: "anthropic", date: "2026-01-02" }],
    ...overrides,
  };
}

describe("describeSkill", () => {
  it("names the skill, its source, who approved it, the target and the hash", () => {
    assert.deepEqual(describeSkill(skill(), ORGS), [
      "code-review (io.github.anthropics/code-review)",
      `Source:         https://github.com/anthropics/skills/tree/${COMMIT}/skills/code-review`,
      "Approved by:    Anthropic, 2026-01-02",
      "Target:         Tracks the default branch",
      "Content hash:   49b0db08bdaa",
    ]);
  });

  it("lists every approval, naming the organization a trusted one came through", () => {
    const lines = describeSkill(
      skill({
        approvals: [
          { organizationId: "anthropic", date: "2026-01-02" },
          {
            organizationId: "theia",
            date: "2026-02-03",
            viaTrust: "anthropic",
          },
          { organizationId: "acme", date: "2026-03-04" },
        ],
      }),
      ORGS,
    );
    assert.deepEqual(lines.slice(2, 5), [
      "Approved by:    Anthropic, 2026-01-02",
      "                Theia, 2026-02-03, via trust in Anthropic",
      "                acme, 2026-03-04",
    ]);
  });

  describe("approved target", () => {
    const target = (overrides: Partial<Skill>, generatedAt?: string) =>
      describeSkill(skill(overrides), ORGS, generatedAt).find((line) =>
        line.startsWith("Target:"),
      );

    it("names a branch ref the approval follows", () => {
      assert.equal(
        target({
          source: { ...skill().source, ref: "release", pinned: false },
        }),
        "Target:         Tracks release",
      );
    });

    it("names a pin by its short commit", () => {
      assert.equal(
        target({ source: { ...skill().source, ref: COMMIT, pinned: true } }),
        "Target:         Pinned to 7b4a44e",
      );
    });

    // Neutral on purpose: a pin the source moved past is still a valid
    // approval. Only the newer content hasn't been reviewed.
    it("says the source has changed since a pin, dated by the feed", () => {
      assert.equal(
        target(
          {
            source: { ...skill().source, ref: "v1.2.0", pinned: true },
            latestHash: "760876d07424",
          },
          "2026-10-25T06:20:00.490Z",
        ),
        "Target:         Pinned to v1.2.0, the source has changed since (checked 2026-10-25)",
      );
    });

    it("prints a ref the feed doesn't classify as given", () => {
      assert.equal(
        target({ source: { ...skill().source, ref: "v1.2.0" } }),
        "Target:         Ref: v1.2.0",
      );
    });
  });
});

function plugin(overrides: Partial<Plugin> = {}): Plugin {
  return {
    pluginId: "io.github.acme/kit",
    name: "kit",
    description: "A kit",
    version: "1.2.0",
    source: {
      url: "https://github.com/acme/plugins",
      path: "plugins/kit",
      commit: COMMIT,
    },
    contentHash: "aa11bb22cc33",
    latestHash: "aa11bb22cc33",
    containedSkills: [
      { name: "lint", description: "Lints", path: "skills/lint" },
      { name: "fmt", description: "Formats", path: "skills/fmt" },
    ],
    containedMcpServers: [{ name: "kit-server", transport: "stdio" }],
    approvals: [{ organizationId: "anthropic", date: "2026-01-02" }],
    ...overrides,
  };
}

describe("describePlugin", () => {
  it("adds the version and what installing the plugin brings along", () => {
    assert.deepEqual(describePlugin(plugin(), ORGS), [
      "kit (io.github.acme/kit)",
      "Version:        1.2.0",
      `Source:         https://github.com/acme/plugins/tree/${COMMIT}/plugins/kit`,
      "Approved by:    Anthropic, 2026-01-02",
      "Target:         Tracks the default branch",
      "Content hash:   aa11bb22cc33",
      "Skills:         lint",
      "                fmt",
      "MCP servers:    kit-server (stdio)",
    ]);
  });

  it("says so when the plugin brings no skills or MCP servers", () => {
    const lines = describePlugin(
      plugin({
        version: undefined,
        containedSkills: [],
        containedMcpServers: [],
      }),
      ORGS,
    );
    assert.deepEqual(lines.slice(-2), [
      "Skills:         none",
      "MCP servers:    none",
    ]);
    assert.ok(!lines.some((line) => line.startsWith("Version:")));
  });

  // The organization approved the marketplace file, not this plugin: a weaker
  // statement the user should see.
  it("names the marketplace an approval came through, and what that means", () => {
    const lines = describePlugin(
      plugin({
        approvals: [
          { organizationId: "anthropic", date: "2026-01-02" },
          {
            organizationId: "theia",
            date: "2026-02-03",
            sourcedFrom: {
              marketplaceUrl: "https://github.com/acme/plugins",
              format: "claude",
            },
          },
        ],
      }),
      ORGS,
    );
    assert.deepEqual(lines.slice(3, 6), [
      "Approved by:    Anthropic, 2026-01-02",
      "                Theia, 2026-02-03, through the marketplace at https://github.com/acme/plugins",
      "                (approved through a marketplace: the organization vouched for the marketplace, not for this entry on its own)",
    ]);
  });
});
