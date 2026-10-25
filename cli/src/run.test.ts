import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run, type Deps } from "./run.js";
import type { Plugin, Skill } from "./types.js";

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
function writeRegistry(
  dir: string,
  skills: Skill[],
  plugins: Plugin[] = [],
): void {
  writeFileSync(
    join(dir, "skills.json"),
    JSON.stringify({ generatedAt: GENERATED_AT, skills }),
  );
  writeFileSync(
    join(dir, "plugins.json"),
    JSON.stringify({ generatedAt: GENERATED_AT, plugins }),
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
      runInstaller: async (installer, args) => {
        installs.push([installer, ...args]);
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
      ["skills", "add", "anthropics/skills", "--skill", "code-review", "-y"],
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
        ["skills", "add", "anthropics/skills", "--skill", "code-review"],
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

    // Organization names are display only, so their absence costs only the
    // names: approvals then show the organization ids.
    it("installs without organizations.json, naming approvers by id", async () => {
      rmSync(join(registry, "organizations.json"));
      const f = fake();
      assert.equal(await run([...install, "--registry", registry], f.deps), 0);
      assert.equal(f.installs.length, 1);
      assert.match(f.stderr.join("\n"), /Approved by: +anthropic, 2026-01-02/);
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

const COMMIT = "7b4a44e40e0112233445566778899aabbccddeef";

const KIT: Plugin = {
  pluginId: "io.github.acme/kit",
  name: "kit",
  description: "A kit",
  source: { url: "https://github.com/acme/kit.git", commit: COMMIT },
  contentHash: "aa11bb22cc33",
  latestHash: "aa11bb22cc33",
  containedSkills: [
    { name: "lint", description: "Lints", path: "skills/lint" },
  ],
  containedMcpServers: [{ name: "kit-server", transport: "stdio" }],
  approvals: [
    {
      organizationId: "anthropic",
      date: "2026-01-02",
      sourcedFrom: {
        marketplaceUrl: "https://github.com/acme/market",
        format: "claude",
      },
    },
  ],
};

describe("run install plugin", () => {
  let registry: string;
  const install = (plugin: Plugin, ...flags: string[]) => [
    "install",
    "plugin",
    plugin.pluginId,
    "--registry",
    registry,
    ...flags,
  ];
  const withRegistry = (plugins: Plugin[]) =>
    writeRegistry(registry, [CODE_REVIEW], plugins);
  beforeEach(() => {
    registry = mkdtempSync(join(tmpdir(), "ai-registry-cli-"));
    withRegistry([KIT]);
  });
  afterEach(() => rmSync(registry, { recursive: true, force: true }));

  it("lists approvals, provenance and contents, then installs through the plugins CLI", async () => {
    const f = fake();
    const code = await run(
      install(KIT, "--yes", "--target", "claude-code", "--scope", "project"),
      f.deps,
    );
    assert.equal(code, 0);
    assert.deepEqual(f.installs, [
      [
        "plugins",
        "add",
        "acme/kit",
        "--target",
        "claude-code",
        "--scope",
        "project",
        "-y",
      ],
    ]);
    const out = f.stderr.join("\n");
    assert.match(
      out,
      /Approved by: +Anthropic, 2026-01-02, through the marketplace at https:\/\/github\.com\/acme\/market/,
    );
    assert.match(out, /Skills: +lint/);
    assert.match(out, /MCP servers: +kit-server \(stdio\)/);
    assert.match(
      out,
      /Command: +plugins add acme\/kit --target claude-code --scope project -y/,
    );
  });

  it("fails on an id the registry doesn't hold, without running the installer", async () => {
    const f = fake();
    const code = await run(
      [
        "install",
        "plugin",
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
      /No plugin with id io\.github\.nobody\/nothing in the registry at /,
    );
  });

  // Ids are only unique within a type.
  it("doesn't find a skill id among plugins", async () => {
    const f = fake();
    const code = await run(
      [
        "install",
        "plugin",
        CODE_REVIEW.skillId,
        "--registry",
        registry,
        "--yes",
      ],
      f.deps,
    );
    assert.equal(code, 1);
    assert.deepEqual(f.installs, []);
  });

  it("refuses a plugin whose approval names a ref, printing how to install it by hand", async () => {
    const pinned: Plugin = {
      ...KIT,
      source: {
        ...KIT.source,
        path: "plugins/kit",
        ref: "v1.0.0",
        pinned: true,
      },
    };
    withRegistry([pinned]);
    const f = fake();
    const code = await run(install(pinned, "--yes"), f.deps);
    assert.equal(code, 1);
    assert.deepEqual(f.installs, []);
    const out = f.stderr.join("\n");
    assert.match(out, /can't install v1\.0\.0/);
    assert.match(out, /git clone https:\/\/github\.com\/acme\/kit kit/);
    assert.match(out, new RegExp(`git -C kit checkout ${COMMIT}`));
    assert.match(out, /npx plugins@1\.3\.5 add \.\/kit\/plugins\/kit/);
  });

  describe("a plugin in a subdirectory, which may have unapproved neighbours", () => {
    const nested: Plugin = {
      ...KIT,
      source: { ...KIT.source, path: "plugins/kit" },
    };
    beforeEach(() => withRegistry([nested]));

    // Without a terminal the plugins CLI installs every plugin it discovers.
    it("refuses without a terminal, even with --yes", async () => {
      const f = fake({ isTTY: false });
      const code = await run(install(nested, "--yes"), f.deps);
      assert.equal(code, 1);
      assert.deepEqual(f.installs, []);
      assert.match(f.stderr.join("\n"), /every plugin/);
    });

    it("on a terminal, leaves the choice to the installer's picker and says what to keep", async () => {
      const f = fake({ isTTY: true });
      const code = await run(install(nested, "--yes"), f.deps);
      assert.equal(code, 0);
      assert.deepEqual(f.questions, []);
      assert.deepEqual(f.installs, [["plugins", "add", "acme/kit"]]);
      assert.match(f.stderr.join("\n"), /keep only kit selected/);
    });
  });

  it("asks before installing without --yes", async () => {
    const f = fake({ isTTY: true });
    assert.equal(await run(install(KIT), f.deps), 0);
    assert.equal(f.questions.length, 1);
    assert.deepEqual(f.installs, [["plugins", "add", "acme/kit"]]);
  });
});

describe("run usage", () => {
  for (const argv of [
    [],
    ["install"],
    ["install", "skill"],
    ["install", "agent", "some/id"],
    ["install", "skill", "some/id", "--target", "claude-code"],
    ["install", "plugin", "some/id", "--agent", "claude-code"],
    ["install", "plugin", "some/id", "--scope", "everywhere"],
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
