import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { enclaveCommand } from "./enclaveCommand";
import type { SandboxExtension } from "./types";

function extension(over: Partial<SandboxExtension> = {}): SandboxExtension {
  return {
    sandboxExtensionId:
      "io.github.eclipse-enclave/enclave-extensions/tools/openclaw",
    kind: "sandbox",
    name: "OpenClaw",
    extensionName: "openclaw",
    description: "",
    source: {
      url: "https://github.com/eclipse-enclave/enclave-extensions.git",
      path: "tools/openclaw",
    },
    contentHash: "645c8a89f1a6",
    approvals: [],
    ...over,
  };
}

describe("enclaveCommand", () => {
  // The verb carries the kind: `tools add` looks only for kind: sandbox,
  // `features add` only for kind: mixin. There is no --type argument.
  it("uses the tools verb for a tool extension", () => {
    assert.equal(
      enclaveCommand(extension()),
      "enclave tools add eclipse-enclave/enclave-extensions --name openclaw",
    );
  });

  it("uses the features verb for a feature extension", () => {
    assert.equal(
      enclaveCommand(
        extension({
          kind: "mixin",
          extensionName: "github-cli",
          source: {
            url: "https://github.com/acme/kits.git",
            path: "features/github-cli",
          },
        }),
      ),
      "enclave features add acme/kits --name github-cli",
    );
  });

  // A published pin the copy-paste command discarded would be worse than no
  // pin: the page would show a release and install a branch.
  it("passes through an approved ref", () => {
    assert.equal(
      enclaveCommand(
        extension({
          source: {
            url: "https://github.com/acme/kits.git",
            path: "tools/openclaw",
            ref: "v1.2.0",
          },
        }),
      ),
      "enclave tools add acme/kits --name openclaw --ref v1.2.0",
    );
  });

  it("names the extension by its spec name, not its display title", () => {
    const command = enclaveCommand(
      extension({ name: "DeepSeek Harness", extensionName: "dsh" }),
    );
    assert.match(command!, /--name dsh$/);
  });

  it("accepts a URL with no .git suffix", () => {
    assert.equal(
      enclaveCommand(
        extension({
          source: { url: "https://github.com/acme/kits", path: "tools/a" },
        }),
      ),
      "enclave tools add acme/kits --name openclaw",
    );
  });

  it("accepts a trailing slash", () => {
    assert.equal(
      enclaveCommand(
        extension({
          source: { url: "https://github.com/acme/kits/", path: "tools/a" },
        }),
      ),
      "enclave tools add acme/kits --name openclaw",
    );
  });

  // The shorthand assumes https://github.com. Emitting it for another host
  // would print a command naming a GitHub repository that may not exist.
  it("builds nothing for a non-GitHub source", () => {
    assert.equal(
      enclaveCommand(
        extension({
          source: {
            url: "https://gitlab.com/acme/kits.git",
            path: "features/foo",
          },
        }),
      ),
      undefined,
    );
  });

  // The shorthand is exactly two segments, so a nested-group path can't be
  // expressed by it at all.
  it("builds nothing for a URL with more than two path segments", () => {
    assert.equal(
      enclaveCommand(
        extension({
          source: {
            url: "https://example.com/group/sub/kits.git",
            path: "tools/a",
          },
        }),
      ),
      undefined,
    );
  });
});
