import { useState, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Search, ShieldCheck } from "lucide-react";
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
    return data.mcp
      .filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          s.serverId.toLowerCase().includes(q),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
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
    return (data.skills ?? [])
      .filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.description.toLowerCase().includes(q) ||
          s.skillId.toLowerCase().includes(q),
      )
      .sort((a, b) => a.name.localeCompare(b.name));
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

  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: "servers", label: "MCP Servers", count: filteredServers.length },
    { key: "skills", label: "Skills", count: filteredSkills.length },
    { key: "tools", label: "Tools", count: filteredTools.length },
    {
      key: "organizations",
      label: "Organizations",
      count: filteredOrgs.length,
    },
  ];

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
            Find trusted AI artifacts.
          </h1>

          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mb-10 leading-relaxed">
            Currently MCP servers and skills. More artifact types coming soon.
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

          <p className="text-sm text-muted-foreground mb-2">
            Open governance. Free to use. No single vendor controls the catalog.
          </p>
        </div>
      </section>

      {/* Registry Browser */}
      <section className="pt-6 pb-24">
        <div className="max-w-5xl mx-auto px-4">
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

          {tab === "tools" && (
            <ToolList tools={filteredTools} getOrg={getOrg} />
          )}

          {tab === "organizations" && (
            <OrgList
              organizations={filteredOrgs}
              servers={data.mcp}
              skills={data.skills ?? []}
              getToolsForOrg={getToolsForOrg}
            />
          )}
        </div>
      </section>
    </div>
  );
}
