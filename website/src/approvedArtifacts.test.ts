import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { approvedArtifactsLabel } from "./approvedArtifacts";

describe("approvedArtifactsLabel", () => {
  it("uses the singular for one artifact", () => {
    assert.equal(approvedArtifactsLabel(1), "View 1 approved artifact");
  });

  it("uses the plural for several artifacts", () => {
    assert.equal(approvedArtifactsLabel(5), "View 5 approved artifacts");
  });

  it("uses the plural for none", () => {
    assert.equal(approvedArtifactsLabel(0), "View 0 approved artifacts");
  });
});
