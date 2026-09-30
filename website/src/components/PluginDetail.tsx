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
import { sourceTreeUrl } from "../cliSource";
import { pluginsCommand } from "../installCommand";
import { sourceLinkTitle } from "../approvedTarget";
import { InstallFromCli, InstallFromCliUnavailable } from "./InstallFromCli";
import { ApprovedTarget } from "./ApprovedTarget";

export function PluginDetail({
  plugin,
  getOrg,
  getTool,
  onBack,
  generatedAt,
}: {
  plugin: Plugin;
  getOrg: (id: string) => Organization | undefined;
  getTool: (id: string) => Tool | undefined;
  onBack: () => void;
  generatedAt?: string;
}) {
  const sourceUrl = sourceTreeUrl(plugin.source);
  // Undefined whenever the approval names a ref, which the plugins CLI can't
  // target yet; see pluginsCommand.
  const installCommand = pluginsCommand(plugin);

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
        <ApprovedTarget entry={plugin} generatedAt={generatedAt} />
        {/* Labelled as the manifest's, and printed as published: nothing ties
            it to the ref, and a plugin pinned to 2.6.0 can declare 1.0.0. */}
        {plugin.version && (
          <span
            className="text-muted-foreground text-xs cursor-help"
            title="What plugin.json declares at the commit this entry's hash was computed at, which is separate from any ref the approval names."
          >
            plugin.json version {plugin.version}
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
            title={sourceLinkTitle(plugin.source.commit)}
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

      {installCommand ? (
        <InstallFromCli command={installCommand} />
      ) : (
        <InstallFromCliUnavailable>
          Installing the approved version isn't currently possible with{" "}
          <code>npx plugins add</code>. This approval names{" "}
          <code>{plugin.source.ref}</code>, and the plugins CLI always installs
          from the repository's default branch.
        </InstallFromCliUnavailable>
      )}
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
