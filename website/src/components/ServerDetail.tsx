import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import type {
  McpServer,
  Organization,
  Tool,
  InstallConfig,
  GenericConfig,
} from "../types";
import { sanitizeUrl } from "../sanitize";
import { orgBadge } from "../orgBadge";
import { hoistSharedInstructions } from "../sharedInstructions";
import { genericConfigBox, type GenericConfigBox } from "../genericConfigBox";
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
        <McpRegistryVersion server={server} />
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

// Minimal shape any artifact type's approval can satisfy — genericConfig is
// MCP's alone, and optional, so other approval types simply omit it. No
// version: an MCP approval's is informational and never shown per card, see
// McpRegistryVersion.
interface ApprovalCardApproval {
  organizationId: string;
  date: string;
  configHash: string;
  installConfigs: InstallConfig[];
  genericConfig?: GenericConfig;
}

/**
 * The newest version the MCP registry lists for a server, labelled as the
 * registry's. It is registry metadata, like the name and description, and
 * says nothing about what an approval runs: that is its configuration, which
 * can start whatever a package manager or a remote URL serves at the time.
 * Printed as published, since some registry versions already carry a "v".
 *
 * Shared by ServerDetail and ToolPage's server detail, whose headers otherwise
 * duplicate each other, so the label can't drift between them.
 */
export function McpRegistryVersion({ server }: { server: McpServer }) {
  if (!server.latestVersion) return null;
  return (
    <span
      className="text-muted-foreground cursor-help"
      title="The newest version the MCP registry lists for this server. What runs is set by each approval's configuration below."
    >
      MCP registry: {server.latestVersion}
    </span>
  );
}

function defaultApprovedTitle(org: Organization): string {
  return `Approved by ${org.name} — this organization has reviewed and endorsed this server for use with their tools`;
}

export function ApprovalCard({
  approval,
  org,
  getTool,
  approvedTitle = defaultApprovedTitle,
}: {
  approval: ApprovalCardApproval;
  org: Organization | undefined;
  getTool: (id: string) => Tool | undefined;
  approvedTitle?: (org: Organization) => string;
}) {
  const badge = orgBadge(org, {
    fallbackId: approval.organizationId,
    approvedTitle: org ? approvedTitle(org) : "Approved by this organization",
  });
  // One value both renders the generic config box and tells the dedupe below
  // its notes are on screen, so the two can't disagree.
  const generic = approval.genericConfig
    ? genericConfigBox(approval.genericConfig)
    : undefined;
  const { hoisted, installConfigs } = hoistSharedInstructions(
    approval.installConfigs,
    generic?.notes,
  );
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
      </div>
      {generic && <GenericConfigView box={generic} />}
      {hoisted && <SetupText>{hoisted}</SetupText>}
      {installConfigs.map((config, j) => (
        <InstallConfigView key={j} config={config} getTool={getTool} />
      ))}
    </div>
  );
}

// Shared by GenericConfigView and InstallConfigView — both need an
// expand/collapse toggle, a copy-to-clipboard button with a 2s "Copied!"
// reset, and a syntax-highlighted <pre>. `caveat` is an optional italic note
// shown only while expanded (GenericConfigView's "this isn't a finished
// config" disclaimer). `children` render inside the box, below the JSON and
// caveat, expanded or not (GenericConfigView's notes); InstallConfigView
// renders its own box, so its always-visible instructions go there instead.
function CollapsibleJson({
  label,
  json,
  caveat,
  boxed = true,
  children,
}: {
  label: string;
  json: Record<string, unknown> | undefined;
  caveat?: string;
  // False when the caller already renders its own bordered card (e.g.
  // InstallConfigView) — avoids nesting this component's own border/bg
  // inside that card's identical one.
  boxed?: boolean;
  children?: React.ReactNode;
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
      {children}
    </div>
  );
}

// Prose for whoever sets the server up: a generic config's notes, an install
// config's instructions, or the text a card shows once for all its tools.
// One component, so the three always look alike.
function SetupText({
  children,
  compact,
}: {
  children: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <div
      className={`mt-2 text-sm text-muted-foreground italic break-words overflow-hidden ${compact ? "line-clamp-2" : ""}`}
    >
      {children}
    </div>
  );
}

// notes explain the config to a person and aren't part of it, so they're
// shown like an install config's instructions, outside the copied JSON.
export function GenericConfigView({ box }: { box: GenericConfigBox }) {
  return (
    <CollapsibleJson label="Generic config" json={box.json} caveat={box.caveat}>
      {box.notes && <SetupText>{box.notes}</SetupText>}
    </CollapsibleJson>
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
        <SetupText compact={compact}>{config.instructions}</SetupText>
      )}
    </div>
  );
}
