import type { GenericMcpConfig, McpConfigTransform } from "./types.js";
import { theiaMcpConfigTransform } from "./theia.js";
import { derivedServerKey } from "../server-key.js";

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
  });

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
