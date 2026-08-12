import { useState, useMemo } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { Search, ArrowLeft } from "lucide-react";
import { useOrgRegistryData } from "../hooks/useRegistryData";
import { ServerList } from "../components/ServerList";
import { ServerDetail } from "../components/ServerDetail";
import { SkillList } from "../components/SkillList";
import { SkillDetail } from "../components/SkillDetail";
import { PluginList } from "../components/PluginList";
import { PluginDetail } from "../components/PluginDetail";
import { AgentList } from "../components/AgentList";
import { AgentDetail } from "../components/AgentDetail";
import { NotFoundPage } from "./NotFoundPage";
import { sanitizeUrl, safeCssColor } from "../sanitize";
import { filterByNameDescId } from "../filterArtifacts";

type Tab = "servers" | "skills" | "plugins" | "agents";

const SEARCH_LABELS: Record<Tab, string> = {
  servers: "MCP servers",
  skills: "skills",
  plugins: "plugins",
  agents: "agents",
};

export function OrgPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const { data, error, loading, notFound } = useOrgRegistryData(orgId!);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<Tab>("servers");
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedServerId = searchParams.get("server") ?? undefined;
  const selectedSkillId = searchParams.get("skill") ?? undefined;
  const selectedPluginId = searchParams.get("plugin") ?? undefined;
  const selectedAgentId = searchParams.get("agent") ?? undefined;

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

  const org = data.organizations.find((o) => o.id === orgId);
  const getOrg = (id: string) => data.organizations.find((o) => o.id === id);
  const getTool = (id: string) => data.tools.find((t) => t.id === id);

  const selectedServer = selectedServerId
    ? data.mcp.find((s) => s.serverId === selectedServerId)
    : undefined;

  const selectedSkill = selectedSkillId
    ? (data.skills ?? []).find((s) => s.skillId === selectedSkillId)
    : undefined;

  const selectedPlugin = selectedPluginId
    ? (data.plugins ?? []).find((p) => p.pluginId === selectedPluginId)
    : undefined;

  const selectedAgent = selectedAgentId
    ? (data.agents ?? []).find((a) => a.agentId === selectedAgentId)
    : undefined;

  if (selectedServer) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <ServerDetail
          server={selectedServer}
          getOrg={getOrg}
          getTool={getTool}
          onBack={() => setSearchParams({})}
        />
      </div>
    );
  }

  if (selectedSkill) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <SkillDetail
          skill={selectedSkill}
          getOrg={getOrg}
          getTool={getTool}
          onBack={() => setSearchParams({})}
        />
      </div>
    );
  }

  if (selectedPlugin) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <PluginDetail
          plugin={selectedPlugin}
          getOrg={getOrg}
          getTool={getTool}
          onBack={() => setSearchParams({})}
        />
      </div>
    );
  }

  if (selectedAgent) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <AgentDetail
          agent={selectedAgent}
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
          All organizations
        </Link>
        <div className="flex items-center gap-3 mt-3">
          {org?.color && (
            <span
              className="w-5 h-5 rounded-full shrink-0"
              style={{ backgroundColor: safeCssColor(org?.color) }}
            />
          )}
          <h1 className="text-2xl font-bold">{org?.name ?? orgId}</h1>
        </div>
        {org?.description && (
          <p className="text-muted-foreground mt-1">{org.description}</p>
        )}
        {sanitizeUrl(org?.website) && (
          <a
            href={sanitizeUrl(org?.website)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-primary hover:underline"
          >
            {org?.website}
          </a>
        )}
        <p className="text-muted-foreground mt-1">
          Showing artifacts approved by {org?.name ?? orgId}
        </p>
      </div>

      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
          <input
            type="text"
            placeholder={`Search ${SEARCH_LABELS[tab]} approved by ${org?.name ?? orgId}...`}
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
      {tab === "servers" && (
        <ServerList
          servers={filteredServers}
          getOrg={getOrg}
          onSelect={(id) => setSearchParams({ server: id })}
        />
      )}

      {tab === "skills" && (
        <SkillList
          skills={filteredSkills}
          getOrg={getOrg}
          onSelect={(id) => setSearchParams({ skill: id })}
        />
      )}

      {tab === "plugins" && (
        <PluginList
          plugins={filteredPlugins}
          getOrg={getOrg}
          onSelect={(id) => setSearchParams({ plugin: id })}
        />
      )}

      {tab === "agents" && (
        <AgentList
          agents={filteredAgents}
          getOrg={getOrg}
          onSelect={(id) => setSearchParams({ agent: id })}
        />
      )}
    </div>
  );
}
