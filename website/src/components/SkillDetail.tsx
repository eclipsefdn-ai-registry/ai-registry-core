import { ArrowLeft } from "lucide-react";
import type { Skill, Organization, Tool, SkillApproval } from "../types";
import { sanitizeUrl } from "../sanitize";

export function SkillDetail({
  skill,
  getOrg,
  getTool,
  onBack,
}: {
  skill: Skill;
  getOrg: (id: string) => Organization | undefined;
  getTool: (id: string) => Tool | undefined;
  onBack: () => void;
}) {
  const sourceUrl = skill.source.path
    ? `${skill.source.url.replace(/\.git$/, "")}/tree/main/${skill.source.path}`
    : skill.source.url.replace(/\.git$/, "");

  return (
    <div className="bg-card border border-primary/50 rounded-xl p-6 shadow-md">
      <button
        className="inline-flex items-center gap-1 text-sm text-primary hover:underline mb-4"
        onClick={onBack}
      >
        <ArrowLeft className="h-4 w-4" />
        Back to list
      </button>
      <h2 className="text-xl font-bold mb-1">{skill.name}</h2>
      <p className="text-muted-foreground mb-4">{skill.description}</p>
      <div className="flex gap-3 mb-6 flex-wrap items-center text-sm">
        <span className="text-muted-foreground font-mono text-xs">
          {skill.skillId}
        </span>
        <span className="text-muted-foreground text-xs">
          Hash: {skill.contentHash}
        </span>
        {sanitizeUrl(sourceUrl) && (
          <a
            href={sanitizeUrl(sourceUrl)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline text-sm"
          >
            Source
          </a>
        )}
      </div>

      <div>
        <h3 className="text-base font-semibold mb-3">
          Approvals ({skill.approvals.length})
        </h3>
        {skill.approvals.map((approval, i) => (
          <SkillApprovalCard
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

function SkillApprovalCard({
  approval,
  org,
  getTool,
}: {
  approval: SkillApproval;
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
      </div>
      {approval.installConfigs.map((config, j) => {
        const tool = getTool(config.tool);
        return (
          <div
            key={j}
            className="mt-2 p-3 bg-card border border-border rounded-md text-sm"
          >
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
          </div>
        );
      })}
    </div>
  );
}
