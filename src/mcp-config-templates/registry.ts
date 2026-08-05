import type { McpConfigTransform } from "./types.js";
import { theiaMcpConfigTransform } from "./theia.js";

// New tool support is a PR here (reviewed, maintainer-gated) — not a vendor
// self-declaring capability in their own organization.json. See
// docs/superpowers/specs/2026-08-04-mcp-generic-config-design.md §4 for why.
// Constructed with a null prototype so a vendor-controlled tool id like
// "constructor" or "toString" can never resolve to an inherited
// Object.prototype member instead of undefined — see registry.test.ts.
export const mcpConfigTransforms: Record<string, McpConfigTransform> =
  Object.assign(Object.create(null), {
    "theia-ide": theiaMcpConfigTransform,
    "theia-ide-next": theiaMcpConfigTransform,
  });
