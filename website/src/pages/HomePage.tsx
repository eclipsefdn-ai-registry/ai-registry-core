import { useState, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useAllRegistryData } from "../hooks/useRegistryData";
import { ServerList } from "../components/ServerList";
import { ServerDetail } from "../components/ServerDetail";
import { SkillList } from "../components/SkillList";
import { SkillDetail } from "../components/SkillDetail";
import { OrgList } from "../components/OrgList";
import { ToolList } from "../components/ToolList";

type Tab = "servers" | "skills" | "tools" | "organizations";

const SEARCH_PLACEHOLDERS: Record<Tab, string> = {
  servers: "Search MCP servers...",
  skills: "Search skills...",
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

  const filteredServers = useMemo(() => {
    if (!data) return [];
    const q = search.toLowerCase();
    return data.mcp.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.serverId.toLowerCase().includes(q),
    );
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
    const q = search.toLowerCase();
    return (data.skills ?? []).filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.skillId.toLowerCase().includes(q),
    );
  }, [data, search]);

  if (error) {
    return (
      <div className="empty-state">Failed to load registry data: {error}</div>
    );
  }
  if (loading || !data) {
    return <div className="empty-state">Loading...</div>;
  }

  const selectedServer = selectedServerId
    ? data.mcp.find((s) => s.serverId === selectedServerId)
    : undefined;

  const selectedSkill = selectedSkillId
    ? (data.skills ?? []).find((s) => s.skillId === selectedSkillId)
    : undefined;

  const getOrg = (id: string) => data.organizations.find((o) => o.id === id);
  const getTool = (id: string) => data.tools.find((t) => t.id === id);
  const getToolsForOrg = (orgId: string) =>
    data.tools.filter((t) => t.organizationId === orgId);

  if (selectedServer) {
    return (
      <div className="app">
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
      <div className="app">
        <SkillDetail
          skill={selectedSkill}
          getOrg={getOrg}
          getTool={getTool}
          onBack={() => setSearchParams({})}
        />
      </div>
    );
  }

  return (
    <div className="app">
      <div className="home-header">
        <h1>Vendor-neutral trust registry for AI artifacts</h1>
        <p>MCP servers and Agent Skills</p>
      </div>

      <div className="search-bar">
        <input
          type="text"
          placeholder={SEARCH_PLACEHOLDERS[tab]}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="tabs">
        <button
          className={`tab ${tab === "servers" ? "active" : ""}`}
          onClick={() => {
            setTab("servers");
            setSearch("");
          }}
        >
          MCP Servers ({filteredServers.length})
        </button>
        <button
          className={`tab ${tab === "skills" ? "active" : ""}`}
          onClick={() => {
            setTab("skills");
            setSearch("");
          }}
        >
          Skills ({filteredSkills.length})
        </button>
        <button
          className={`tab ${tab === "tools" ? "active" : ""}`}
          onClick={() => {
            setTab("tools");
            setSearch("");
          }}
        >
          Tools ({filteredTools.length})
        </button>
        <button
          className={`tab ${tab === "organizations" ? "active" : ""}`}
          onClick={() => {
            setTab("organizations");
            setSearch("");
          }}
        >
          Organizations ({filteredOrgs.length})
        </button>
      </div>

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

      {tab === "tools" && <ToolList tools={filteredTools} getOrg={getOrg} />}

      {tab === "organizations" && (
        <OrgList
          organizations={filteredOrgs}
          servers={data.mcp}
          getToolsForOrg={getToolsForOrg}
        />
      )}
    </div>
  );
}
