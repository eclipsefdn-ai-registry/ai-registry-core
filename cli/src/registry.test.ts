import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_REGISTRY, resolveRegistry } from "./registry.js";

describe("resolveRegistry", () => {
  it("prefers the flag over AI_REGISTRY_URL", () => {
    assert.equal(
      resolveRegistry("dist/api/v1", { AI_REGISTRY_URL: "https://a.example" }),
      "dist/api/v1",
    );
  });

  it("reads AI_REGISTRY_URL without the flag", () => {
    assert.equal(
      resolveRegistry(undefined, { AI_REGISTRY_URL: "https://a.example" }),
      "https://a.example",
    );
  });

  // An empty location would read the feed out of the working directory, so a
  // skills.json in the checkout could satisfy the guardrail.
  it("reads an empty AI_REGISTRY_URL as unset", () => {
    assert.equal(
      resolveRegistry(undefined, { AI_REGISTRY_URL: "" }),
      DEFAULT_REGISTRY,
    );
  });

  it("reads an empty flag as unset", () => {
    assert.equal(resolveRegistry("", {}), DEFAULT_REGISTRY);
  });
});
