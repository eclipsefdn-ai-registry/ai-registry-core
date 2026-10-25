import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { describeSkill } from "./describeSkill.js";
import type { Skill } from "./types.js";

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
