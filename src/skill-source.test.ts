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
  resolveSkillPaths,
  expandSkillEntry,
  skillCloneKey,
  fetchSkillMetadata,
} from "./skill-source.js";
import type { SkillEntry } from "./consolidate.js";

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

// --- resolveSkillPaths ---

describe("resolveSkillPaths", () => {
  function setup(
    sourceUrl: string,
    skills: string[],
    nonSkills: string[] = [],
    ref?: string,
  ): { tmpDir: string } {
    const tmpDir = mkdtempSync(join(tmpdir(), "resolve-test-"));
    const cloneDir = join(tmpDir, `skill-${skillCloneKey(sourceUrl, ref)}`);
    mkdirSync(cloneDir, { recursive: true });
    execSync("git init", { cwd: cloneDir, stdio: "pipe" });
    execSync('git config user.email "test@test.com"', {
      cwd: cloneDir,
      stdio: "pipe",
    });
    execSync('git config user.name "Test"', {
      cwd: cloneDir,
      stdio: "pipe",
    });

    for (const skill of skills) {
      const skillDir = join(cloneDir, skill);
      mkdirSync(skillDir, { recursive: true });
      writeFileSync(
        join(skillDir, "SKILL.md"),
        `---\nname: ${skill.split("/").pop()}\n---\nContent`,
      );
    }
    for (const ns of nonSkills) {
      const nsDir = join(cloneDir, ns);
      mkdirSync(nsDir, { recursive: true });
      writeFileSync(join(nsDir, "README.md"), "Not a skill");
    }

    execSync("git add -A && git commit -m init", {
      cwd: cloneDir,
      stdio: "pipe",
    });
    return { tmpDir };
  }

  it("expands a single glob string", () => {
    const url = "https://example.test/resolve-single-glob.git";
    const { tmpDir } = setup(url, ["skills/alpha", "skills/beta"]);
    try {
      const { resolved, warnings } = resolveSkillPaths(url, "skills/*", tmpDir);
      assert.deepEqual(resolved, ["skills/alpha", "skills/beta"]);
      assert.deepEqual(warnings, []);
    } finally {
      rmSync(tmpDir, { recursive: true });
    }
  });

  it("expands glob in an array", () => {
    const url = "https://example.test/resolve-array-glob.git";
    const { tmpDir } = setup(url, [
      "engineering/a",
      "engineering/b",
      "productivity/c",
    ]);
    try {
      const { resolved, warnings } = resolveSkillPaths(
        url,
        ["engineering/*", "productivity/*"],
        tmpDir,
      );
      assert.deepEqual(resolved, [
        "engineering/a",
        "engineering/b",
        "productivity/c",
      ]);
      assert.deepEqual(warnings, []);
    } finally {
      rmSync(tmpDir, { recursive: true });
    }
  });

  it("returns literal paths as-is without cloning", () => {
    const url = "https://example.test/resolve-literals.git";
    const tmpDir = mkdtempSync(join(tmpdir(), "resolve-noglob-"));
    try {
      const { resolved, warnings } = resolveSkillPaths(
        url,
        ["skills/foo", "skills/bar"],
        tmpDir,
      );
      assert.deepEqual(resolved, ["skills/foo", "skills/bar"]);
      assert.deepEqual(warnings, []);
    } finally {
      rmSync(tmpDir, { recursive: true });
    }
  });

  it("returns a single literal string as-is", () => {
    const url = "https://example.test/resolve-single-literal.git";
    const tmpDir = mkdtempSync(join(tmpdir(), "resolve-lit-"));
    try {
      const { resolved, warnings } = resolveSkillPaths(
        url,
        "skills/foo",
        tmpDir,
      );
      assert.deepEqual(resolved, ["skills/foo"]);
      assert.deepEqual(warnings, []);
    } finally {
      rmSync(tmpDir, { recursive: true });
    }
  });

  it("mixes globs and literal paths", () => {
    const url = "https://example.test/resolve-mixed.git";
    const { tmpDir } = setup(url, ["engineering/a", "engineering/b"]);
    try {
      const { resolved, warnings } = resolveSkillPaths(
        url,
        ["engineering/*", "misc/keep"],
        tmpDir,
      );
      assert.deepEqual(resolved, [
        "engineering/a",
        "engineering/b",
        "misc/keep",
      ]);
      assert.deepEqual(warnings, []);
    } finally {
      rmSync(tmpDir, { recursive: true });
    }
  });

  it("warns when a glob matches nothing", () => {
    const url = "https://example.test/resolve-empty-glob.git";
    const { tmpDir } = setup(url, ["engineering/a"]);
    try {
      const { resolved, warnings } = resolveSkillPaths(
        url,
        ["engineering/*", "empty/*"],
        tmpDir,
      );
      assert.deepEqual(resolved, ["engineering/a"]);
      assert.equal(warnings.length, 1);
      assert.ok(warnings[0].includes("empty/*"));
    } finally {
      rmSync(tmpDir, { recursive: true });
    }
  });

  it("deduplicates and warns", () => {
    const url = "https://example.test/resolve-dedup.git";
    const { tmpDir } = setup(url, ["skills/alpha", "skills/beta"]);
    try {
      const { resolved, warnings } = resolveSkillPaths(
        url,
        ["skills/*", "skills/alpha"],
        tmpDir,
      );
      assert.deepEqual(resolved, ["skills/alpha", "skills/beta"]);
      assert.ok(warnings.some((w) => w.includes("duplicate")));
    } finally {
      rmSync(tmpDir, { recursive: true });
    }
  });
});

// --- expandSkillEntry ---

describe("expandSkillEntry", () => {
  /**
   * Sets up a tmpDir containing a pre-populated clone directory at the path
   * `expandSkillEntry` will compute from `sourceUrl`. This lets us exercise
   * the glob/array logic without an actual `git clone`.
   */
  function setup(
    sourceUrl: string,
    skills: string[],
    nonSkills: string[] = [],
    ref?: string,
    existingTmpDir?: string,
  ): { tmpDir: string } {
    const tmpDir =
      existingTmpDir ?? mkdtempSync(join(tmpdir(), "expand-test-"));
    const cloneDir = join(tmpDir, `skill-${skillCloneKey(sourceUrl, ref)}`);
    mkdirSync(cloneDir, { recursive: true });
    execSync("git init", { cwd: cloneDir, stdio: "pipe" });
    execSync('git config user.email "test@test.com"', {
      cwd: cloneDir,
      stdio: "pipe",
    });
    execSync('git config user.name "Test"', {
      cwd: cloneDir,
      stdio: "pipe",
    });

    for (const skill of skills) {
      const skillDir = join(cloneDir, skill);
      mkdirSync(skillDir, { recursive: true });
      writeFileSync(
        join(skillDir, "SKILL.md"),
        `---\nname: ${skill.split("/").pop()}\n---\nContent`,
      );
    }
    for (const ns of nonSkills) {
      const nsDir = join(cloneDir, ns);
      mkdirSync(nsDir, { recursive: true });
      writeFileSync(join(nsDir, "README.md"), "Not a skill");
    }

    execSync("git add -A && git commit -m init", {
      cwd: cloneDir,
      stdio: "pipe",
    });
    return { tmpDir };
  }

  function makeEntry(
    sourceUrl: string,
    path: string | string[] | undefined,
    skillId = "io.example",
    ref?: string,
  ): SkillEntry {
    const source: SkillEntry["source"] = { url: sourceUrl, path };
    if (ref !== undefined) source.ref = ref;
    return {
      skillId,
      name: "",
      description: "",
      source,
      contentHash: "",
      approvals: [],
    };
  }

  it("expands a single glob in an array", () => {
    const url = "https://example.test/single-glob.git";
    const { tmpDir } = setup(url, ["skills/alpha", "skills/beta"]);
    try {
      const result = expandSkillEntry(makeEntry(url, ["skills/*"]), tmpDir);
      assert.deepEqual(
        result.map((e) => e.skillId),
        ["io.example/alpha", "io.example/beta"],
      );
      assert.deepEqual(
        result.map((e) => e.source.path),
        ["skills/alpha", "skills/beta"],
      );
    } finally {
      rmSync(tmpDir, { recursive: true });
    }
  });

  it("expands multiple globs in an array", () => {
    const url = "https://example.test/multi-glob.git";
    const { tmpDir } = setup(url, [
      "engineering/a",
      "engineering/b",
      "productivity/c",
      "productivity/d",
    ]);
    try {
      const result = expandSkillEntry(
        makeEntry(url, ["engineering/*", "productivity/*"]),
        tmpDir,
      );
      assert.deepEqual(
        result.map((e) => e.skillId),
        ["io.example/a", "io.example/b", "io.example/c", "io.example/d"],
      );
    } finally {
      rmSync(tmpDir, { recursive: true });
    }
  });

  it("mixes globs and literal paths in an array", () => {
    const url = "https://example.test/mixed.git";
    const { tmpDir } = setup(url, [
      "engineering/a",
      "engineering/b",
      "productivity/keep",
      "productivity/skip",
    ]);
    try {
      const result = expandSkillEntry(
        makeEntry(url, ["engineering/*", "productivity/keep"]),
        tmpDir,
      );
      assert.deepEqual(
        result.map((e) => e.skillId),
        ["io.example/a", "io.example/b", "io.example/keep"],
      );
      assert.deepEqual(
        result.map((e) => e.source.path),
        ["engineering/a", "engineering/b", "productivity/keep"],
      );
    } finally {
      rmSync(tmpDir, { recursive: true });
    }
  });

  it("deduplicates when a glob result overlaps with a literal path", () => {
    const url = "https://example.test/dedup.git";
    const { tmpDir } = setup(url, ["skills/alpha", "skills/beta"]);
    try {
      const result = expandSkillEntry(
        makeEntry(url, ["skills/*", "skills/alpha"]),
        tmpDir,
      );
      assert.deepEqual(
        result.map((e) => e.skillId),
        ["io.example/alpha", "io.example/beta"],
      );
    } finally {
      rmSync(tmpDir, { recursive: true });
    }
  });

  it("continues when one glob in an array matches nothing", () => {
    const url = "https://example.test/partial-match.git";
    const { tmpDir } = setup(url, ["engineering/a"]);
    try {
      const result = expandSkillEntry(
        makeEntry(url, ["engineering/*", "productivity/*"]),
        tmpDir,
      );
      assert.deepEqual(
        result.map((e) => e.skillId),
        ["io.example/a"],
      );
    } finally {
      rmSync(tmpDir, { recursive: true });
    }
  });

  it("does not require a clone when the array has no globs", () => {
    const url = "https://example.test/no-glob.git";
    // No setup() call — the clone dir does not exist. Since there are no
    // globs, expandSkillEntry must not attempt to clone.
    const tmpDir = mkdtempSync(join(tmpdir(), "expand-noglob-"));
    try {
      const result = expandSkillEntry(
        makeEntry(url, ["skills/foo", "skills/bar"]),
        tmpDir,
      );
      assert.deepEqual(
        result.map((e) => e.skillId),
        ["io.example/foo", "io.example/bar"],
      );
    } finally {
      rmSync(tmpDir, { recursive: true });
    }
  });

  it("returns the entry unchanged when path is a literal string", () => {
    const entry = makeEntry(
      "https://example.test/literal.git",
      "skills/foo",
      "io.example/foo",
    );
    const tmpDir = mkdtempSync(join(tmpdir(), "expand-literal-"));
    try {
      const result = expandSkillEntry(entry, tmpDir);
      assert.equal(result.length, 1);
      assert.equal(result[0].skillId, "io.example/foo");
      assert.equal(result[0].source.path, "skills/foo");
    } finally {
      rmSync(tmpDir, { recursive: true });
    }
  });

  it("preserves source.ref on every entry a glob expands into", () => {
    const url = "https://example.test/ref-preserved.git";
    const { tmpDir } = setup(
      url,
      ["skills/alpha", "skills/beta"],
      [],
      "v1.0.0",
    );
    try {
      const result = expandSkillEntry(
        makeEntry(url, "skills/*", "io.example", "v1.0.0"),
        tmpDir,
      );
      assert.deepEqual(
        result.map((e) => e.source.ref),
        ["v1.0.0", "v1.0.0"],
      );
    } finally {
      rmSync(tmpDir, { recursive: true });
    }
  });

  it("expands a glob against the pinned ref, not the default branch", () => {
    const url = "https://example.test/ref-glob.git";
    // Two distinct pre-populated clones, keyed by skillCloneKey: one at no
    // ref (the "default branch" clone) with one set of skill folders, one
    // at "v2.0.0" with a different set — proving expandSkillEntry discovers
    // against the ref-specific clone, not whichever one happens to exist.
    const { tmpDir } = setup(url, ["skills/on-default"]);
    setup(url, ["skills/on-v2"], [], "v2.0.0", tmpDir);
    try {
      const result = expandSkillEntry(
        makeEntry(url, "skills/*", "io.example", "v2.0.0"),
        tmpDir,
      );
      assert.deepEqual(
        result.map((e) => e.source.path),
        ["skills/on-v2"],
      );
    } finally {
      rmSync(tmpDir, { recursive: true });
    }
  });
});

// --- skillCloneKey ---

describe("skillCloneKey", () => {
  it("produces different keys for different refs of the same repo", () => {
    const a = skillCloneKey("https://example.test/repo.git", "v1.0.0");
    const b = skillCloneKey("https://example.test/repo.git", "v2.0.0");
    assert.notEqual(a, b);
  });

  it("produces different keys for different repos with the same ref", () => {
    const a = skillCloneKey("https://example.test/repo-a.git", "v1.0.0");
    const b = skillCloneKey("https://example.test/repo-b.git", "v1.0.0");
    assert.notEqual(a, b);
  });

  it("produces the same key when ref is omitted vs explicitly undefined", () => {
    const a = skillCloneKey("https://example.test/repo.git");
    const b = skillCloneKey("https://example.test/repo.git", undefined);
    assert.equal(a, b);
  });
});

// --- fetchSkillMetadata with ref ---

describe("fetchSkillMetadata with ref", () => {
  function initSourceRepo(sourceDir: string): void {
    execSync("git init -b main", { cwd: sourceDir, stdio: "pipe" });
    execSync('git config user.email "test@test.com"', {
      cwd: sourceDir,
      stdio: "pipe",
    });
    execSync('git config user.name "Test"', {
      cwd: sourceDir,
      stdio: "pipe",
    });
  }

  it("checks out the pinned ref instead of the default branch", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "skill-ref-test-"));
    const sourceDir = mkdtempSync(join(tmpdir(), "skill-ref-src-"));
    try {
      initSourceRepo(sourceDir);

      writeFileSync(
        join(sourceDir, "SKILL.md"),
        "---\nname: on-main\ndescription: On main.\n---\n",
      );
      execSync("git add -A && git commit -m main", {
        cwd: sourceDir,
        stdio: "pipe",
      });

      execSync("git checkout -b v1.0.0", { cwd: sourceDir, stdio: "pipe" });
      writeFileSync(
        join(sourceDir, "SKILL.md"),
        "---\nname: on-v1\ndescription: On v1.\n---\n",
      );
      execSync("git add -A && git commit -m v1", {
        cwd: sourceDir,
        stdio: "pipe",
      });
      execSync("git checkout main", { cwd: sourceDir, stdio: "pipe" });

      const metadata = fetchSkillMetadata(
        `file://${sourceDir}`,
        undefined,
        tmpDir,
        "v1.0.0",
      );
      assert.equal(metadata.name, "on-v1");
      assert.equal(metadata.description, "On v1.");
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
      rmSync(sourceDir, { recursive: true, force: true });
    }
  });

  it("checks out a full commit SHA", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "skill-sha-test-"));
    const sourceDir = mkdtempSync(join(tmpdir(), "skill-sha-src-"));
    try {
      initSourceRepo(sourceDir);

      writeFileSync(
        join(sourceDir, "SKILL.md"),
        "---\nname: pinned-commit\ndescription: Pinned.\n---\n",
      );
      execSync("git add -A && git commit -m pinned", {
        cwd: sourceDir,
        stdio: "pipe",
      });
      const sha = execSync("git rev-parse HEAD", {
        cwd: sourceDir,
        stdio: "pipe",
      })
        .toString()
        .trim();

      writeFileSync(
        join(sourceDir, "SKILL.md"),
        "---\nname: on-main\ndescription: On main.\n---\n",
      );
      execSync("git add -A && git commit -m main", {
        cwd: sourceDir,
        stdio: "pipe",
      });

      const metadata = fetchSkillMetadata(
        `file://${sourceDir}`,
        undefined,
        tmpDir,
        sha,
      );
      assert.equal(metadata.name, "pinned-commit");
      assert.equal(metadata.description, "Pinned.");
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
      rmSync(sourceDir, { recursive: true, force: true });
    }
  });

  it("two refs of the same repo get independent clones", () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "skill-ref-cache-test-"));
    const sourceDir = mkdtempSync(join(tmpdir(), "skill-ref-cache-src-"));
    try {
      initSourceRepo(sourceDir);

      writeFileSync(
        join(sourceDir, "SKILL.md"),
        "---\nname: on-main\ndescription: On main.\n---\n",
      );
      execSync("git add -A && git commit -m main", {
        cwd: sourceDir,
        stdio: "pipe",
      });

      execSync("git checkout -b v1.0.0", { cwd: sourceDir, stdio: "pipe" });
      writeFileSync(
        join(sourceDir, "SKILL.md"),
        "---\nname: on-v1\ndescription: On v1.\n---\n",
      );
      execSync("git add -A && git commit -m v1", {
        cwd: sourceDir,
        stdio: "pipe",
      });
      execSync("git checkout main", { cwd: sourceDir, stdio: "pipe" });

      const url = `file://${sourceDir}`;
      const onMain = fetchSkillMetadata(url, undefined, tmpDir, undefined);
      const onV1 = fetchSkillMetadata(url, undefined, tmpDir, "v1.0.0");
      assert.equal(onMain.name, "on-main");
      assert.equal(onV1.name, "on-v1");
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
      rmSync(sourceDir, { recursive: true, force: true });
    }
  });
});
