import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run, type Deps } from "./run.js";
import type { Skill } from "./types.js";

const GENERATED_AT = "2026-10-25T06:20:00.490Z";

const CODE_REVIEW: Skill = {
  skillId: "io.github.anthropics/code-review",
  name: "code-review",
  description: "Reviews code",
  source: {
    url: "https://github.com/anthropics/skills.git",
    path: "skills/code-review",
    commit: "7b4a44e40e0112233445566778899aabbccddeef",
  },
  contentHash: "49b0db08bdaa",
  latestHash: "49b0db08bdaa",
  approvals: [{ organizationId: "anthropic", date: "2026-01-02" }],
};

// A local registry, laid out like the dist/api/v1/ consolidation writes.
function writeRegistry(dir: string, skills: Skill[]): void {
  writeFileSync(
    join(dir, "skills.json"),
    JSON.stringify({ generatedAt: GENERATED_AT, skills }),
  );
  writeFileSync(
    join(dir, "organizations.json"),
    JSON.stringify({
      generatedAt: GENERATED_AT,
      organizations: [{ id: "anthropic", name: "Anthropic" }],
    }),
  );
}

interface Fake {
  deps: Deps;
  stderr: string[];
  installs: string[][];
  questions: string[];
}

function fake(overrides: Partial<Deps> = {}, exitCode = 0): Fake {
  const stderr: string[] = [];
  const installs: string[][] = [];
  const questions: string[] = [];
  return {
    stderr,
    installs,
    questions,
    deps: {
      env: {},
      isTTY: false,
      printErr: (line) => stderr.push(line),
      confirm: async (question) => {
        questions.push(question);
        return true;
      },
      runSkills: async (args) => {
        installs.push(args);
        return exitCode;
      },
      ...overrides,
    },
  };
}

describe("run install skill", () => {
  let registry: string;
  beforeEach(() => {
    registry = mkdtempSync(join(tmpdir(), "ai-registry-cli-"));
    writeRegistry(registry, [CODE_REVIEW]);
  });
  afterEach(() => rmSync(registry, { recursive: true, force: true }));

  it("prints who approved a known skill, then installs it through the skills CLI", async () => {
    const f = fake();
    const code = await run(
      [
        "install",
        "skill",
        CODE_REVIEW.skillId,
        "--registry",
        registry,
        "--yes",
      ],
      f.deps,
    );
    assert.equal(code, 0);
    assert.deepEqual(f.installs, [
      ["add", "anthropics/skills", "--skill", "code-review", "-y"],
    ]);
    const out = f.stderr.join("\n");
    assert.match(out, /Approved by: +Anthropic, 2026-01-02/);
    assert.match(out, /Content hash: +49b0db08bdaa/);
    assert.match(out, /skills add anthropics\/skills --skill code-review -y/);
  });

  it("fails on an id the registry doesn't hold, without running the installer", async () => {
    const f = fake();
    const code = await run(
      [
        "install",
        "skill",
        "io.github.nobody/nothing",
        "--registry",
        registry,
        "--yes",
      ],
      f.deps,
    );
    assert.equal(code, 1);
    assert.deepEqual(f.installs, []);
    assert.match(
      f.stderr.join("\n"),
      /No skill with id io\.github\.nobody\/nothing in the registry at /,
    );
  });

  describe("confirmation", () => {
    const install = ["install", "skill", CODE_REVIEW.skillId];

    // An agent can't answer a prompt, so waiting for one would hang it.
    it("fails fast without a terminal to ask on, pointing at --yes", async () => {
      const f = fake({ isTTY: false });
      const code = await run([...install, "--registry", registry], f.deps);
      assert.equal(code, 1);
      assert.deepEqual(f.installs, []);
      assert.deepEqual(f.questions, []);
      assert.match(f.stderr.join("\n"), /--yes/);
    });

    it("installs nothing when the user declines", async () => {
      const f = fake({ isTTY: true, confirm: async () => false });
      const code = await run([...install, "--registry", registry], f.deps);
      assert.equal(code, 1);
      assert.deepEqual(f.installs, []);
    });

    it("asks once, then leaves the installer free to ask its own questions", async () => {
      const f = fake({ isTTY: true });
      const code = await run([...install, "--registry", registry], f.deps);
      assert.equal(code, 0);
      assert.equal(f.questions.length, 1);
      assert.deepEqual(f.installs, [
        ["add", "anthropics/skills", "--skill", "code-review"],
      ]);
    });
  });

  it("refuses an approved target the installer can't reach, rather than install the default branch", async () => {
    writeRegistry(registry, [
      {
        ...CODE_REVIEW,
        source: {
          url: "https://git.example.org/team/kit.git",
          path: "skills/code-review",
          ref: "v1.0.0",
          pinned: true,
        },
      },
    ]);
    const f = fake();
    const code = await run(
      [
        "install",
        "skill",
        CODE_REVIEW.skillId,
        "--registry",
        registry,
        "--yes",
      ],
      f.deps,
    );
    assert.equal(code, 1);
    assert.deepEqual(f.installs, []);
    assert.match(f.stderr.join("\n"), /can't install v1\.0\.0/);
  });

  it("exits with the installer's exit code", async () => {
    const f = fake({}, 7);
    const code = await run(
      [
        "install",
        "skill",
        CODE_REVIEW.skillId,
        "--registry",
        registry,
        "--yes",
      ],
      f.deps,
    );
    assert.equal(code, 7);
  });

  describe("registry", () => {
    const install = ["install", "skill", CODE_REVIEW.skillId, "--yes"];

    it("reads the registry from AI_REGISTRY_URL", async () => {
      const f = fake({ env: { AI_REGISTRY_URL: registry } });
      assert.equal(await run(install, f.deps), 0);
      assert.equal(f.installs.length, 1);
    });

    it("prefers --registry over AI_REGISTRY_URL", async () => {
      const f = fake({ env: { AI_REGISTRY_URL: join(registry, "missing") } });
      assert.equal(await run([...install, "--registry", registry], f.deps), 0);
      assert.equal(f.installs.length, 1);
    });

    it("fails naming the file it couldn't read", async () => {
      const missing = join(registry, "missing");
      const f = fake();
      assert.equal(await run([...install, "--registry", missing], f.deps), 1);
      assert.deepEqual(f.installs, []);
      assert.ok(
        f.stderr.some((line) =>
          line.includes(`Could not read ${join(missing, "skills.json")}`),
        ),
      );
    });
  });
});

describe("run usage", () => {
  for (const argv of [
    [],
    ["install"],
    ["install", "skill"],
    ["install", "plugin", "some/id"],
    ["install", "skill", "some/id", "--bogus"],
    ["install", "skill", "some/id", "extra"],
  ]) {
    it(`fails with usage for: ${argv.join(" ") || "(nothing)"}`, async () => {
      const f = fake();
      assert.equal(await run(argv, f.deps), 1);
      assert.deepEqual(f.installs, []);
      assert.match(
        f.stderr.join("\n"),
        /Usage: ai-registry install skill <id>/,
      );
    });
  }

  it("prints usage on --help and succeeds", async () => {
    const f = fake();
    assert.equal(await run(["--help"], f.deps), 0);
    assert.match(f.stderr.join("\n"), /Usage: ai-registry install skill <id>/);
  });
});
