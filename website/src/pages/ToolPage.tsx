import { useState, useMemo } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { Search, ArrowLeft } from "lucide-react";
import { useToolRegistryData } from "../hooks/useRegistryData";
import { InstallConfigView } from "../components/ServerDetail";
import { McpVerificationBadge } from "../components/McpVerificationBadge";
import { OrgBadges } from "../components/OrgBadges";
import { NotFoundPage } from "./NotFoundPage";
import type {
  McpServer,
  Skill,
  Plugin,
  Agent,
  Organization,
  Tool,
} from "../types";
import { sanitizeUrl, safeCssColor } from "../sanitize";
import { orgBadge } from "../orgBadge";
import { filterByNameDescId } from "../filterArtifacts";

type Tab = "servers" | "skills" | "plugins" | "agents";

const SEARCH_LABELS: Record<Tab, string> = {
  servers: "MCP servers",
  skills: "skills",
  plugins: "plugins",
  agents: "agents",
};

export function ToolPage() {
  const { toolId } = useParams<{ toolId: string }>();
  const { data, error, loading, notFound } = useToolRegistryData(toolId!);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<Tab>("servers");
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedServerId = searchParams.get("server") ?? undefined;

  const filteredServers = useMemo(() => {
    if (!data) return [];
    return filterByNameDescId(data.mcp, search, (s) => s.serverId);
  }, [data, search]);

  const filteredSkills = useMemo(() => {
    if (!data) return [];
    return filterByNameDescId(data.skills ?? [], search, (s) => s.skillId);
  }, [data, search]);

  const filteredPlugins = useMemo(() => {
    if (!data) return [];
    return filterByNameDescId(data.plugins ?? [], search, (p) => p.pluginId);
  }, [data, search]);

  const filteredAgents = useMemo(() => {
    if (!data) return [];
    return filterByNameDescId(data.agents ?? [], search, (a) => a.agentId);
  }, [data, search]);

  if (notFound) return <NotFoundPage />;
  if (error) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Failed to load data: {error}
      </div>
    );
  }
  if (loading || !data) {
    return (
      <div className="text-center py-12 text-muted-foreground">Loading...</div>
    );
  }

  const tool = data.tools.find((t) => t.id === toolId);
  const org = tool
    ? data.organizations.find((o) => o.id === tool.organizationId)
    : undefined;
  const getOrg = (id: string) => data.organizations.find((o) => o.id === id);
  const getTool = (id: string) => data.tools.find((t) => t.id === id);

  const selectedServer = selectedServerId
    ? data.mcp.find((s) => s.serverId === selectedServerId)
    : undefined;

  if (selectedServer) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <ToolServerDetail
          server={selectedServer}
          toolId={toolId!}
          getOrg={getOrg}
          getTool={getTool}
          onBack={() => setSearchParams({})}
        />
      </div>
    );
  }

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "servers", label: "MCP Servers", count: filteredServers.length },
    { key: "skills", label: "Skills", count: filteredSkills.length },
    { key: "plugins", label: "Plugins", count: filteredPlugins.length },
    { key: "agents", label: "Agents", count: filteredAgents.length },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="mb-8">
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-sm text-primary hover:underline mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          All tools
        </Link>
        <div className="flex items-center gap-3 mt-3">
          {org?.color && (
            <span
              className="w-5 h-5 rounded-full shrink-0"
              style={{ backgroundColor: safeCssColor(org?.color) }}
            />
          )}
          <h1 className="text-2xl font-bold">{tool?.name ?? toolId}</h1>
        </div>
        {org && <p className="text-muted-foreground mt-1">by {org.name}</p>}
        <p className="text-muted-foreground mt-1">
          Showing artifacts approved for {tool?.name ?? toolId}
        </p>
      </div>

      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <input
            type="text"
            placeholder={`Search ${SEARCH_LABELS[tab]} for ${tool?.name ?? toolId}...`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-12 h-12 text-base bg-card border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-ring/50 placeholder:text-muted-foreground"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-end mb-8 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => {
              setTab(t.key);
              setSearch("");
            }}
            className={`h-11 px-4 text-sm font-medium border-b-2 transition-colors ${
              tab === t.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label} ({t.count})
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "servers" &&
        (filteredServers.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {filteredServers.map((server) => (
              <ToolServerCard
                key={server.serverId}
                server={server}
                toolId={toolId!}
                getOrg={getOrg}
                getTool={getTool}
                onSelect={(id) => setSearchParams({ server: id })}
              />
            ))}
          </div>
        ) : (
          <div className="py-12 text-center text-muted-foreground border border-dashed border-border rounded-xl">
            No servers found.
          </div>
        ))}

      {tab === "skills" &&
        (filteredSkills.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {filteredSkills.map((skill) => (
              <ToolSkillCard
                key={skill.skillId}
                skill={skill}
                toolId={toolId!}
                getOrg={getOrg}
                getTool={getTool}
              />
            ))}
          </div>
        ) : (
          <div className="py-12 text-center text-muted-foreground border border-dashed border-border rounded-xl">
            No skills found.
          </div>
        ))}

      {tab === "plugins" &&
        (filteredPlugins.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {filteredPlugins.map((plugin) => (
              <ToolPluginCard
                key={plugin.pluginId}
                plugin={plugin}
                toolId={toolId!}
                getOrg={getOrg}
                getTool={getTool}
              />
            ))}
          </div>
        ) : (
          <div className="py-12 text-center text-muted-foreground border border-dashed border-border rounded-xl">
            No plugins found.
          </div>
        ))}

      {tab === "agents" &&
        (filteredAgents.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {filteredAgents.map((agent) => (
              <ToolAgentCard
                key={agent.agentId}
                agent={agent}
                toolId={toolId!}
                getOrg={getOrg}
                getTool={getTool}
              />
            ))}
          </div>
        ) : (
          <div className="py-12 text-center text-muted-foreground border border-dashed border-border rounded-xl">
            No agents found.
          </div>
        ))}
    </div>
  );
}

function ToolServerCard({
  server,
  toolId,
  getOrg,
  getTool,
  onSelect,
}: {
  server: McpServer;
  toolId: string;
  getOrg: (id: string) => Organization | undefined;
  getTool: (id: string) => Tool | undefined;
  onSelect: (id: string) => void;
}) {
  const toolApproval = server.approvals.find((a) =>
    a.installConfigs.some((ic) => ic.tool === toolId),
  );

  return (
    <div
      className="group bg-card border border-border rounded-xl p-5 hover:border-primary/50 transition-all shadow-sm flex flex-col cursor-pointer"
      onClick={() => onSelect(server.serverId)}
    >
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <h3 className="text-base font-semibold text-foreground">
            {server.name}
          </h3>
          <McpVerificationBadge server={server} getOrg={getOrg} interactive />
        </div>
        <div className="font-mono text-xs text-muted-foreground mb-3">
          {server.serverId}
        </div>
        <p className="text-sm text-foreground mb-3 line-clamp-3 break-words">
          {server.description}
        </p>
        <div className="flex gap-2 mb-3 flex-wrap">
          <OrgBadges
            approvals={server.approvals}
            getOrg={getOrg}
            approvedTitle={(org) => `Approved by ${org.name}`}
          />
        </div>
        {toolApproval && (
          <div className="mb-3">
            {toolApproval.installConfigs.map((config, j) => (
              <InstallConfigView
                key={j}
                config={config}
                getTool={getTool}
                compact
              />
            ))}
          </div>
        )}
      </div>
      <button className="w-full py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted/50 transition-colors mt-auto text-foreground">
        View Details
      </button>
    </div>
  );
}

function ToolServerDetail({
  server,
  toolId,
  getOrg,
  getTool,
  onBack,
}: {
  server: McpServer;
  toolId: string;
  getOrg: (id: string) => Organization | undefined;
  getTool: (id: string) => Tool | undefined;
  onBack: () => void;
}) {
  const toolApproval = server.approvals.find((a) =>
    a.installConfigs.some((ic) => ic.tool === toolId),
  );
  const otherApprovals = server.approvals.filter((a) => a !== toolApproval);

  return (
    <div className="bg-card border border-primary/50 rounded-xl p-6 shadow-md">
      <button
        className="inline-flex items-center gap-1 text-sm text-primary hover:underline mb-4"
        onClick={onBack}
      >
        <ArrowLeft className="h-4 w-4" />
        Back to list
      </button>
      <h2 className="text-xl font-bold mb-1">{server.name}</h2>
      <p className="text-muted-foreground mb-4">{server.description}</p>
      <div className="flex gap-3 mb-6 flex-wrap items-center text-sm">
        <McpVerificationBadge server={server} getOrg={getOrg} />
        <span className="text-muted-foreground font-mono text-xs">
          {server.serverId}
        </span>
        {server.latestVersion && (
          <span className="text-muted-foreground">
            Latest: {server.latestVersion}
          </span>
        )}
      </div>

      {toolApproval && (
        <div className="mb-6">
          <h3 className="text-base font-semibold mb-3">Installation</h3>
          <div className="bg-background border border-border rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3 text-sm flex-wrap">
              {(() => {
                const approvalOrg = getOrg(toolApproval.organizationId);
                const badge = orgBadge(approvalOrg, {
                  fallbackId: toolApproval.organizationId,
                  approvedTitle: approvalOrg
                    ? `Approved by ${approvalOrg.name}`
                    : "",
                });
                return (
                  <span
                    className={`inline-flex text-xs px-2 py-0.5 rounded-full border bg-primary/10 text-primary border-primary/20 cursor-help ${
                      badge.inferred ? "border-dashed" : ""
                    }`}
                    title={badge.title}
                  >
                    {badge.text}
                  </span>
                );
              })()}
              <span className="text-muted-foreground">
                Approved: {toolApproval.date}
              </span>
              {toolApproval.version && (
                <span className="text-muted-foreground">
                  Version: {toolApproval.version}
                </span>
              )}
            </div>
            {toolApproval.installConfigs.map((config, j) => (
              <InstallConfigView key={j} config={config} getTool={getTool} />
            ))}
          </div>
        </div>
      )}

      {otherApprovals.length > 0 && (
        <div>
          <h3 className="text-base font-semibold mb-3">Also approved by</h3>
          <div className="flex gap-2 flex-wrap">
            {otherApprovals.map((a, i) => {
              const approvalOrg = getOrg(a.organizationId);
              const badge = orgBadge(approvalOrg, {
                fallbackId: a.organizationId,
                approvedTitle: approvalOrg
                  ? `Approved by ${approvalOrg.name}`
                  : "",
              });
              return (
                <span
                  key={i}
                  className={`inline-flex text-xs px-2 py-0.5 rounded-full border bg-primary/10 text-primary border-primary/20 cursor-help ${
                    badge.inferred ? "border-dashed" : ""
                  }`}
                  title={badge.title}
                >
                  {badge.text}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function ToolSkillCard({
  skill,
  toolId,
  getOrg,
  getTool,
}: {
  skill: Skill;
  toolId: string;
  getOrg: (id: string) => Organization | undefined;
  getTool: (id: string) => Tool | undefined;
}) {
  const toolApproval = skill.approvals.find((a) =>
    a.installConfigs.some((ic) => ic.tool === toolId),
  );
  const installConfig = toolApproval?.installConfigs[0];
  const toolObj = getTool(toolId);

  return (
    <div className="group bg-card border border-border rounded-xl p-5 hover:border-primary/50 transition-all shadow-sm flex flex-col">
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <h3 className="text-base font-semibold text-foreground">
            {skill.name}
          </h3>
          <OrgBadges
            approvals={skill.approvals}
            getOrg={getOrg}
            approvedTitle={(org) => `Approved by ${org.name}`}
          />
        </div>
        <div className="font-mono text-xs text-muted-foreground mb-3">
          {skill.skillId}
        </div>
        <p className="text-sm text-foreground mb-3 line-clamp-3 break-words">
          {skill.description}
        </p>
        {sanitizeUrl(installConfig?.installUrl) && (
          <div className="mt-2 p-3 bg-card border border-border rounded-md text-sm mb-3">
            {toolObj && (
              <div className="font-medium text-muted-foreground mb-1">
                Tool: {toolObj.name}
              </div>
            )}
            <a
              href={sanitizeUrl(installConfig?.installUrl)}
              className="inline-flex items-center gap-1 px-3 py-1 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
              onClick={(e) => e.stopPropagation()}
            >
              Install
            </a>
          </div>
        )}
        <div className="flex gap-3 text-xs text-muted-foreground font-mono">
          <span>Hash: {skill.contentHash}</span>
        </div>
      </div>
    </div>
  );
}

function ToolPluginCard({
  plugin,
  toolId,
  getOrg,
  getTool,
}: {
  plugin: Plugin;
  toolId: string;
  getOrg: (id: string) => Organization | undefined;
  getTool: (id: string) => Tool | undefined;
}) {
  const toolApproval = plugin.approvals.find((a) =>
    a.installConfigs.some((ic) => ic.tool === toolId),
  );

  return (
    <div className="group bg-card border border-border rounded-xl p-5 hover:border-primary/50 transition-all shadow-sm flex flex-col">
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <h3 className="text-base font-semibold text-foreground">
            {plugin.name}
          </h3>
          <OrgBadges
            approvals={plugin.approvals}
            getOrg={getOrg}
            approvedTitle={(org) => `Approved by ${org.name}`}
          />
        </div>
        <div className="font-mono text-xs text-muted-foreground mb-3">
          {plugin.pluginId}
        </div>
        <p className="text-sm text-foreground mb-3 line-clamp-3 break-words">
          {plugin.description}
        </p>
        {toolApproval && (
          <div className="mb-3">
            {toolApproval.installConfigs.map((config, j) => (
              <InstallConfigView
                key={j}
                config={config}
                getTool={getTool}
                compact
              />
            ))}
          </div>
        )}
        <div className="flex gap-3 text-xs text-muted-foreground font-mono">
          <span>Hash: {plugin.contentHash}</span>
        </div>
      </div>
    </div>
  );
}

function ToolAgentCard({
  agent,
  toolId,
  getOrg,
  getTool,
}: {
  agent: Agent;
  toolId: string;
  getOrg: (id: string) => Organization | undefined;
  getTool: (id: string) => Tool | undefined;
}) {
  const toolApproval = agent.approvals.find((a) =>
    a.installConfigs.some((ic) => ic.tool === toolId),
  );

  return (
    <div className="group bg-card border border-border rounded-xl p-5 hover:border-primary/50 transition-all shadow-sm flex flex-col">
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <h3 className="text-base font-semibold text-foreground">
            {agent.name}
          </h3>
          <OrgBadges
            approvals={agent.approvals}
            getOrg={getOrg}
            approvedTitle={(org) => `Approved by ${org.name}`}
          />
        </div>
        <div className="font-mono text-xs text-muted-foreground mb-3">
          {agent.agentId}
        </div>
        <p className="text-sm text-foreground mb-3 line-clamp-3 break-words">
          {agent.description}
        </p>
        {toolApproval && (
          <div className="mb-3">
            {toolApproval.installConfigs.map((config, j) => (
              <InstallConfigView
                key={j}
                config={config}
                getTool={getTool}
                compact
              />
            ))}
          </div>
        )}
        <div className="flex gap-3 text-xs text-muted-foreground font-mono">
          <span>Hash: {agent.contentHash}</span>
        </div>
      </div>
    </div>
  );
}
