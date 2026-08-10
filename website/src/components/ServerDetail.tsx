import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import type { McpServer, Organization, Tool, InstallConfig } from "../types";
import { sanitizeUrl } from "../sanitize";
import { orgBadge } from "../orgBadge";
import { McpVerificationBadge } from "./McpVerificationBadge";

export function ServerDetail({
  server,
  getOrg,
  getTool,
  onBack,
}: {
  server: McpServer;
  getOrg: (id: string) => Organization | undefined;
  getTool: (id: string) => Tool | undefined;
  onBack: () => void;
}) {
  return (
    <div className="bg-card border border-primary/50 rounded-xl p-6 shadow-md">
      <button
        className="inline-flex items-center gap-1 text-sm text-primary hover:underline mb-4"
        onClick={onBack}
      >
        <ArrowLeft className="h-4 w-4" />
        Back to list
      </button>
      <h2 className="text-xl font-bold mb-1">{server.name}</h2>
      <p className="text-muted-foreground mb-4">{server.description}</p>
      <div className="flex gap-3 mb-6 flex-wrap items-center text-sm">
        <McpVerificationBadge server={server} getOrg={getOrg} />
        <span className="text-muted-foreground font-mono text-xs">
          {server.serverId}
        </span>
        {server.latestVersion && (
          <span className="text-muted-foreground">
            Latest: {server.latestVersion}
          </span>
        )}
      </div>

      <div>
        <h3 className="text-base font-semibold mb-3">
          Approvals ({server.approvals.length})
        </h3>
        {server.approvals.map((approval, i) => (
          <ApprovalCard
            key={i}
            approval={approval}
            org={getOrg(approval.organizationId)}
            getTool={getTool}
            serverId={server.serverId}
          />
        ))}
      </div>
    </div>
  );
}

// Minimal shape covering both MCP's Approval and (via ApprovalCard's use in
// PluginDetail) PluginApproval — both already have every required field
// here; version/genericConfig are MCP-only extras PluginApproval simply
// omits, which structural typing allows for an optional property.
interface ApprovalCardApproval {
  organizationId: string;
  date: string;
  configHash: string;
  installConfigs: InstallConfig[];
  version?: string;
  genericConfig?: Record<string, unknown>;
}

function defaultApprovedTitle(org: Organization): string {
  return `Approved by ${org.name} — this organization has reviewed and endorsed this server for use with their tools`;
}

export function ApprovalCard({
  approval,
  org,
  getTool,
  serverId,
  approvedTitle = defaultApprovedTitle,
}: {
  approval: ApprovalCardApproval;
  org: Organization | undefined;
  getTool: (id: string) => Tool | undefined;
  // Only used for the genericConfig branch below, which PluginApproval never
  // populates — optional so non-MCP callers (PluginDetail) don't need one.
  serverId?: string;
  approvedTitle?: (org: Organization) => string;
}) {
  const badge = orgBadge(org, {
    fallbackId: approval.organizationId,
    approvedTitle: org ? approvedTitle(org) : "Approved by this organization",
  });
  return (
    <div className="bg-background border border-border rounded-lg p-4 mb-3">
      <div className="flex items-center gap-2 mb-3 text-sm flex-wrap">
        <span
          className={`inline-flex text-xs px-2 py-0.5 rounded-full border bg-primary/10 text-primary border-primary/20 cursor-help ${
            badge.inferred ? "border-dashed" : ""
          }`}
          title={badge.title}
        >
          {badge.text}
        </span>
        <span className="text-muted-foreground">Approved: {approval.date}</span>
        {approval.version && (
          <span className="text-muted-foreground">
            Version: {approval.version}
          </span>
        )}
      </div>
      {approval.genericConfig && serverId && (
        <GenericConfigView
          config={approval.genericConfig}
          slug={serverIdSlug(serverId)}
        />
      )}
      {approval.installConfigs.map((config, j) => (
        <InstallConfigView key={j} config={config} getTool={getTool} />
      ))}
    </div>
  );
}

// The last "/"-segment of serverId — the same rule consolidate.ts uses to
// key a derived config's server-name entry (e.g. "review-guard" from
// "io.github.eclipsesource/review-guard"). Not stored in genericConfig
// itself (that would duplicate serverId as a second, driftable identity) —
// computed here purely so the copy box can show a paste-ready, name-keyed
// snippet.
function serverIdSlug(serverId: string): string {
  return serverId.split("/").pop() ?? serverId;
}

// Shared by GenericConfigView and InstallConfigView — both need an
// expand/collapse toggle, a copy-to-clipboard button with a 2s "Copied!"
// reset, and a syntax-highlighted <pre>. `caveat` is an optional italic note
// shown only while expanded (GenericConfigView's "this isn't a finished
// config" disclaimer); InstallConfigView's always-visible instructions text
// has different visibility rules and is rendered separately, not through
// this prop.
function CollapsibleJson({
  label,
  json,
  caveat,
  boxed = true,
}: {
  label: string;
  json: Record<string, unknown> | undefined;
  caveat?: string;
  // False when the caller already renders its own bordered card (e.g.
  // InstallConfigView) — avoids nesting this component's own border/bg
  // inside that card's identical one.
  boxed?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  if (!json) return null;
  const jsonString = JSON.stringify(json, null, 2);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(jsonString).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div
      className={
        boxed
          ? "mt-2 p-3 bg-card border border-border rounded-md text-sm"
          : "mt-2"
      }
    >
      <div className="flex items-center justify-between gap-2">
        <button
          className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(!expanded);
          }}
        >
          {expanded ? "▾" : "▸"} {label}
        </button>
        <button
          className="text-xs px-2 py-0.5 border border-border rounded hover:border-primary hover:text-primary transition-colors text-muted-foreground"
          onClick={handleCopy}
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      {expanded && (
        <>
          <pre className="mt-2 bg-[#1e293b] text-[#e2e8f0] p-3 rounded-md overflow-x-auto text-xs leading-relaxed">
            {jsonString}
          </pre>
          {caveat && (
            <div className="mt-2 text-muted-foreground italic">{caveat}</div>
          )}
        </>
      )}
    </div>
  );
}

export function GenericConfigView({
  config,
  slug,
}: {
  config: Record<string, unknown>;
  slug: string;
}) {
  return (
    <CollapsibleJson
      label="Generic config"
      json={{ [slug]: config }}
      caveat="Generic, tool-agnostic connection info — nest this under your client's own top-level key (e.g. mcpServers, servers) instead of pasting it in as shown."
    />
  );
}

export function InstallConfigView({
  config,
  getTool,
  compact,
}: {
  config: InstallConfig;
  getTool: (id: string) => Tool | undefined;
  compact?: boolean;
}) {
  const tool = config.tool ? getTool(config.tool) : undefined;

  return (
    <div className="mt-2 p-3 bg-card border border-border rounded-md text-sm">
      {tool && (
        <div className="font-medium text-muted-foreground mb-1">
          Tool: {tool.name}
        </div>
      )}
      {sanitizeUrl(config.installUrl) && (
        <div>
          <a
            href={sanitizeUrl(config.installUrl)}
            className="inline-flex items-center gap-1 px-3 py-1 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
            onClick={(e) => e.stopPropagation()}
          >
            Install
          </a>
        </div>
      )}
      {sanitizeUrl(config.openVsxUrl) && (
        <div className="mt-1">
          <a
            href={sanitizeUrl(config.openVsxUrl)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            Open VSX Extension
          </a>
        </div>
      )}
      <CollapsibleJson
        label="Configuration"
        json={config.config}
        boxed={false}
      />
      {config.instructions && (
        <div
          className={`mt-2 text-muted-foreground italic break-words overflow-hidden ${compact ? "line-clamp-2" : ""}`}
        >
          {config.instructions}
        </div>
      )}
    </div>
  );
}
