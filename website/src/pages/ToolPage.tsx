import { useState, useMemo } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
import { Search, ShieldCheck, AlertTriangle, ArrowLeft } from "lucide-react";
import { useToolRegistryData } from "../hooks/useRegistryData";
import { InstallConfigView } from "../components/ServerDetail";
import { NotFoundPage } from "./NotFoundPage";
import type { McpServer, Skill, Organization, Tool } from "../types";
import { sanitizeUrl, safeCssColor } from "../sanitize";

export function ToolPage() {
  const { toolId } = useParams<{ toolId: string }>();
  const { data, error, loading, notFound } = useToolRegistryData(toolId!);
  const [search, setSearch] = useState("");
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedServerId = searchParams.get("server") ?? undefined;

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
            placeholder={`Search servers for ${tool?.name ?? toolId}...`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-12 h-12 text-base bg-card border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-ring/50 placeholder:text-muted-foreground"
          />
        </div>
      </div>

      {filteredServers.length > 0 && (
        <>
          <h2 className="text-lg font-semibold mb-4">
            MCP Servers ({filteredServers.length})
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
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
        </>
      )}

      {filteredSkills.length > 0 && (
        <>
          <h2 className="text-lg font-semibold mb-4">
            Skills ({filteredSkills.length})
          </h2>
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
        </>
      )}

      {filteredServers.length === 0 && filteredSkills.length === 0 && (
        <div className="py-12 text-center text-muted-foreground border border-dashed border-border rounded-xl">
          No artifacts found.
        </div>
      )}
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
  const otherOrgs = server.approvals
    .filter((a) => a !== toolApproval)
    .map((a) => getOrg(a.organizationId)?.name ?? a.organizationId)
    .filter(Boolean);

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
          {server.mcpRegistryVerified ? (
            <span className="inline-flex items-center gap-1 text-xs font-normal px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
              <ShieldCheck className="h-3 w-3" />
              Verified
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs font-normal px-2 py-0.5 rounded-full bg-warning-bg text-warning border border-warning/20">
              <AlertTriangle className="h-3 w-3" />
              Unverified
            </span>
          )}
        </div>
        <p className="text-sm text-foreground mb-3">{server.description}</p>
        {toolApproval && (
          <div className="mb-3">
            {toolApproval.installConfigs
              .filter((ic) => ic.tool === toolId)
              .map((config, j) => (
                <InstallConfigView key={j} config={config} getTool={getTool} />
              ))}
          </div>
        )}
        {otherOrgs.length > 0 && (
          <p className="text-xs text-muted-foreground italic">
            Also approved by: {otherOrgs.join(", ")}
          </p>
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
        {server.mcpRegistryVerified ? (
          <span className="inline-flex items-center gap-1 text-xs font-normal px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
            <ShieldCheck className="h-3 w-3" />
            Verified
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-xs font-normal px-2 py-0.5 rounded-full bg-warning-bg text-warning border border-warning/20">
            <AlertTriangle className="h-3 w-3" />
            Unverified
          </span>
        )}
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
              <span className="inline-flex text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                {getOrg(toolApproval.organizationId)?.name ??
                  toolApproval.organizationId}
              </span>
              <span className="text-muted-foreground">
                Approved: {toolApproval.date}
              </span>
              {toolApproval.version && (
                <span className="text-muted-foreground">
                  Version: {toolApproval.version}
                </span>
              )}
            </div>
            {toolApproval.installConfigs
              .filter((ic) => ic.tool === toolId)
              .map((config, j) => (
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
              const org = getOrg(a.organizationId);
              return (
                <span
                  key={i}
                  className="inline-flex text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20"
                >
                  {org?.name ?? a.organizationId}
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
  const installConfig = toolApproval?.installConfigs.find(
    (ic) => ic.tool === toolId,
  );
  const toolObj = getTool(toolId);

  return (
    <div className="group bg-card border border-border rounded-xl p-5 hover:border-primary/50 transition-all shadow-sm flex flex-col">
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <h3 className="text-base font-semibold text-foreground">
            {skill.name}
          </h3>
          {skill.approvals.map((a) => {
            const org = getOrg(a.organizationId);
            return org ? (
              <span
                key={a.organizationId}
                className="inline-flex text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20"
              >
                {org.name}
              </span>
            ) : undefined;
          })}
        </div>
        <p className="text-sm text-foreground mb-3">{skill.description}</p>
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
          <span>{skill.skillId}</span>
          <span>Hash: {skill.contentHash}</span>
        </div>
      </div>
    </div>
  );
}
