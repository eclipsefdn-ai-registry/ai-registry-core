import { useState } from "react";
import { ShieldCheck, AlertTriangle, ArrowLeft } from "lucide-react";
import type {
  McpServer,
  Organization,
  Tool,
  Approval,
  InstallConfig,
} from "../types";
import { sanitizeUrl } from "../sanitize";

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
        {server.mcpRegistryVerified ? (
          <span className="inline-flex items-center gap-1 text-xs font-normal px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
            <ShieldCheck className="h-3 w-3" />
            Verified
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs font-normal px-2 py-0.5 rounded-full bg-warning-bg text-warning border border-warning/20">
            <AlertTriangle className="h-3 w-3" />
            Unverified
          </span>
        )}
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
}: {
  approval: Approval;
  org: Organization | undefined;
  getTool: (id: string) => Tool | undefined;
}) {
  return (
    <div className="bg-background border border-border rounded-lg p-4 mb-3">
      <div className="flex items-center gap-2 mb-3 text-sm flex-wrap">
        <span className="inline-flex text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
          {org?.name ?? approval.organizationId}
        </span>
        <span className="text-muted-foreground">Approved: {approval.date}</span>
        {approval.version && (
          <span className="text-muted-foreground">
            Version: {approval.version}
          </span>
        )}
      </div>
      {approval.installConfigs.map((config, j) => (
        <InstallConfigView key={j} config={config} getTool={getTool} />
      ))}
    </div>
  );
}

export function InstallConfigView({
  config,
  getTool,
}: {
  config: InstallConfig;
  getTool: (id: string) => Tool | undefined;
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
        <div className="mt-2 text-muted-foreground italic">
          {config.instructions}
        </div>
      )}
    </div>
  );
}
