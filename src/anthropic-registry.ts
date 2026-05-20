const BASE_URL = "https://registry.modelcontextprotocol.io/v0.1";

export interface ServerMetadata {
  name: string;
  description: string;
}

export interface ServerLookupResult extends ServerMetadata {
  verified: true;
  latestVersion: string;
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

/**
 * Look up an MCP server in the Anthropic MCP registry.
 *
 * Returns metadata on success, undefined if the server is not found (404).
 * Throws on registry errors (network failure, non-404 HTTP errors).
 */
export async function lookupServer(
  serverId: string,
): Promise<ServerLookupResult | undefined> {
  const url = `${BASE_URL}/servers/${encodeURIComponent(serverId)}/versions`;
  const response = await fetch(url);

  if (response.status === 404) {
    // Confirm the registry is actually up — a broken CDN/proxy might 404 everything
    const healthCheck = await fetch(`${BASE_URL}/servers`);
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

  const data = (await response.json()) as RegistryResponse;

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
