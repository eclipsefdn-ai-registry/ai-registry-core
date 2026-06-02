import type { Skill, Organization } from "../types";

export function SkillList({
  skills,
  getOrg,
  onSelect,
}: {
  skills: Skill[];
  getOrg: (id: string) => Organization | undefined;
  onSelect: (id: string) => void;
}) {
  if (skills.length === 0) {
    return <div className="empty-state">No skills found</div>;
  }

  return (
    <div className="server-list">
      {skills.map((skill) => (
        <div
          key={skill.skillId}
          className="server-card"
          onClick={() => onSelect(skill.skillId)}
        >
          <div className="server-card-header">
            <h3>{skill.name}</h3>
            {skill.approvals.map((a) => {
              const org = getOrg(a.organizationId);
              return org ? (
                <span
                  key={a.organizationId}
                  className="badge badge-org"
                  title={`Approved by ${org.name}`}
                >
                  {org.name}
                </span>
              ) : undefined;
            })}
          </div>
          <p>{skill.description}</p>
          <div className="server-card-meta">
            <span>
              {skill.approvals.length} approval
              {skill.approvals.length !== 1 ? "s" : ""}
            </span>
            <span>{skill.skillId}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
