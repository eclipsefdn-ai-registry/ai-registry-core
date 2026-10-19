import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { genericConfigBox } from "./genericConfigBox";

const CONNECTION = {
  type: "streamable-http",
  url: "https://mcp.stripe.com",
  headers: { Authorization: "Bearer ${STRIPE_API_KEY}" },
};

describe("genericConfigBox", () => {
  it("copies only the connection info, without notes or serverKey", () => {
    const box = genericConfigBox({
      ...CONNECTION,
      notes: "Set STRIPE_API_KEY to a restricted key.",
      serverKey: "stripe",
    });
    assert.deepEqual(box.json, CONNECTION);
  });

  it("copies the connection unwrapped, not under any key", () => {
    assert.deepEqual(genericConfigBox(CONNECTION).json, CONNECTION);
  });

  it("names the serverKey in the caveat when one is set", () => {
    const box = genericConfigBox({ ...CONNECTION, serverKey: "stripe" });
    assert.equal(
      box.caveat,
      `Generic, tool-agnostic connection info — nest this under your client's own top-level key (e.g. mcpServers, servers) as "stripe" instead of pasting it in as shown.`,
    );
  });

  it("keeps today's caveat when there is no serverKey", () => {
    assert.equal(
      genericConfigBox(CONNECTION).caveat,
      "Generic, tool-agnostic connection info — nest this under your client's own top-level key (e.g. mcpServers, servers) instead of pasting it in as shown.",
    );
  });

  it("passes the notes through to show next to the config", () => {
    const notes = "Set STRIPE_API_KEY to a restricted key.";
    assert.equal(genericConfigBox({ ...CONNECTION, notes }).notes, notes);
    assert.equal(genericConfigBox(CONNECTION).notes, undefined);
  });
});
