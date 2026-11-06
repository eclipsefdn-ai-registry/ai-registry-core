import type { GenericMcpConfig, McpConfigTransform } from "./types.js";
import { theiaMcpConfigTransform } from "./theia.js";
import { kiroMcpConfigTransform } from "./kiro.js";
import { derivedServerKey, installedServerKey } from "../server-key.js";

// New tool support is a PR here (reviewed, maintainer-gated) — not a vendor
// self-declaring capability in their own organization.json. A vendor could
// otherwise ship a transform that mishandles auth or misrepresents a config
// for every server it approves, not just its own; gating new tool support
// behind review keeps that translation logic maintainer-owned.
// Constructed with a null prototype so a vendor-controlled tool id like
// "constructor" or "toString" can never resolve to an inherited
// Object.prototype member instead of undefined — see registry.test.ts.
export const mcpConfigTransforms: Record<string, McpConfigTransform> =
  Object.assign(Object.create(null), {
    "theia-ide": theiaMcpConfigTransform,
    "theia-ide-next": theiaMcpConfigTransform,
    kiro: kiroMcpConfigTransform,
  });

// Where each tool's config keeps its map of servers, e.g. ["servers"] for
// { servers: { <key>: ... } }. Maintainer-owned like the transforms, and
// null-prototype for the same reason.
const mcpServerPaths: Record<string, readonly string[]> = Object.assign(
  Object.create(null),
  {
    "theia-ide": ["servers"],
    "theia-ide-next": ["servers"],
    kiro: ["mcpServers"],
  },
);

// The key a tool's config stores its server under, read where
// mcpServerPaths says the tool keeps its servers. Server key collision checks
// read every config, derived or hand-written, through this. Undefined for a
// tool with no entry: a tool's format can't be safely guessed from a
// config's shape, so such a tool isn't checked.
export function toolServerKey(
  tool: string,
  config: unknown,
): string | undefined {
  const path = mcpServerPaths[tool];
  return path && installedServerKey(config, path);
}

// The tool config a derived install config gets: the tool's transform run on
// generic, storing the server under its server key. Undefined when the tool
// has no transform or it can't represent generic. Consolidation and vendor
// validation both derive through this, so validation's server key collision
// check sees the key consolidation publishes.
export function deriveToolConfig(
  tool: string,
  serverId: string,
  generic: GenericMcpConfig,
): Record<string, unknown> | undefined {
  return mcpConfigTransforms[tool]?.(
    generic,
    derivedServerKey(serverId, generic),
  );
}
