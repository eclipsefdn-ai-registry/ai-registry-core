import { ShieldCheck, AlertTriangle, BadgeCheck } from "lucide-react";
import type { McpServer, Organization } from "../types";

/**
 * Three-way verification badge for an MCP server:
 *  - mcpRegistryVerified: found in the Anthropic MCP registry (purple).
 *  - vendorVerifiedBy: no registry entry, but a vendor claims to be the
 *    publisher/maintainer (blue) — a self-attested claim, not third-party
 *    registry verification. The claiming org's name is surfaced only in the
 *    tooltip, not the badge text.
 *  - otherwise: not found in the registry and no publisher claim (amber).
 *
 * `interactive` controls the hover/cursor-help affordance used on card
 * layouts (ServerList, ToolServerCard); detail views omit it.
 */
export function McpVerificationBadge({
  server,
  getOrg,
  interactive = false,
}: {
  server: McpServer;
  getOrg: (id: string) => Organization | undefined;
  interactive?: boolean;
}) {
  const interactiveClasses = interactive
    ? "cursor-help hover:opacity-80 transition-opacity"
    : "";

  if (server.mcpRegistryVerified) {
    return (
      <span
        className={`inline-flex items-center gap-1 text-xs font-normal px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 ${
          interactive ? "cursor-help hover:bg-primary/20 transition-colors" : ""
        }`}
        title="This server exists in the Anthropic MCP registry"
      >
        <ShieldCheck className="h-3 w-3" />
        Verified
      </span>
    );
  }

  if (server.vendorVerifiedBy) {
    const org = getOrg(server.vendorVerifiedBy);
    const orgName = org ? org.name : server.vendorVerifiedBy;
    return (
      <span
        className={`inline-flex items-center gap-1 text-xs font-normal px-2 py-0.5 rounded-full bg-vendor-verified-bg text-vendor-verified border border-vendor-verified/20 ${interactiveClasses}`}
        title={`Not in the Anthropic MCP registry. ${orgName} claims to be the publisher/maintainer of this server — this is not an Anthropic-registry verification.`}
      >
        <BadgeCheck className="h-3 w-3" />
        Publisher claim
      </span>
    );
  }

  return (
    <span
      className={`inline-flex items-center gap-1 text-xs font-normal px-2 py-0.5 rounded-full bg-warning-bg text-warning border border-warning/20 ${interactiveClasses}`}
      title="This server was not found in the Anthropic MCP registry"
    >
      <AlertTriangle className="h-3 w-3" />
      Unverified
    </span>
  );
}
