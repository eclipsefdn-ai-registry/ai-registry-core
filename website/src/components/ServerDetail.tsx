import { useState } from "react";
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
    <div className="server-detail">
      <button className="back-link" onClick={onBack}>
        &larr; Back to list
      </button>
      <h2>{server.name}</h2>
      <p>{server.description}</p>
      <div className="meta-row">
        {server.mcpRegistryVerified ? (
          <span
            className="badge badge-verified"
            title="This server exists in the Anthropic MCP registry"
          >
            Verified
          </span>
        ) : (
          <span
            className="badge badge-unverified"
            title="This server was not found in the Anthropic MCP registry"
          >
            Unverified
          </span>
        )}
        <span>{server.serverId}</span>
        {server.latestVersion && <span>Latest: {server.latestVersion}</span>}
      </div>

      <div className="approvals-section">
        <h3>Approvals ({server.approvals.length})</h3>
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
    <div className="approval-card">
      <div className="approval-card-header">
        <span
          className="badge badge-org"
          title={
            org
              ? `Approved by ${org.name} — this organization has reviewed and endorsed this server for use with their tools`
              : "Approved by this organization"
          }
        >
          {org?.name ?? approval.organizationId}
        </span>
        <span>Approved: {approval.date}</span>
        {approval.version && <span>Version: {approval.version}</span>}
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
    <div className="install-config">
      {tool && <div className="label">Tool: {tool.name}</div>}
      {sanitizeUrl(config.installUrl) && (
        <div>
          <a
            href={sanitizeUrl(config.installUrl)}
            className="install-link"
            onClick={(e) => e.stopPropagation()}
          >
            Install
          </a>
        </div>
      )}
      {sanitizeUrl(config.openVsxUrl) && (
        <div>
          <a
            href={sanitizeUrl(config.openVsxUrl)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
          >
            Open VSX Extension
          </a>
        </div>
      )}
      {configString && (
        <div className="config-block">
          <div className="config-block-header">
            <button
              className="config-toggle"
              onClick={(e) => {
                e.stopPropagation();
                setConfigExpanded(!configExpanded);
              }}
            >
              {configExpanded ? "▾" : "▸"} Configuration
            </button>
            <button className="config-copy" onClick={handleCopy}>
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          {configExpanded && <pre>{configString}</pre>}
        </div>
      )}
      {config.instructions && (
        <div className="instructions">{config.instructions}</div>
      )}
    </div>
  );
}
