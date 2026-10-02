import { describe, it, mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import { lookupServer, lookupServers } from "./anthropic-registry.js";

const NO_DELAY = { retryDelayMs: 0 };

const VERSIONS_URL =
  "https://registry.modelcontextprotocol.io/v0.1/servers/io.example%2Fserver/versions";
const HEALTH_CHECK_URL =
  "https://registry.modelcontextprotocol.io/v0.1/servers";

function versions(name: string, version = "1.0.0"): Response {
  return Response.json({
    servers: [{ server: { name, description: `About ${name}`, version } }],
  });
}

function status(code: number): Response {
  return new Response(null, { status: code });
}

// Answers each fetch with the next reply in line, throwing it if it is an
// Error, and returns the URLs fetched.
function serve(...replies: (Response | Error)[]): string[] {
  const urls: string[] = [];
  mock.method(globalThis, "fetch", async (url: string) => {
    urls.push(url);
    const reply = replies.shift();
    if (reply === undefined) throw new Error(`Unexpected fetch: ${url}`);
    if (reply instanceof Error) throw reply;
    return reply;
  });
  return urls;
}

function silenceWarnings(): unknown[][] {
  const warnings: unknown[][] = [];
  mock.method(console, "warn", (...args: unknown[]) => {
    warnings.push(args);
  });
  return warnings;
}

afterEach(() => {
  mock.restoreAll();
});

// --- lookupServer ---

describe("lookupServer", () => {
  it("returns the metadata of the version marked latest", async () => {
    const latest = {
      "io.modelcontextprotocol.registry/official": { isLatest: true },
    };
    serve(
      Response.json({
        servers: [
          {
            server: {
              name: "io.example/server",
              description: "Old",
              version: "1.0.0",
            },
          },
          {
            server: {
              name: "io.example/server",
              title: "Example Server",
              description: "New",
              version: "2.0.0",
            },
            _meta: latest,
          },
        ],
      }),
    );

    assert.deepEqual(await lookupServer("io.example/server", NO_DELAY), {
      name: "Example Server",
      description: "New",
      verified: true,
      latestVersion: "2.0.0",
    });
  });

  it("returns undefined when the registry lists no versions", async () => {
    serve(Response.json({ servers: [] }));

    assert.equal(await lookupServer("io.example/server", NO_DELAY), undefined);
  });

  it("retries a 500 until the registry answers", async () => {
    const warnings = silenceWarnings();
    const urls = serve(status(500), status(500), versions("io.example/server"));

    const result = await lookupServer("io.example/server", NO_DELAY);

    assert.equal(result?.name, "io.example/server");
    assert.deepEqual(urls, [VERSIONS_URL, VERSIONS_URL, VERSIONS_URL]);
    assert.equal(warnings.length, 2);
  });

  it("retries a 429 and the other 5xx", async () => {
    silenceWarnings();
    const codes = [429, 502, 503, 504];
    const urls = serve(
      ...codes.flatMap((code) => [status(code), versions("io.example/server")]),
    );

    for (const code of codes) {
      const result = await lookupServer("io.example/server", NO_DELAY);
      assert.equal(result?.name, "io.example/server", `HTTP ${String(code)}`);
    }
    assert.equal(urls.length, 2 * codes.length);
  });

  it("retries a request that fails outright", async () => {
    silenceWarnings();
    const urls = serve(
      new TypeError("fetch failed"),
      versions("io.example/server"),
    );

    const result = await lookupServer("io.example/server", NO_DELAY);

    assert.equal(result?.name, "io.example/server");
    assert.equal(urls.length, 2);
  });

  it("throws once four attempts have failed with a 500", async () => {
    silenceWarnings();
    const urls = serve(status(500), status(500), status(500), status(500));

    await assert.rejects(
      lookupServer("io.example/server", NO_DELAY),
      /HTTP 500 for io\.example\/server/,
    );
    assert.equal(urls.length, 4);
  });

  it("rethrows the last error once four attempts have failed outright", async () => {
    silenceWarnings();
    const urls = serve(
      new TypeError("fetch failed"),
      new TypeError("fetch failed"),
      new TypeError("fetch failed"),
      new TypeError("connection reset"),
    );

    await assert.rejects(
      lookupServer("io.example/server", NO_DELAY),
      /connection reset/,
    );
    assert.equal(urls.length, 4);
  });

  it("throws on any other client error without retrying", async () => {
    const urls = serve(status(400));

    await assert.rejects(
      lookupServer("io.example/server", NO_DELAY),
      /HTTP 400 for io\.example\/server/,
    );
    assert.equal(urls.length, 1);
  });

  it("returns undefined for a 404 once the health check passes, without retrying the 404", async () => {
    const urls = serve(status(404), Response.json({ servers: [] }));

    assert.equal(await lookupServer("io.example/server", NO_DELAY), undefined);
    assert.deepEqual(urls, [VERSIONS_URL, HEALTH_CHECK_URL]);
  });

  it("retries a health check that fails with a 500", async () => {
    silenceWarnings();
    const urls = serve(
      status(404),
      status(500),
      Response.json({ servers: [] }),
    );

    assert.equal(await lookupServer("io.example/server", NO_DELAY), undefined);
    assert.deepEqual(urls, [VERSIONS_URL, HEALTH_CHECK_URL, HEALTH_CHECK_URL]);
  });

  it("throws when the health check keeps failing", async () => {
    silenceWarnings();
    serve(status(404), status(500), status(500), status(500), status(500));

    await assert.rejects(
      lookupServer("io.example/server", NO_DELAY),
      /appears to be down \(health check returned HTTP 500\)/,
    );
  });
});

// --- lookupServers ---

// Answers every lookup with its server's own name after `delayMs(id)`,
// counting how many fetches are in flight at once.
function serveAll(delayMs: (serverId: string) => number): {
  calls: string[];
  maxInFlight: () => number;
} {
  const calls: string[] = [];
  let inFlight = 0;
  let maxInFlight = 0;
  mock.method(globalThis, "fetch", async (url: string) => {
    const serverId = decodeURIComponent(
      url.replace(/^.*\/servers\//, "").replace(/\/versions$/, ""),
    );
    calls.push(serverId);
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((resolve) => setTimeout(resolve, delayMs(serverId)));
    inFlight--;
    return serverId.endsWith("/bad") ? status(400) : versions(serverId);
  });
  return { calls, maxInFlight: () => maxInFlight };
}

describe("lookupServers", () => {
  const ids = Array.from({ length: 20 }, (_, i) => `io.example/s${String(i)}`);

  it("returns results in the order of the IDs given", async () => {
    // Later IDs answer first.
    serveAll((id) => 20 - ids.indexOf(id));

    const results = await lookupServers(ids, NO_DELAY);

    assert.deepEqual(
      results.map((r) => r?.name),
      ids,
    );
  });

  it("runs at most eight lookups at once", async () => {
    const { calls, maxInFlight } = serveAll(() => 5);

    await lookupServers(ids, NO_DELAY);

    assert.equal(calls.length, 20);
    assert.equal(maxInFlight(), 8);
  });

  it("returns an empty array for no IDs", async () => {
    assert.deepEqual(await lookupServers([], NO_DELAY), []);
  });

  it("rejects on the first lookup that throws and starts no more", async () => {
    const { calls } = serveAll((id) => (id.endsWith("/bad") ? 0 : 10));

    await assert.rejects(
      lookupServers(["io.example/bad", ...ids], NO_DELAY),
      /HTTP 400 for io\.example\/bad/,
    );
    // Let the lookups already in flight finish before counting.
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(calls.length, 8);
  });
});
