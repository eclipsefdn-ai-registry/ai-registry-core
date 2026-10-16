import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { marketplaceCommand } from "./marketplaceCommand";

describe("marketplaceCommand", () => {
  it("points at one organization's marketplace", () => {
    assert.equal(
      marketplaceCommand("https://ai.open-vsx.org", "google"),
      "claude plugin marketplace add https://ai.open-vsx.org/api/v1/orgs/google/marketplace.json",
    );
  });

  it("points at the aggregate when no organization is given", () => {
    assert.equal(
      marketplaceCommand("https://ai.open-vsx.org"),
      "claude plugin marketplace add https://ai.open-vsx.org/api/v1/marketplace.json",
    );
  });

  it("keeps the base it was given, so a preview deployment links to itself", () => {
    assert.match(
      marketplaceCommand("https://preview.example.com", "aws"),
      /^claude plugin marketplace add https:\/\/preview\.example\.com\//,
    );
  });

  it("keeps a subpath, where the origin alone would be a 404", () => {
    assert.equal(
      marketplaceCommand("https://example.github.io/ai-registry-core/", "aws"),
      "claude plugin marketplace add https://example.github.io/ai-registry-core/api/v1/orgs/aws/marketplace.json",
    );
  });

  it("does not double the separator on an origin with a trailing slash", () => {
    assert.equal(
      marketplaceCommand("https://ai.open-vsx.org/", "aws"),
      "claude plugin marketplace add https://ai.open-vsx.org/api/v1/orgs/aws/marketplace.json",
    );
  });
});
