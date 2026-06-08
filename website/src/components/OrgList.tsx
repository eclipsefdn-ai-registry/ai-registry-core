import { Link } from "react-router-dom";
import type { Organization, McpServer, Tool } from "../types";
import { sanitizeUrl, safeCssColor } from "../sanitize";

export function OrgList({
  organizations,
  servers,
  getToolsForOrg,
}: {
  organizations: Organization[];
  servers: McpServer[];
  getToolsForOrg: (orgId: string) => Tool[];
}) {
  if (organizations.length === 0) {
    return <div className="empty-state">No organizations found</div>;
  }

  return (
    <div className="org-list">
      {organizations.map((org) => {
        const approvalCount = servers.reduce(
          (count, s) =>
            count +
            s.approvals.filter((a) => a.organizationId === org.id).length,
          0,
        );
        const tools = getToolsForOrg(org.id);

        return (
          <div key={org.id} className="org-card">
            <div className="org-card-header">
              {safeCssColor(org.color) && (
                <span
                  className="org-color-dot"
                  style={{ backgroundColor: safeCssColor(org.color) }}
                />
              )}
              <h3>{org.name}</h3>
            </div>
            <p>{org.description}</p>
            {sanitizeUrl(org.website) && (
              <a
                href={sanitizeUrl(org.website)}
                target="_blank"
                rel="noopener noreferrer"
              >
                {org.website}
              </a>
            )}
            <div className="org-tools">
              {tools.map((tool) => (
                <Link
                  key={tool.id}
                  to={`/tools/${tool.id}`}
                  className="badge badge-org badge-link"
                >
                  {tool.name}
                </Link>
              ))}
              <span className="badge badge-verified">
                {approvalCount} approval{approvalCount !== 1 ? "s" : ""}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
