import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  parseSkillFrontmatter,
  computeContentHash,
  isGlobPattern,
  discoverSkillPaths,
} from "./skill-source.js";

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
    // YAML > (folded, clip) keeps a trailing newline
    assert.equal(
      result.description,
      "A skill that does something across multiple lines.\n",
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

  it("extracts multi-line description with >- syntax", () => {
    const content = `---
name: folded-strip
description: >-
  A skill that does
  something across
  multiple lines.
---

Body.`;
    const result = parseSkillFrontmatter(content);
    assert.equal(result.name, "folded-strip");
    assert.equal(
      result.description,
      "A skill that does something across multiple lines.",
    );
  });

  it("extracts multi-line description with |- syntax", () => {
    const content = `---
name: literal-strip
description: |-
  Line one.
  Line two.
  Line three.
---

Body.`;
    const result = parseSkillFrontmatter(content);
    assert.equal(result.name, "literal-strip");
    assert.equal(result.description, "Line one.\nLine two.\nLine three.");
  });

  it("handles description with special characters and markdown", () => {
    const content = `---
name: special-chars
description: >-
  **TRIGGER: about to populate \`AskUserQuestion\` options.**
  Use "quotes" and 'single quotes' and em-dashes — freely.
---

Body.`;
    const result = parseSkillFrontmatter(content);
    assert.equal(result.name, "special-chars");
    assert.ok(result.description.includes("**TRIGGER:"));
    assert.ok(result.description.includes("`AskUserQuestion`"));
    assert.ok(result.description.includes("—"));
  });

  it("handles quoted description values", () => {
    const content = `---
name: quoted
description: "A description with: colons and # hashes"
---

Body.`;
    const result = parseSkillFrontmatter(content);
    assert.equal(result.name, "quoted");
    assert.equal(result.description, "A description with: colons and # hashes");
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

// --- isGlobPattern ---

describe("isGlobPattern", () => {
  it('recognizes "*" as a glob', () => {
    assert.equal(isGlobPattern("*"), true);
  });

  it('recognizes "skills/*" as a glob', () => {
    assert.equal(isGlobPattern("skills/*"), true);
  });

  it('recognizes "a/b/c/*" as a glob', () => {
    assert.equal(isGlobPattern("a/b/c/*"), true);
  });

  it("does not treat normal paths as globs", () => {
    assert.equal(isGlobPattern("skills/foo"), false);
  });

  it("does not treat mid-path wildcards as globs", () => {
    assert.equal(isGlobPattern("*/foo"), false);
  });
});

// --- discoverSkillPaths ---

describe("discoverSkillPaths", () => {
  function makeGitRepoWithSkills(
    skills: string[],
    nonSkills: string[] = [],
  ): string {
    const dir = mkdtempSync(join(tmpdir(), "discover-test-"));
    execSync("git init", { cwd: dir, stdio: "pipe" });
    execSync('git config user.email "test@test.com"', {
      cwd: dir,
      stdio: "pipe",
    });
    execSync('git config user.name "Test"', { cwd: dir, stdio: "pipe" });

    // Create skill folders with SKILL.md
    for (const skill of skills) {
      const skillDir = join(dir, skill);
      mkdirSync(skillDir, { recursive: true });
      writeFileSync(
        join(skillDir, "SKILL.md"),
        `---\nname: ${skill.split("/").pop()}\n---\nContent`,
      );
    }

    // Create non-skill folders (no SKILL.md)
    for (const ns of nonSkills) {
      const nsDir = join(dir, ns);
      mkdirSync(nsDir, { recursive: true });
      writeFileSync(join(nsDir, "README.md"), "Not a skill");
    }

    execSync("git add -A && git commit -m init", { cwd: dir, stdio: "pipe" });
    return dir;
  }

  it("discovers skill folders under a prefix", () => {
    const dir = makeGitRepoWithSkills(
      ["skills/alpha", "skills/beta"],
      ["skills/not-a-skill"],
    );
    try {
      const paths = discoverSkillPaths(dir, "skills/*");
      assert.deepEqual(paths, ["skills/alpha", "skills/beta"]);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("discovers skill folders at repo root with *", () => {
    const dir = makeGitRepoWithSkills(["alpha", "beta"], ["gamma"]);
    try {
      const paths = discoverSkillPaths(dir, "*");
      assert.deepEqual(paths, ["alpha", "beta"]);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("returns empty array when no skills found", () => {
    const dir = makeGitRepoWithSkills([], ["skills/not-a-skill"]);
    try {
      const paths = discoverSkillPaths(dir, "skills/*");
      assert.deepEqual(paths, []);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("skips hidden directories", () => {
    const dir = makeGitRepoWithSkills(["skills/visible", "skills/.hidden"]);
    try {
      const paths = discoverSkillPaths(dir, "skills/*");
      assert.deepEqual(paths, ["skills/visible"]);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("returns sorted results", () => {
    const dir = makeGitRepoWithSkills([
      "skills/zeta",
      "skills/alpha",
      "skills/mu",
    ]);
    try {
      const paths = discoverSkillPaths(dir, "skills/*");
      assert.deepEqual(paths, ["skills/alpha", "skills/mu", "skills/zeta"]);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });
});
