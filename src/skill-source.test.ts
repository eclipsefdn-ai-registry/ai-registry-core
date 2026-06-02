import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseSkillFrontmatter, computeContentHash } from "./skill-source.js";

// --- parseSkillFrontmatter ---

describe("parseSkillFrontmatter", () => {
  it("extracts name and description from single-line frontmatter", () => {
    const content = `---
name: my-skill
description: A skill that does something useful.
---

# My Skill
Instructions here.`;
    const result = parseSkillFrontmatter(content);
    assert.equal(result.name, "my-skill");
    assert.equal(result.description, "A skill that does something useful.");
  });

  it("extracts multi-line description with > syntax", () => {
    const content = `---
name: complex-skill
description: >
  A skill that does
  something across
  multiple lines.
---

Body.`;
    const result = parseSkillFrontmatter(content);
    assert.equal(result.name, "complex-skill");
    assert.equal(
      result.description,
      "A skill that does something across multiple lines.",
    );
  });

  it("returns empty strings when frontmatter is missing", () => {
    const content = "# No frontmatter\nJust markdown.";
    const result = parseSkillFrontmatter(content);
    assert.equal(result.name, "");
    assert.equal(result.description, "");
  });

  it("returns empty strings when fields are missing", () => {
    const content = `---
other: value
---

Body.`;
    const result = parseSkillFrontmatter(content);
    assert.equal(result.name, "");
    assert.equal(result.description, "");
  });

  it("handles name without description", () => {
    const content = `---
name: name-only
---

Body.`;
    const result = parseSkillFrontmatter(content);
    assert.equal(result.name, "name-only");
    assert.equal(result.description, "");
  });
});

// --- computeContentHash ---

describe("computeContentHash", () => {
  function makeTmpSkill(files: Record<string, string>): string {
    const dir = mkdtempSync(join(tmpdir(), "skill-test-"));
    for (const [name, content] of Object.entries(files)) {
      const filePath = join(dir, name);
      mkdirSync(join(filePath, ".."), { recursive: true });
      writeFileSync(filePath, content);
    }
    return dir;
  }

  it("produces a deterministic hash", () => {
    const dir = makeTmpSkill({ "SKILL.md": "# Skill\nContent." });
    try {
      const hash1 = computeContentHash(dir);
      const hash2 = computeContentHash(dir);
      assert.equal(hash1, hash2);
      assert.equal(hash1.length, 12);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("changes when file content changes", () => {
    const dir1 = makeTmpSkill({ "SKILL.md": "Version 1" });
    const dir2 = makeTmpSkill({ "SKILL.md": "Version 2" });
    try {
      const hash1 = computeContentHash(dir1);
      const hash2 = computeContentHash(dir2);
      assert.notEqual(hash1, hash2);
    } finally {
      rmSync(dir1, { recursive: true });
      rmSync(dir2, { recursive: true });
    }
  });

  it("changes when a file is added", () => {
    const dir1 = makeTmpSkill({ "SKILL.md": "Content" });
    const dir2 = makeTmpSkill({
      "SKILL.md": "Content",
      "scripts/helper.py": "print('hi')",
    });
    try {
      const hash1 = computeContentHash(dir1);
      const hash2 = computeContentHash(dir2);
      assert.notEqual(hash1, hash2);
    } finally {
      rmSync(dir1, { recursive: true });
      rmSync(dir2, { recursive: true });
    }
  });

  it("ignores hidden files", () => {
    const dir1 = makeTmpSkill({ "SKILL.md": "Content" });
    const dir2 = makeTmpSkill({
      "SKILL.md": "Content",
      ".hidden": "secret",
    });
    try {
      const hash1 = computeContentHash(dir1);
      const hash2 = computeContentHash(dir2);
      assert.equal(hash1, hash2);
    } finally {
      rmSync(dir1, { recursive: true });
      rmSync(dir2, { recursive: true });
    }
  });
});
