import { useState, useMemo } from "react";
import { useParams, useSearchParams, Link } from "react-router-dom";
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
    return <div className="empty-state">Failed to load data: {error}</div>;
  }
  if (loading || !data) {
    return <div className="empty-state">Loading...</div>;
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
      <div className="app">
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
    <div className="app">
      <div className="tool-header">
        <Link to="/" className="back-link">
          &larr; All tools
        </Link>
        <div className="tool-header-title">
          {safeCssColor(org?.color) && (
            <span
              className="org-color-dot org-color-dot-lg"
              style={{ backgroundColor: safeCssColor(org?.color) }}
            />
          )}
          <h1>{tool?.name ?? toolId}</h1>
        </div>
        {org && <p>by {org.name}</p>}
        <p className="tool-header-subtitle">
          Showing artifacts approved for {tool?.name ?? toolId}
        </p>
      </div>

      <div className="search-bar">
        <input
          type="text"
          placeholder={`Search servers for ${tool?.name ?? toolId}...`}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {filteredServers.length > 0 && (
        <>
          <h2>MCP Servers ({filteredServers.length})</h2>
          <div className="server-list">
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
          <h2>Skills ({filteredSkills.length})</h2>
          <div className="server-list">
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
        <div className="empty-state">No artifacts found</div>
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
    <div className="server-card" onClick={() => onSelect(server.serverId)}>
      <div className="server-card-header">
        <h3>{server.name}</h3>
        {server.mcpRegistryVerified ? (
          <span className="badge badge-verified">Verified</span>
        ) : (
          <span className="badge badge-unverified">Unverified</span>
        )}
      </div>
      <p>{server.description}</p>
      {toolApproval && (
        <div className="tool-install-configs">
          {toolApproval.installConfigs
            .filter((ic) => ic.tool === toolId)
            .map((config, j) => (
              <InstallConfigView key={j} config={config} getTool={getTool} />
            ))}
        </div>
      )}
      {otherOrgs.length > 0 && (
        <div className="also-approved">
          Also approved by: {otherOrgs.join(", ")}
        </div>
      )}
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
    <div className="server-detail">
      <button className="back-link" onClick={onBack}>
        &larr; Back to list
      </button>
      <h2>{server.name}</h2>
      <p>{server.description}</p>
      <div className="meta-row">
        {server.mcpRegistryVerified ? (
          <span className="badge badge-verified">Verified</span>
        ) : (
          <span className="badge badge-unverified">Unverified</span>
        )}
        <span>{server.serverId}</span>
        {server.latestVersion && <span>Latest: {server.latestVersion}</span>}
      </div>

      {toolApproval && (
        <div className="approvals-section">
          <h3>Installation</h3>
          <div className="approval-card">
            <div className="approval-card-header">
              <span className="badge badge-org">
                {getOrg(toolApproval.organizationId)?.name ??
                  toolApproval.organizationId}
              </span>
              <span>Approved: {toolApproval.date}</span>
              {toolApproval.version && (
                <span>Version: {toolApproval.version}</span>
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
        <div className="approvals-section">
          <h3>Also approved by</h3>
          <div className="also-approved-list">
            {otherApprovals.map((a, i) => {
              const org = getOrg(a.organizationId);
              return (
                <span key={i} className="badge badge-org">
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
    <div className="server-card">
      <div className="server-card-header">
        <h3>{skill.name}</h3>
        {skill.approvals.map((a) => {
          const org = getOrg(a.organizationId);
          return org ? (
            <span key={a.organizationId} className="badge badge-org">
              {org.name}
            </span>
          ) : undefined;
        })}
      </div>
      <p>{skill.description}</p>
      {sanitizeUrl(installConfig?.installUrl) && (
        <div className="tool-install-configs">
          <div className="install-config">
            {toolObj && <div className="label">Tool: {toolObj.name}</div>}
            <a
              href={sanitizeUrl(installConfig?.installUrl)}
              className="install-link"
              onClick={(e) => e.stopPropagation()}
            >
              Install
            </a>
          </div>
        </div>
      )}
      <div className="server-card-meta">
        <span>{skill.skillId}</span>
        <span>Hash: {skill.contentHash}</span>
      </div>
    </div>
  );
}
