import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import type {
  McpServer,
  Organization,
  Tool,
  Approval,
  InstallConfig,
} from "../types";
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

export function ApprovalCard({
  approval,
  org,
  getTool,
  serverId,
}: {
  approval: Approval;
  org: Organization | undefined;
  getTool: (id: string) => Tool | undefined;
  serverId: string;
}) {
  const badge = orgBadge(org, {
    fallbackId: approval.organizationId,
    approvedTitle: org
      ? `Approved by ${org.name} — this organization has reviewed and endorsed this server for use with their tools`
      : "Approved by this organization",
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
      {approval.genericConfig && (
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

export function GenericConfigView({
  config,
  slug,
}: {
  config: Record<string, unknown>;
  slug: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const configString = JSON.stringify({ [slug]: config }, null, 2);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(configString).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="mt-2 p-3 bg-card border border-border rounded-md text-sm">
      <div className="flex items-center justify-between gap-2">
        <button
          className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
          onClick={(e) => {
            e.stopPropagation();
            setExpanded(!expanded);
          }}
        >
          {expanded ? "▾" : "▸"} Generic config
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
            {configString}
          </pre>
          <div className="mt-2 text-muted-foreground italic">
            Generic, tool-agnostic connection info — not a finished config for
            any specific client, adapt the wrapper for yours.
          </div>
        </>
      )}
    </div>
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
  const [configExpanded, setConfigExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const configString = config.config
    ? JSON.stringify(config.config, null, 2)
    : null;

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (configString) {
      navigator.clipboard.writeText(configString).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  };

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
      {configString && (
        <div className="mt-2">
          <div className="flex items-center justify-between gap-2">
            <button
              className="text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                setConfigExpanded(!configExpanded);
              }}
            >
              {configExpanded ? "\u25BE" : "\u25B8"} Configuration
            </button>
            <button
              className="text-xs px-2 py-0.5 border border-border rounded hover:border-primary hover:text-primary transition-colors text-muted-foreground"
              onClick={handleCopy}
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          {configExpanded && (
            <pre className="mt-2 bg-[#1e293b] text-[#e2e8f0] p-3 rounded-md overflow-x-auto text-xs leading-relaxed">
              {configString}
            </pre>
          )}
        </div>
      )}
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
