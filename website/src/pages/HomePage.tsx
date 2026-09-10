import { useState, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Search, ShieldCheck } from "lucide-react";
import { useAllRegistryData } from "../hooks/useRegistryData";
import { ServerList } from "../components/ServerList";
import { ServerDetail } from "../components/ServerDetail";
import { SkillList } from "../components/SkillList";
import { SkillDetail } from "../components/SkillDetail";
import { PluginList } from "../components/PluginList";
import { PluginDetail } from "../components/PluginDetail";
import { AgentList } from "../components/AgentList";
import { AgentDetail } from "../components/AgentDetail";
import { OrgList } from "../components/OrgList";
import { ToolList } from "../components/ToolList";
import { SandboxExtensionList } from "../components/SandboxExtensionList";
import { SandboxExtensionDetail } from "../components/SandboxExtensionDetail";
import { BrowserTabsRow } from "../components/BrowserTabsRow";
import type { BrowserTab } from "../browserTabs";
import { filterByNameDescId } from "../filterArtifacts";

type Tab = BrowserTab;

const SEARCH_PLACEHOLDERS: Record<Tab, string> = {
  servers: "Search MCP servers...",
  skills: "Search agent skills...",
  plugins: "Search agent plugins...",
  agents: "Search agents...",
  "sandbox-tools": "Search sandbox tool extensions...",
  "sandbox-features": "Search sandbox feature extensions...",
  tools: "Search tools...",
  organizations: "Search organizations...",
};

export function HomePage() {
  const { data, error, loading } = useAllRegistryData();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<Tab>("servers");
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedServerId = searchParams.get("server") ?? undefined;
  const selectedSkillId = searchParams.get("skill") ?? undefined;
  const selectedPluginId = searchParams.get("plugin") ?? undefined;
  const selectedAgentId = searchParams.get("agent") ?? undefined;
  const selectedSandboxToolId = searchParams.get("sandboxTool") ?? undefined;
  const selectedSandboxFeatureId =
    searchParams.get("sandboxFeature") ?? undefined;

  const filteredServers = useMemo(() => {
    if (!data) return [];
    return filterByNameDescId(data.mcp, search, (s) => s.serverId);
  }, [data, search]);

  const filteredOrgs = useMemo(() => {
    if (!data) return [];
    const q = search.toLowerCase();
    return data.organizations.filter(
      (o) =>
        o.name.toLowerCase().includes(q) ||
        o.description.toLowerCase().includes(q),
    );
  }, [data, search]);

  const filteredTools = useMemo(() => {
    if (!data) return [];
    const q = search.toLowerCase();
    return data.tools.filter(
      (t) => t.name.toLowerCase().includes(q) || t.id.toLowerCase().includes(q),
    );
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

  const filteredSandboxTools = useMemo(() => {
    if (!data) return [];
    return filterByNameDescId(
      data.sandboxTools ?? [],
      search,
      (e) => e.sandboxExtensionId,
    );
  }, [data, search]);

  const filteredSandboxFeatures = useMemo(() => {
    if (!data) return [];
    return filterByNameDescId(
      data.sandboxFeatures ?? [],
      search,
      (e) => e.sandboxExtensionId,
    );
  }, [data, search]);

  if (error) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        Failed to load registry data: {error}
      </div>
    );
  }
  if (loading || !data) {
    return (
      <div className="text-center py-12 text-muted-foreground">Loading...</div>
    );
  }

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

  const selectedSandboxExtension = selectedSandboxToolId
    ? (data.sandboxTools ?? []).find(
        (e) => e.sandboxExtensionId === selectedSandboxToolId,
      )
    : selectedSandboxFeatureId
      ? (data.sandboxFeatures ?? []).find(
          (e) => e.sandboxExtensionId === selectedSandboxFeatureId,
        )
      : undefined;

  const getOrg = (id: string) => data.organizations.find((o) => o.id === id);
  const getTool = (id: string) => data.tools.find((t) => t.id === id);
  const getToolsForOrg = (orgId: string) =>
    data.tools.filter((t) => t.organizationId === orgId);

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

  if (selectedSandboxExtension) {
    return (
      <div className="max-w-6xl mx-auto px-4 py-8">
        <SandboxExtensionDetail
          extension={selectedSandboxExtension}
          getOrg={getOrg}
          onBack={() => setSearchParams({})}
        />
      </div>
    );
  }

  const tabs: Record<Tab, { label: string; count: number }> = {
    servers: { label: "MCP Servers", count: filteredServers.length },
    skills: { label: "Skills", count: filteredSkills.length },
    plugins: { label: "Plugins", count: filteredPlugins.length },
    agents: { label: "Agents", count: filteredAgents.length },
    "sandbox-tools": {
      label: "Sandbox Tools",
      count: filteredSandboxTools.length,
    },
    "sandbox-features": {
      label: "Sandbox Features",
      count: filteredSandboxFeatures.length,
    },
    tools: { label: "Tools", count: filteredTools.length },
    organizations: { label: "Organizations", count: filteredOrgs.length },
  };

  return (
    <div>
      {/* Hero */}
      <section className="pt-20 pb-6">
        <div className="max-w-4xl mx-auto px-4 text-center flex flex-col items-center">
          <span className="inline-flex items-center gap-1.5 mb-6 px-3 py-1 text-xs font-medium rounded-full border border-primary/20 bg-primary/10 text-primary">
            <ShieldCheck className="h-3.5 w-3.5" />
            Backed by the Eclipse Foundation
          </span>

          <h1 className="text-4xl md:text-6xl font-bold tracking-tight text-foreground mb-6">
            Find AI tools you can trust.
          </h1>

          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mb-10 leading-relaxed">
            Discover MCP servers, agent skills, agent plugins, A2A agents, and
            sandbox extensions, with transparent provenance and approval signals
            from participating tool providers.
          </p>

          <div className="w-full max-w-2xl mb-3">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <input
                type="search"
                placeholder={SEARCH_PLACEHOLDERS[tab]}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-12 h-14 text-base bg-card border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-ring/50 placeholder:text-muted-foreground"
              />
            </div>
          </div>

          <p className="text-sm text-muted-foreground mb-6">
            Open source. Open governance. Built for interoperability.
          </p>

          <Link
            to="/about"
            className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg border border-primary/20 bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
          >
            Join as a tool provider
          </Link>
        </div>
      </section>

      {/* Registry Browser */}
      <section className="pt-6 pb-24">
        <div className="max-w-6xl mx-auto px-4">
          <BrowserTabsRow
            tabs={tabs}
            active={tab}
            onSelect={(key) => {
              setTab(key);
              setSearch("");
            }}
          />

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

          {tab === "sandbox-tools" && (
            <SandboxExtensionList
              extensions={filteredSandboxTools}
              emptyLabel="No sandbox tool extensions found."
              getOrg={getOrg}
              onSelect={(id) => setSearchParams({ sandboxTool: id })}
            />
          )}

          {tab === "sandbox-features" && (
            <SandboxExtensionList
              extensions={filteredSandboxFeatures}
              emptyLabel="No sandbox feature extensions found."
              getOrg={getOrg}
              onSelect={(id) => setSearchParams({ sandboxFeature: id })}
            />
          )}

          {tab === "tools" && (
            <ToolList tools={filteredTools} getOrg={getOrg} />
          )}

          {tab === "organizations" && (
            <OrgList
              organizations={filteredOrgs}
              servers={data.mcp}
              skills={data.skills ?? []}
              plugins={data.plugins ?? []}
              agents={data.agents ?? []}
              sandboxTools={data.sandboxTools ?? []}
              sandboxFeatures={data.sandboxFeatures ?? []}
              getToolsForOrg={getToolsForOrg}
            />
          )}
        </div>
      </section>
    </div>
  );
}
