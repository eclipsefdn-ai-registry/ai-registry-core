import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mcpConfigTransforms } from "./registry.js";
import { theiaMcpConfigTransform } from "./theia.js";

describe("mcpConfigTransforms", () => {
  it("registers theiaMcpConfigTransform for both theia-ide and theia-ide-next", () => {
    assert.equal(mcpConfigTransforms["theia-ide"], theiaMcpConfigTransform);
    assert.equal(
      mcpConfigTransforms["theia-ide-next"],
      theiaMcpConfigTransform,
    );
  });

  it("has no entry for an unregistered tool id", () => {
    assert.equal(mcpConfigTransforms["some-other-tool"], undefined);
  });

  it("has no entry for vendor-controlled ids that collide with Object.prototype members", () => {
    assert.equal(mcpConfigTransforms["constructor"], undefined);
    assert.equal(mcpConfigTransforms["toString"], undefined);
    assert.equal(mcpConfigTransforms["hasOwnProperty"], undefined);
  });
});
