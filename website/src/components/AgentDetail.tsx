import { ArrowLeft } from "lucide-react";
import type { Agent, Organization, Tool } from "../types";
import { sanitizeUrl } from "../sanitize";
import { ApprovalCard } from "./ServerDetail";

export function AgentDetail({
  agent,
  getOrg,
  getTool,
  onBack,
}: {
  agent: Agent;
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
      <h2 className="text-xl font-bold mb-1">{agent.name}</h2>
      <p className="text-muted-foreground mb-4">{agent.description}</p>
      <div className="flex gap-3 mb-4 flex-wrap items-center text-sm">
        <span className="text-muted-foreground font-mono text-xs">
          {agent.agentId}
        </span>
        <span className="text-muted-foreground text-xs">
          Hash: {agent.contentHash}
        </span>
        {sanitizeUrl(agent.source.url) && (
          <a
            href={sanitizeUrl(agent.source.url)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline text-sm"
          >
            Agent Card
          </a>
        )}
      </div>

      <div>
        <h3 className="text-base font-semibold mb-3">
          Approvals ({agent.approvals.length})
        </h3>
        {agent.approvals.map((approval, i) => (
          <ApprovalCard
            key={i}
            approval={approval}
            org={getOrg(approval.organizationId)}
            getTool={getTool}
            approvedTitle={(org) => `Approved by ${org.name}`}
          />
        ))}
      </div>
    </div>
  );
}
