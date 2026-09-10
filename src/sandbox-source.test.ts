import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  parseSandboxSpec,
  discoverSandboxExtensions,
  fetchSandboxExtensionMetadata,
  sandboxCloneKey,
  KIND_DIRS,
  type DiscoveredExtension,
} from "./sandbox-source.js";

// --- parseSandboxSpec ---

describe("parseSandboxSpec", () => {
  it("reads the fields consolidation publishes", () => {
    const spec = parseSandboxSpec(
      `schemaVersion: "1"
kind: sandbox
name: dsh
displayName: DeepSeek Harness
description: "Experimental: DeepSeek Harness (dsh) agent"
sandbox:
  configDir: .dsh
`,
      "spec.yaml",
    );
    assert.deepEqual(spec, {
      name: "dsh",
      displayName: "DeepSeek Harness",
      description: "Experimental: DeepSeek Harness (dsh) agent",
      kind: "sandbox",
    });
  });

  it("reads a mixin", () => {
    const spec = parseSandboxSpec(
      "kind: mixin\nname: github-cli\n",
      "spec.yaml",
    );
    assert.equal(spec.kind, "mixin");
    assert.equal(spec.name, "github-cli");
  });

  it("parses spec.json as JSON", () => {
    const spec = parseSandboxSpec(
      '{"kind":"mixin","name":"playwright","description":"Browser automation"}',
      "spec.json",
    );
    assert.equal(spec.kind, "mixin");
    assert.equal(spec.name, "playwright");
    assert.equal(spec.description, "Browser automation");
  });

  it("leaves displayName undefined rather than empty when absent", () => {
    const spec = parseSandboxSpec("kind: sandbox\nname: dsh\n", "spec.yaml");
    assert.equal(spec.displayName, undefined);
  });

  // An unrecognised kind must not fall through to the kind its directory
  // implies — that would publish an entry whose install verb the spec never
  // agreed to.
  it("rejects an unknown kind rather than guessing", () => {
    const spec = parseSandboxSpec("kind: plugin\nname: foo\n", "spec.yaml");
    assert.equal(spec.kind, undefined);
  });

  it("treats non-string scalars as absent", () => {
    const spec = parseSandboxSpec("kind: sandbox\nname: 42\n", "spec.yaml");
    assert.equal(spec.name, "");
  });

  it("returns empty fields for a document that isn't a mapping", () => {
    const spec = parseSandboxSpec("- one\n- two\n", "spec.yaml");
    assert.deepEqual(spec, {
      name: "",
      displayName: undefined,
      description: "",
      kind: undefined,
    });
  });

  it("throws on malformed YAML so the caller can skip the extension", () => {
    assert.throws(() => parseSandboxSpec("kind: [unclosed\n", "spec.yaml"));
  });
});

// --- sandboxCloneKey ---

describe("sandboxCloneKey", () => {
  it("separates the same repository at two refs", () => {
    const url = "https://github.com/acme/kits.git";
    assert.notEqual(sandboxCloneKey(url), sandboxCloneKey(url, "v1.2.0"));
    assert.notEqual(
      sandboxCloneKey(url, "main"),
      sandboxCloneKey(url, "v1.2.0"),
    );
  });

  it("is stable for the same inputs", () => {
    assert.equal(
      sandboxCloneKey("https://github.com/acme/kits.git", "v1"),
      sandboxCloneKey("https://github.com/acme/kits.git", "v1"),
    );
  });
});

// --- test repository helper ---

interface RepoExtension {
  path: string;
  spec?: string;
  specFile?: string;
  extraFiles?: Record<string, string>;
}

function makeKitRepo(extensions: RepoExtension[]): string {
  const dir = mkdtempSync(join(tmpdir(), "sandbox-test-"));
  execSync("git init", { cwd: dir, stdio: "pipe" });
  execSync('git config user.email "test@test.com"', {
    cwd: dir,
    stdio: "pipe",
  });
  execSync('git config user.name "Test"', { cwd: dir, stdio: "pipe" });

  for (const extension of extensions) {
    const extensionDir = join(dir, extension.path);
    mkdirSync(extensionDir, { recursive: true });
    if (extension.spec !== undefined) {
      writeFileSync(
        join(extensionDir, extension.specFile ?? "spec.yaml"),
        extension.spec,
      );
    }
    for (const [name, content] of Object.entries(extension.extraFiles ?? {})) {
      writeFileSync(join(extensionDir, name), content);
    }
  }

  execSync("git add -A && git commit -m init", { cwd: dir, stdio: "pipe" });
  return dir;
}

function spec(kind: string, name: string, extra = ""): string {
  return `schemaVersion: "1"\nkind: ${kind}\nname: ${name}\n${extra}`;
}

// --- discoverSandboxExtensions ---

describe("discoverSandboxExtensions", () => {
  it("finds extensions under both prefixes and fixes the kind from the prefix", () => {
    const dir = makeKitRepo([
      { path: "tools/openclaw", spec: spec("sandbox", "openclaw") },
      { path: "features/github-cli", spec: spec("mixin", "github-cli") },
    ]);
    try {
      const { discovered, warnings } = discoverSandboxExtensions(dir);
      assert.deepEqual(
        discovered.map((d) => [d.path, d.kind, d.specFile]),
        [
          ["features/github-cli", "mixin", "spec.yaml"],
          ["tools/openclaw", "sandbox", "spec.yaml"],
        ],
      );
      assert.deepEqual(warnings, []);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("accepts spec.json as well as spec.yaml", () => {
    const dir = makeKitRepo([
      {
        path: "tools/dsh",
        specFile: "spec.json",
        spec: '{"kind":"sandbox","name":"dsh"}',
      },
    ]);
    try {
      const { discovered } = discoverSandboxExtensions(dir);
      assert.deepEqual(
        discovered.map((d) => d.specFile),
        ["spec.json"],
      );
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("ignores directories with no spec document", () => {
    const dir = makeKitRepo([
      { path: "tools/openclaw", spec: spec("sandbox", "openclaw") },
      { path: "tools/docs", extraFiles: { "README.md": "not an extension" } },
    ]);
    try {
      const { discovered } = discoverSandboxExtensions(dir);
      assert.deepEqual(
        discovered.map((d) => d.path),
        ["tools/openclaw"],
      );
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("skips hidden directories", () => {
    const dir = makeKitRepo([
      { path: "tools/visible", spec: spec("sandbox", "visible") },
      { path: "tools/.staging", spec: spec("sandbox", ".staging") },
    ]);
    try {
      const { discovered } = discoverSandboxExtensions(dir);
      assert.deepEqual(
        discovered.map((d) => d.path),
        ["tools/visible"],
      );
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("returns nothing for a repository laid out some other way", () => {
    const dir = makeKitRepo([
      { path: "extensions/openclaw", spec: spec("sandbox", "openclaw") },
    ]);
    try {
      const { discovered } = discoverSandboxExtensions(dir);
      assert.deepEqual(discovered, []);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  // A spec outside the two published prefixes is still visible to
  // `enclave add`, where two extensions sharing a name is a hard error — so
  // the published --name command can fail on a repository we published
  // nothing wrong from.
  it("warns about spec documents outside the published prefixes", () => {
    const dir = makeKitRepo([
      { path: "tools/openclaw", spec: spec("sandbox", "openclaw") },
      { path: "experimental/openclaw", spec: spec("sandbox", "openclaw") },
    ]);
    try {
      const { discovered, warnings } = discoverSandboxExtensions(dir);
      assert.deepEqual(
        discovered.map((d) => d.path),
        ["tools/openclaw"],
      );
      assert.equal(warnings.length, 1);
      assert.match(warnings[0], /experimental\/openclaw\/spec\.yaml/);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("does not warn when every spec sits under a published prefix", () => {
    const dir = makeKitRepo([
      { path: "tools/openclaw", spec: spec("sandbox", "openclaw") },
      { path: "features/github-cli", spec: spec("mixin", "github-cli") },
    ]);
    try {
      assert.deepEqual(discoverSandboxExtensions(dir).warnings, []);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("maps the two prefixes to the two kinds", () => {
    assert.deepEqual(KIND_DIRS, { tools: "sandbox", features: "mixin" });
  });
});

// --- fetchSandboxExtensionMetadata ---

describe("fetchSandboxExtensionMetadata", () => {
  function discovered(
    path: string,
    kind: "sandbox" | "mixin",
    specFile = "spec.yaml",
  ): DiscoveredExtension {
    return { path, kind, specFile };
  }

  it("publishes displayName as the title and the spec name as the identity", () => {
    const dir = makeKitRepo([
      {
        path: "tools/dsh",
        spec: spec(
          "sandbox",
          "dsh",
          "displayName: DeepSeek Harness\ndescription: An agent\n",
        ),
      },
    ]);
    try {
      const metadata = fetchSandboxExtensionMetadata(
        dir,
        discovered("tools/dsh", "sandbox"),
      );
      assert.equal(metadata.name, "DeepSeek Harness");
      assert.equal(metadata.extensionName, "dsh");
      assert.equal(metadata.description, "An agent");
      assert.equal(metadata.kind, "sandbox");
      assert.match(metadata.contentHash, /^[0-9a-f]{12}$/);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("falls back to the spec name when there is no displayName", () => {
    const dir = makeKitRepo([
      { path: "features/gh", spec: spec("mixin", "gh") },
    ]);
    try {
      const metadata = fetchSandboxExtensionMetadata(
        dir,
        discovered("features/gh", "mixin"),
      );
      assert.equal(metadata.name, "gh");
      assert.equal(metadata.extensionName, "gh");
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("hashes the extension directory, not the repository", () => {
    const dir = makeKitRepo([
      {
        path: "tools/a",
        spec: spec("sandbox", "a"),
        extraFiles: { "install.sh": "echo one" },
      },
      {
        path: "tools/b",
        spec: spec("sandbox", "b"),
        extraFiles: { "install.sh": "echo two" },
      },
    ]);
    try {
      const a = fetchSandboxExtensionMetadata(
        dir,
        discovered("tools/a", "sandbox"),
      );
      const b = fetchSandboxExtensionMetadata(
        dir,
        discovered("tools/b", "sandbox"),
      );
      assert.notEqual(a.contentHash, b.contentHash);
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("rejects a kind that contradicts its directory", () => {
    const dir = makeKitRepo([{ path: "tools/gh", spec: spec("mixin", "gh") }]);
    try {
      assert.throws(
        () =>
          fetchSandboxExtensionMetadata(dir, discovered("tools/gh", "sandbox")),
        /declares kind "mixin" but sits under a "sandbox" directory/,
      );
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("rejects an unknown kind", () => {
    const dir = makeKitRepo([{ path: "tools/gh", spec: spec("plugin", "gh") }]);
    try {
      assert.throws(
        () =>
          fetchSandboxExtensionMetadata(dir, discovered("tools/gh", "sandbox")),
        /declares no valid kind/,
      );
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  // Enclave's own rule, and the reason the last path segment is usable as the
  // `--name` argument the published command carries.
  it("rejects a spec name that disagrees with its directory", () => {
    const dir = makeKitRepo([
      { path: "tools/openclaw", spec: spec("sandbox", "claw") },
    ]);
    try {
      assert.throws(
        () =>
          fetchSandboxExtensionMetadata(
            dir,
            discovered("tools/openclaw", "sandbox"),
          ),
        /declares name "claw" but sits in directory "openclaw"/,
      );
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("reports a malformed spec rather than throwing a parser error", () => {
    const dir = makeKitRepo([{ path: "tools/gh", spec: "kind: [unclosed\n" }]);
    try {
      assert.throws(
        () =>
          fetchSandboxExtensionMetadata(dir, discovered("tools/gh", "sandbox")),
        /could not parse tools\/gh\/spec\.yaml/,
      );
    } finally {
      rmSync(dir, { recursive: true });
    }
  });

  it("refuses a path escaping the cloned repository", () => {
    const dir = makeKitRepo([
      { path: "tools/gh", spec: spec("sandbox", "gh") },
    ]);
    try {
      assert.throws(
        () =>
          fetchSandboxExtensionMetadata(
            dir,
            discovered("tools/../../elsewhere", "sandbox"),
          ),
        /escapes the cloned repository|Failed to check out/,
      );
    } finally {
      rmSync(dir, { recursive: true });
    }
  });
});
