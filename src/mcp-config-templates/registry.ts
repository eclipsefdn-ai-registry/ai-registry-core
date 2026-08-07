import type { McpConfigTransform } from "./types.js";
import { theiaMcpConfigTransform } from "./theia.js";

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
