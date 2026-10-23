import type { GenericMcpConfig } from "./mcp-config-templates/types.js";

// The server key: the name a client stores an installed MCP server under.
// Two servers with the same key for one tool overwrite each other, so both
// consolidation and vendor validation look for collisions.

const GENERIC_KEY_PARTS = new Set(["mcp", "server", "mcp-server"]);

// The key a derived install config stores the server under: the generic
// config's serverKey, else the serverId's last segment unless it only says
// "mcp" or "server", in which case the nearest namespace part that says
// more, lowercased. An id that is generic all the way keeps its last segment.
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

// The key a concrete tool config stores its server under: the single key in
// the server map at path, e.g. ["servers"] for Theia. Undefined for a config
// with no one server there, which has no one key to collide on.
export function installedServerKey(
  config: unknown,
  path: readonly string[],
): string | undefined {
  let servers = config;
  for (const part of path) {
    if (!isPlainObject(servers)) return undefined;
    servers = Object.hasOwn(servers, part) ? servers[part] : undefined;
  }
  if (!isPlainObject(servers)) return undefined;
  const keys = Object.keys(servers);
  return keys.length === 1 ? keys[0] : undefined;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
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
