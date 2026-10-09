import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import type {
  Organization,
  McpServer,
  Skill,
  Plugin,
  Agent,
  SandboxExtension,
  Tool,
} from "../types";
import { sanitizeUrl, safeCssColor } from "../sanitize";
import { INFERRED_DISCLAIMER } from "../orgBadge";
import { filterByOrgs } from "../filterArtifacts";
import { approvedArtifactsLabel } from "../approvedArtifacts";

// Counts artifacts rather than approvals, through the same filter as the
// homepage's organization filter, so the number on the tile is what the
// organization's page lists. Every artifact type counts the same way, so the
// lists are summed through one helper — a seventh type should not mean a
// seventh copy.
function countApprovedArtifacts(
  orgId: string,
  artifactLists: { approvals: { organizationId: string }[] }[][],
): number {
  return filterByOrgs(artifactLists.flat(), [orgId]).length;
}

export function OrgList({
  organizations,
  servers,
  skills,
  plugins,
  agents,
  sandboxTools,
  sandboxFeatures,
  getToolsForOrg,
}: {
  organizations: Organization[];
  servers: McpServer[];
  skills: Skill[];
  plugins: Plugin[];
  agents: Agent[];
  sandboxTools: SandboxExtension[];
  sandboxFeatures: SandboxExtension[];
  getToolsForOrg: (orgId: string) => Tool[];
}) {
  if (organizations.length === 0) {
    return (
      <div className="py-12 text-center text-muted-foreground border border-dashed border-border rounded-xl">
        No organizations found.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {organizations.map((org) => {
        const artifactCount = countApprovedArtifacts(org.id, [
          servers,
          skills,
          plugins,
          agents,
          sandboxTools,
          sandboxFeatures,
        ]);
        const tools = getToolsForOrg(org.id);

        return (
          <div
            key={org.id}
            className="bg-card border border-border rounded-xl p-5 hover:border-primary/50 transition-all shadow-sm flex flex-col"
          >
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                {org.color && (
                  <span
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: safeCssColor(org.color) }}
                  />
                )}
                <h3 className="text-base font-semibold text-foreground">
                  {org.name}
                </h3>
                {org.inferred && (
                  <span
                    className="inline-flex text-xs px-2 py-0.5 rounded-full border border-dashed border-border bg-background cursor-help"
                    title={INFERRED_DISCLAIMER}
                  >
                    Inferred
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground mb-3 line-clamp-3 break-words">
                {org.description}
              </p>
              {sanitizeUrl(org.website) && (
                <a
                  href={sanitizeUrl(org.website)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-primary hover:underline"
                >
                  {org.website}
                </a>
              )}
            </div>
            {tools.length > 0 && (
              <div className="flex gap-2 flex-wrap mt-4">
                {tools.map((tool) => (
                  <Link
                    key={tool.id}
                    to={`/tools/${tool.id}`}
                    className="inline-flex text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors no-underline"
                  >
                    {tool.name}
                  </Link>
                ))}
              </div>
            )}
            <Link
              to={`/orgs/${org.id}`}
              className="inline-flex items-center text-sm font-medium text-primary mt-4 no-underline"
            >
              {approvedArtifactsLabel(artifactCount)}
              <ChevronRight className="h-4 w-4 ml-1" />
            </Link>
          </div>
        );
      })}
    </div>
  );
}
