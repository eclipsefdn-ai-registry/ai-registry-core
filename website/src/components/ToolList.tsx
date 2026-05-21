import { Link } from "react-router-dom";
import type { Tool, Organization } from "../types";

export function ToolList({
  tools,
  getOrg,
}: {
  tools: Tool[];
  getOrg: (id: string) => Organization | undefined;
}) {
  if (tools.length === 0) {
    return <div className="empty-state">No tools found</div>;
  }

  return (
    <div className="tool-list">
      {tools.map((tool) => {
        const org = getOrg(tool.organizationId);
        return (
          <Link key={tool.id} to={`/tools/${tool.id}`} className="tool-card">
            <div className="tool-card-header">
              {org?.color && (
                <span
                  className="org-color-dot"
                  style={{ backgroundColor: org.color }}
                />
              )}
              <h3>{tool.name}</h3>
            </div>
            {org && <p className="tool-card-org">by {org.name}</p>}
            <span className="tool-card-link">View approved servers &rarr;</span>
          </Link>
        );
      })}
    </div>
  );
}
