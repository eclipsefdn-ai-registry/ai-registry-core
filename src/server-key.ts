import type { GenericMcpConfig } from "./mcp-config-templates/types.js";

// The server key: the name a client stores an installed MCP server under.
// Two servers with the same key for one tool overwrite each other, so both
// consolidation and vendor validation look for collisions.

const GENERIC_KEY_PARTS = new Set(["mcp", "server", "mcp-server"]);

// The key a derived install config stores the server under (ADR 0002): the
// generic config's serverKey, else the serverId's last segment unless it
// only says "mcp" or "server", in which case the nearest namespace part that
// says more, lowercased. An id that is generic all the way keeps its last
// segment.
export function derivedServerKey(
  serverId: string,
  generic: GenericMcpConfig,
): string {
  if (generic.serverKey) return generic.serverKey;
  const [namespace, ...rest] = serverId.split("/");
  const last = rest.at(-1) ?? namespace;
  if (!GENERIC_KEY_PARTS.has(last)) return last;
  const part = namespace
    .split(".")
    .reverse()
    .find((p) => p && !GENERIC_KEY_PARTS.has(p.toLowerCase()));
  return part?.toLowerCase() ?? last;
}

// The key a concrete tool config stores its server under: the single key
// under the tool's single wrapper, e.g. Theia's `servers` or Kiro's
// `mcpServers`. Every transform's output and every hand-written config has
// that shape, so no per-tool wrapper name is needed. Undefined for anything
// else, which has no one key to collide on.
export function installedServerKey(config: unknown): string | undefined {
  const wrapper = soleEntry(config);
  if (!wrapper || typeof wrapper.value !== "object") return undefined;
  return soleEntry(wrapper.value)?.key;
}

function soleEntry(obj: unknown): { key: string; value: unknown } | undefined {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return undefined;
  const entries = Object.entries(obj);
  if (entries.length !== 1) return undefined;
  const [key, value] = entries[0];
  return { key, value };
}

export interface KeyedServer {
  tool: string;
  key: string;
  serverId: string;
}

export interface ServerKeyCollision {
  tool: string;
  key: string;
  // distinct, sorted; always two or more
  serverIds: string[];
}

// Groups servers by tool and key, keeping the groups that hold more than one
// server. The same server listed twice is not a collision.
export function groupCollidingServers(
  servers: KeyedServer[],
): ServerKeyCollision[] {
  const groups = new Map<string, ServerKeyCollision>();
  for (const { tool, key, serverId } of servers) {
    const groupKey = JSON.stringify([tool, key]);
    const group = groups.get(groupKey) ?? { tool, key, serverIds: [] };
    if (!group.serverIds.includes(serverId)) group.serverIds.push(serverId);
    groups.set(groupKey, group);
  }
  const colliding = [...groups.values()].filter((g) => g.serverIds.length > 1);
  for (const g of colliding) g.serverIds.sort();
  return colliding;
}
