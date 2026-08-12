import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  parseAgentCard,
  fetchAgentCard,
  enrichAgentMetadata,
} from "./agent-source.js";
import type { AgentEntry } from "./consolidate.js";

// --- parseAgentCard ---

describe("parseAgentCard", () => {
  it("extracts name and description from valid JSON", () => {
    const raw = JSON.stringify({
      name: "IP Solution Agent",
      description: "Handles IP-related workflows.",
    });
    const result = parseAgentCard(raw);
    assert.equal(result.name, "IP Solution Agent");
    assert.equal(result.description, "Handles IP-related workflows.");
  });

  it("defaults name and description to empty strings when absent", () => {
    const raw = JSON.stringify({ foo: "bar" });
    const result = parseAgentCard(raw);
    assert.equal(result.name, "");
    assert.equal(result.description, "");
  });

  it("defaults to empty strings when name/description are non-string", () => {
    const raw = JSON.stringify({ name: 123, description: null });
    const result = parseAgentCard(raw);
    assert.equal(result.name, "");
    assert.equal(result.description, "");
  });

  it("throws on invalid JSON", () => {
    assert.throws(() => parseAgentCard("not json"));
  });
});

// --- fetchAgentCard ---

describe("fetchAgentCard", () => {
  it("fetches, hashes, and parses a valid agent card", async () => {
    const rawText = JSON.stringify({
      name: "IP Solution Agent",
      description: "Handles IP-related workflows.",
    });
    mock.method(globalThis, "fetch", async () => {
      return { ok: true, status: 200, text: async () => rawText } as Response;
    });
    try {
      const metadata = await fetchAgentCard("https://example.com/agent.json");
      assert.equal(metadata.name, "IP Solution Agent");
      assert.equal(metadata.description, "Handles IP-related workflows.");
      const expectedHash = createHash("sha256")
        .update(rawText)
        .digest("hex")
        .slice(0, 12);
      assert.equal(metadata.contentHash, expectedHash);
    } finally {
      mock.restoreAll();
    }
  });

  it("throws with the URL included on a non-OK response", async () => {
    mock.method(globalThis, "fetch", async () => {
      return { ok: false, status: 404, text: async () => "" } as Response;
    });
    try {
      await assert.rejects(
        () => fetchAgentCard("https://example.com/missing.json"),
        (err: unknown) => {
          assert.ok(err instanceof Error);
          assert.match(err.message, /https:\/\/example\.com\/missing\.json/);
          assert.match(err.message, /404/);
          return true;
        },
      );
    } finally {
      mock.restoreAll();
    }
  });

  it("throws a descriptive error when the response body is invalid JSON", async () => {
    mock.method(globalThis, "fetch", async () => {
      return {
        ok: true,
        status: 200,
        text: async () => "not json",
      } as Response;
    });
    try {
      await assert.rejects(
        () => fetchAgentCard("https://example.com/agent.json"),
        (err: unknown) => {
          assert.ok(err instanceof Error);
          assert.match(err.message, /https:\/\/example\.com\/agent\.json/);
          return true;
        },
      );
    } finally {
      mock.restoreAll();
    }
  });

  it("throws when fetch itself rejects (network error)", async () => {
    mock.method(globalThis, "fetch", async () => {
      throw new Error("network down");
    });
    try {
      await assert.rejects(() =>
        fetchAgentCard("https://example.com/agent.json"),
      );
    } finally {
      mock.restoreAll();
    }
  });
});

// --- enrichAgentMetadata ---

function makeAgentEntry(agentId: string, url: string): AgentEntry {
  return {
    agentId,
    name: agentId,
    description: "",
    source: { url },
    contentHash: "",
    approvals: [],
  };
}

describe("enrichAgentMetadata", () => {
  it("returns an empty array unchanged", async () => {
    const result = await enrichAgentMetadata([]);
    assert.deepEqual(result, []);
  });

  it("enriches a single successful entry in place", async () => {
    const rawText = JSON.stringify({ name: "Agent One", description: "Desc" });
    mock.method(globalThis, "fetch", async () => {
      return { ok: true, status: 200, text: async () => rawText } as Response;
    });
    try {
      const entry = makeAgentEntry(
        "io.example/agent-one",
        "https://example.com/one.json",
      );
      const result = await enrichAgentMetadata([entry]);
      assert.equal(result.length, 1);
      assert.equal(result[0], entry);
      assert.equal(entry.name, "Agent One");
      assert.equal(entry.description, "Desc");
      assert.ok(entry.contentHash.length === 12);
    } finally {
      mock.restoreAll();
    }
  });

  it("falls back to agentId when the card has no name", async () => {
    const rawText = JSON.stringify({ description: "Desc" });
    mock.method(globalThis, "fetch", async () => {
      return { ok: true, status: 200, text: async () => rawText } as Response;
    });
    try {
      const entry = makeAgentEntry(
        "io.example/agent-noname",
        "https://example.com/noname.json",
      );
      const result = await enrichAgentMetadata([entry]);
      assert.equal(result[0].name, "io.example/agent-noname");
    } finally {
      mock.restoreAll();
    }
  });

  it("drops a failing entry with a warning, without throwing", async () => {
    mock.method(globalThis, "fetch", async () => {
      return { ok: false, status: 500, text: async () => "" } as Response;
    });
    const warnCalls: unknown[][] = [];
    mock.method(console, "warn", (...args: unknown[]) => {
      warnCalls.push(args);
    });
    try {
      const entry = makeAgentEntry(
        "io.example/agent-fail",
        "https://example.com/fail.json",
      );
      const result = await enrichAgentMetadata([entry]);
      assert.deepEqual(result, []);
      assert.ok(warnCalls.length > 0);
    } finally {
      mock.restoreAll();
    }
  });

  it("keeps only the successful entry when one succeeds and one fails", async () => {
    const rawText = JSON.stringify({ name: "Good Agent", description: "D" });
    mock.method(globalThis, "fetch", async (url: string) => {
      if (url.includes("good")) {
        return { ok: true, status: 200, text: async () => rawText } as Response;
      }
      return { ok: false, status: 500, text: async () => "" } as Response;
    });
    mock.method(console, "warn", () => {});
    try {
      const good = makeAgentEntry(
        "io.example/good",
        "https://example.com/good.json",
      );
      const bad = makeAgentEntry(
        "io.example/bad",
        "https://example.com/bad.json",
      );
      const result = await enrichAgentMetadata([good, bad]);
      assert.equal(result.length, 1);
      assert.equal(result[0].agentId, "io.example/good");
    } finally {
      mock.restoreAll();
    }
  });
});
