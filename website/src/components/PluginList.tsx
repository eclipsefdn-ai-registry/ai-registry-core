import type { Plugin, Organization } from "../types";
import { ArtifactList } from "./ArtifactList";

export function PluginList({
  plugins,
  getOrg,
  onSelect,
}: {
  plugins: Plugin[];
  getOrg: (id: string) => Organization | undefined;
  onSelect: (id: string) => void;
}) {
  return (
    <ArtifactList
      items={plugins}
      getId={(plugin) => plugin.pluginId}
      getOrg={getOrg}
      onSelect={onSelect}
      emptyLabel="No plugins found."
      approvedTitle={(org) => `Approved by ${org.name}`}
      renderExtra={(plugin) => {
        const summary = contentsSummary(plugin);
        return summary ? (
          <div className="text-xs text-muted-foreground mb-4">{summary}</div>
        ) : null;
      }}
    />
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
