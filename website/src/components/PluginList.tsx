import type { Plugin, Organization } from "../types";
import { safeCssColor } from "../sanitize";
import { orgBadge } from "../orgBadge";

export function PluginList({
  plugins,
  getOrg,
  onSelect,
}: {
  plugins: Plugin[];
  getOrg: (id: string) => Organization | undefined;
  onSelect: (id: string) => void;
}) {
  if (plugins.length === 0) {
    return (
      <div className="py-12 text-center text-muted-foreground border border-dashed border-border rounded-xl">
        No plugins found.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {plugins.map((plugin) => {
        const summary = contentsSummary(plugin);
        return (
          <div
            key={plugin.pluginId}
            className="group bg-card border border-border rounded-xl p-5 hover:border-primary/50 transition-all shadow-sm flex flex-col cursor-pointer"
            onClick={() => onSelect(plugin.pluginId)}
          >
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <h3 className="text-base font-semibold text-foreground">
                  {plugin.name}
                </h3>
              </div>
              <div className="font-mono text-xs text-muted-foreground mb-3">
                {plugin.pluginId}
              </div>
              <p className="text-sm text-foreground mb-2 line-clamp-3 break-words">
                {plugin.description}
              </p>
              {summary && (
                <div className="text-xs text-muted-foreground mb-4">
                  {summary}
                </div>
              )}
              <div className="flex gap-2 mb-4 flex-wrap">
                {plugin.approvals.map((a) => {
                  const org = getOrg(a.organizationId);
                  if (!org) return undefined;
                  const badge = orgBadge(org, {
                    fallbackId: a.organizationId,
                    approvedTitle: `Approved by ${org.name}`,
                  });
                  return (
                    <span
                      key={a.organizationId}
                      className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full border border-border bg-background cursor-help hover:opacity-80 transition-opacity ${
                        badge.inferred ? "border-dashed" : ""
                      }`}
                      title={badge.title}
                    >
                      {org.color && (
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ backgroundColor: safeCssColor(org.color) }}
                        />
                      )}
                      {badge.text}
                    </span>
                  );
                })}
              </div>
            </div>
            <button className="w-full py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted/50 transition-colors mt-auto text-foreground">
              View Details
            </button>
          </div>
        );
      })}
    </div>
  );
}

function contentsSummary(plugin: Plugin): string | undefined {
  const parts: string[] = [];
  const skillCount = plugin.containedSkills.length;
  const mcpCount = plugin.containedMcpServers.length;
  if (skillCount > 0) {
    parts.push(`${skillCount} skill${skillCount === 1 ? "" : "s"}`);
  }
  if (mcpCount > 0) {
    parts.push(`${mcpCount} MCP server${mcpCount === 1 ? "" : "s"}`);
  }
  return parts.length > 0 ? parts.join(" · ") : undefined;
}
