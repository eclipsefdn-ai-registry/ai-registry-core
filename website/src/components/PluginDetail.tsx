import { ArrowLeft } from "lucide-react";
import type {
  Plugin,
  Organization,
  Tool,
  ContainedSkill,
  ContainedMcpServer,
} from "../types";
import { sanitizeUrl } from "../sanitize";
import { ApprovalCard } from "./ServerDetail";
import { cliSource } from "../cliSource";
import { InstallFromCli } from "./InstallFromCli";

export function PluginDetail({
  plugin,
  getOrg,
  getTool,
  onBack,
}: {
  plugin: Plugin;
  getOrg: (id: string) => Organization | undefined;
  getTool: (id: string) => Tool | undefined;
  onBack: () => void;
}) {
  const sourceUrl = plugin.source.path
    ? `${plugin.source.url.replace(/\.git$/, "")}/tree/main/${plugin.source.path}`
    : plugin.source.url.replace(/\.git$/, "");
  // The plugins CLI takes a source and nothing else, so a plugin stored in a
  // subdirectory resolves by discovery rather than by path.
  const installCommand = `npx plugins add ${cliSource(plugin.source.url)}`;

  return (
    <div className="bg-card border border-primary/50 rounded-xl p-6 shadow-md">
      <button
        className="inline-flex items-center gap-1 text-sm text-primary hover:underline mb-4"
        onClick={onBack}
      >
        <ArrowLeft className="h-4 w-4" />
        Back to list
      </button>
      <h2 className="text-xl font-bold mb-1">{plugin.name}</h2>
      <p className="text-muted-foreground mb-4">{plugin.description}</p>
      <div className="flex gap-3 mb-4 flex-wrap items-center text-sm">
        <span className="text-muted-foreground font-mono text-xs">
          {plugin.pluginId}
        </span>
        {plugin.version && (
          <span className="text-muted-foreground text-xs">
            v{plugin.version}
          </span>
        )}
        <span className="text-muted-foreground text-xs">
          Hash: {plugin.contentHash}
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
        {sanitizeUrl(plugin.homepage) && (
          <a
            href={sanitizeUrl(plugin.homepage)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline text-sm"
          >
            Homepage
          </a>
        )}
      </div>
      {plugin.author && (
        <div className="text-sm text-muted-foreground mb-4">
          By {plugin.author}
        </div>
      )}
      {plugin.keywords && plugin.keywords.length > 0 && (
        <div className="flex gap-2 flex-wrap mb-6">
          {/* Keywords come straight from the manifest, unlike contained
              skills/servers below which are keyed on unique fields — dedupe
              here since a repeated keyword would otherwise collide on key. */}
          {[...new Set(plugin.keywords)].map((keyword) => (
            <span
              key={keyword}
              className="text-xs px-2 py-0.5 rounded-full border border-border bg-muted/30 text-muted-foreground"
            >
              {keyword}
            </span>
          ))}
        </div>
      )}

      <ContainedComponents
        skills={plugin.containedSkills}
        mcpServers={plugin.containedMcpServers}
      />

      <div>
        <h3 className="text-base font-semibold mb-3">
          Approvals ({plugin.approvals.length})
        </h3>
        {plugin.approvals.map((approval, i) => (
          <ApprovalCard
            key={i}
            approval={approval}
            org={getOrg(approval.organizationId)}
            getTool={getTool}
            approvedTitle={(org) => `Approved by ${org.name}`}
          />
        ))}
      </div>

      <InstallFromCli command={installCommand} />
    </div>
  );
}

// Read-only for now — a future cross-link pass can match these by id against
// standalone SkillEntry/McpEntry entries and swap the plain text below for
// links to their registry detail pages.
function ContainedComponents({
  skills,
  mcpServers,
}: {
  skills: ContainedSkill[];
  mcpServers: ContainedMcpServer[];
}) {
  if (skills.length === 0 && mcpServers.length === 0) return null;

  return (
    <div className="mb-6">
      <h3 className="text-base font-semibold mb-3">Contains</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {skills.length > 0 && (
          <div className="bg-background border border-border rounded-lg p-3">
            <div className="text-sm font-medium text-muted-foreground mb-2">
              Skills ({skills.length})
            </div>
            <ul className="space-y-1">
              {skills.map((skill) => (
                <li key={skill.path} className="text-sm">
                  <span className="font-medium">{skill.name}</span>
                  {skill.description && (
                    <span className="text-muted-foreground">
                      {" "}
                      — {skill.description}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
        {mcpServers.length > 0 && (
          <div className="bg-background border border-border rounded-lg p-3">
            <div className="text-sm font-medium text-muted-foreground mb-2">
              MCP servers ({mcpServers.length})
            </div>
            <ul className="space-y-1">
              {mcpServers.map((server) => (
                <li key={server.name} className="text-sm">
                  <span className="font-medium">{server.name}</span>
                  {server.transport && (
                    <span className="text-muted-foreground">
                      {" "}
                      ({server.transport})
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
