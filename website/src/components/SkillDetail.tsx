import type { Skill, Organization, Tool, SkillApproval } from "../types";

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
    <div className="server-detail">
      <button className="back-link" onClick={onBack}>
        &larr; Back to list
      </button>
      <h2>{skill.name}</h2>
      <p>{skill.description}</p>
      <div className="meta-row">
        <span>{skill.skillId}</span>
        <span>Hash: {skill.contentHash}</span>
        <a href={sourceUrl} target="_blank" rel="noopener noreferrer">
          Source
        </a>
      </div>

      <div className="approvals-section">
        <h3>Approvals ({skill.approvals.length})</h3>
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
    <div className="approval-card">
      <div className="approval-card-header">
        <span
          className="badge badge-org"
          title={
            org ? `Approved by ${org.name}` : "Approved by this organization"
          }
        >
          {org?.name ?? approval.organizationId}
        </span>
        <span>Approved: {approval.date}</span>
      </div>
      {approval.installConfigs.map((config, j) => {
        const tool = getTool(config.tool);
        return (
          <div key={j} className="install-config">
            {tool && <div className="label">Tool: {tool.name}</div>}
            {config.installUrl && (
              <div>
                <a
                  href={config.installUrl}
                  className="install-link"
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
