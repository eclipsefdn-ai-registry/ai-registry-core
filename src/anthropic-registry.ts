import { setTimeout as sleep } from "node:timers/promises";

const BASE_URL = "https://registry.modelcontextprotocol.io/v0.1";

// The registry fails a small share of requests, with a 500 ("Failed to get
// server versions") or, under load, a 504, for reasons unrelated to the
// request: the same request a moment later usually succeeds. A consolidation
// run looks up every approved server, so without retries nearly every run
// would fail on one of them.
const MAX_ATTEMPTS = 4;
const RETRY_DELAY_MS = 500;

// Sent all at once, lookups queue at the registry until its gateway gives up
// on some of them with a 504.
const CONCURRENT_LOOKUPS = 8;

export interface ServerMetadata {
  name: string;
  description: string;
}

export interface ServerLookupResult extends ServerMetadata {
  verified: true;
  latestVersion: string;
}

export interface LookupOptions {
  /** Delay before the first retry, doubled for each one after it, jittered. */
  retryDelayMs?: number;
}

interface RegistryMeta {
  "io.modelcontextprotocol.registry/official"?: {
    isLatest?: boolean;
  };
}

interface RegistryServerData {
  name: string;
  title?: string;
  description: string;
  version: string;
  [key: string]: unknown;
}

interface RegistryServerEntry {
  server: RegistryServerData;
  _meta?: RegistryMeta;
}

interface RegistryResponse {
  servers: RegistryServerEntry[];
}

interface RegistryReply {
  ok: boolean;
  status: number;
  body: string;
}

function isTransient(status: number): boolean {
  return status >= 500 || status === 429;
}

/**
 * GET a registry URL, retrying a 5xx or 429 response or a request that fails
 * outright, with exponential backoff and jitter. Once MAX_ATTEMPTS are used
 * up, returns the last response, or rethrows the last error if that attempt
 * got none.
 *
 * The body is read inside the retries, so a connection dropped partway
 * through a response is retried like one dropped before it. There is no
 * timeout of our own: responses that take a minute or more still succeed,
 * the registry's gateway answers 504 after three minutes, and fetch gives up
 * on a connection that hangs after five, which is then retried like any
 * other network error.
 */
async function getWithRetry(
  url: string,
  retryDelayMs: number,
): Promise<RegistryReply> {
  for (let attempt = 1; ; attempt++) {
    let problem: string;
    try {
      const response = await fetch(url);
      const body = await response.text();
      if (!isTransient(response.status) || attempt === MAX_ATTEMPTS) {
        return { ok: response.ok, status: response.status, body };
      }
      problem = `HTTP ${String(response.status)}`;
    } catch (err) {
      if (attempt === MAX_ATTEMPTS) throw err;
      problem = err instanceof Error ? err.message : String(err);
    }
    console.warn(
      `  Retrying ${url} (attempt ${String(attempt + 1)} of ${String(MAX_ATTEMPTS)}): ${problem}`,
    );
    const delayMs = retryDelayMs * 2 ** (attempt - 1) * (0.5 + Math.random());
    await sleep(delayMs);
  }
}

/**
 * Look up an MCP server in the Anthropic MCP registry.
 *
 * Returns metadata on success, undefined if the server is not found (404).
 * Throws on registry errors (network failure, non-404 HTTP errors), once
 * the transient ones have been retried (see getWithRetry).
 */
export async function lookupServer(
  serverId: string,
  { retryDelayMs = RETRY_DELAY_MS }: LookupOptions = {},
): Promise<ServerLookupResult | undefined> {
  const url = `${BASE_URL}/servers/${encodeURIComponent(serverId)}/versions`;
  const response = await getWithRetry(url, retryDelayMs);

  if (response.status === 404) {
    // Confirm the registry is actually up — a broken CDN/proxy might 404 everything
    const healthCheck = await getWithRetry(`${BASE_URL}/servers`, retryDelayMs);
    if (!healthCheck.ok) {
      throw new Error(
        `Anthropic MCP registry appears to be down (health check returned HTTP ${String(healthCheck.status)})`,
      );
    }
    return undefined;
  }

  if (!response.ok) {
    throw new Error(
      `Anthropic MCP registry returned HTTP ${String(response.status)} for ${serverId}`,
    );
  }

  const data = JSON.parse(response.body) as RegistryResponse;

  if (data.servers.length === 0) {
    return undefined;
  }

  const latest =
    data.servers.find(
      (e) =>
        e._meta?.["io.modelcontextprotocol.registry/official"]?.isLatest ===
        true,
    ) ?? data.servers[0];

  return {
    name: latest.server.title ?? latest.server.name,
    description: latest.server.description,
    verified: true,
    latestVersion: latest.server.version,
  };
}

/**
 * Look up several servers, CONCURRENT_LOOKUPS at a time. Results are in the
 * order of `serverIds`. Rejects with the first lookup that throws, and starts
 * no more after it.
 */
export async function lookupServers(
  serverIds: readonly string[],
  options: LookupOptions = {},
): Promise<(ServerLookupResult | undefined)[]> {
  const results: (ServerLookupResult | undefined)[] = [];
  let next = 0;
  let failed = false;

  const worker = async (): Promise<void> => {
    while (!failed && next < serverIds.length) {
      const i = next++;
      try {
        results[i] = await lookupServer(serverIds[i], options);
      } catch (err) {
        failed = true;
        throw err;
      }
    }
  };

  await Promise.all(
    Array.from(
      { length: Math.min(CONCURRENT_LOOKUPS, serverIds.length) },
      worker,
    ),
  );
  return results;
}
