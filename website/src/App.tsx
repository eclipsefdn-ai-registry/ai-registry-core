import { useState, useEffect, useMemo } from "react";
import type {
  RegistryData,
  McpServer,
  Organization,
  Tool,
  Approval,
  InstallConfig,
} from "./types";

type Tab = "servers" | "organizations";

function App() {
  const [data, setData] = useState<RegistryData | undefined>();
  const [error, setError] = useState<string | undefined>();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<Tab>("servers");
  const [selectedServerId, setSelectedServerId] = useState<
    string | undefined
  >();

  useEffect(() => {
    fetch(import.meta.env.BASE_URL + "api/v1/all.json")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((d: RegistryData) => setData(d))
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : String(e));
      });
  }, []);

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

  if (error) {
    return (
      <div className="app">
        <div className="empty-state">Failed to load registry data: {error}</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="app">
        <div className="empty-state">Loading...</div>
      </div>
    );
  }

  const selectedServer = selectedServerId
    ? data.mcp.find((s) => s.serverId === selectedServerId)
    : undefined;

  const getOrg = (id: string) => data.organizations.find((o) => o.id === id);
  const getTool = (id: string) => data.tools.find((t) => t.id === id);
  const getToolsForOrg = (orgId: string) =>
    data.tools.filter((t) => t.organizationId === orgId);

  return (
    <div className="app">
      <header className="header">
        <h1>AI Registry</h1>
        <p>
          Vendor-neutral trust registry for AI artifacts — currently MCP servers
        </p>
      </header>

      <div className="stats">
        <span>
          <strong>{data.mcp.length}</strong> MCP server
          {data.mcp.length !== 1 ? "s" : ""}
        </span>
        <span>
          <strong>{data.organizations.length}</strong> organization
          {data.organizations.length !== 1 ? "s" : ""}
        </span>
        <span>
          <strong>{data.tools.length}</strong> tool
          {data.tools.length !== 1 ? "s" : ""}
        </span>
      </div>

      {selectedServer ? (
        <ServerDetail
          server={selectedServer}
          getOrg={getOrg}
          getTool={getTool}
          onBack={() => setSelectedServerId(undefined)}
        />
      ) : (
        <>
          <div className="search-bar">
            <input
              type="text"
              placeholder="Search servers and organizations..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="tabs">
            <button
              className={`tab ${tab === "servers" ? "active" : ""}`}
              onClick={() => setTab("servers")}
            >
              MCP Servers ({filteredServers.length})
            </button>
            <button
              className={`tab ${tab === "organizations" ? "active" : ""}`}
              onClick={() => setTab("organizations")}
            >
              Organizations ({filteredOrgs.length})
            </button>
          </div>

          {tab === "servers" && (
            <ServerList
              servers={filteredServers}
              getOrg={getOrg}
              onSelect={setSelectedServerId}
            />
          )}

          {tab === "organizations" && (
            <OrgList
              organizations={filteredOrgs}
              servers={data.mcp}
              getToolsForOrg={getToolsForOrg}
            />
          )}
        </>
      )}
    </div>
  );
}

function ServerList({
  servers,
  getOrg,
  onSelect,
}: {
  servers: McpServer[];
  getOrg: (id: string) => Organization | undefined;
  onSelect: (id: string) => void;
}) {
  if (servers.length === 0) {
    return <div className="empty-state">No servers found</div>;
  }

  return (
    <div className="server-list">
      {servers.map((server) => (
        <div
          key={server.serverId}
          className="server-card"
          onClick={() => onSelect(server.serverId)}
        >
          <div className="server-card-header">
            <h3>{server.name}</h3>
            {server.mcpRegistryVerified ? (
              <span className="badge badge-verified">Verified</span>
            ) : (
              <span className="badge badge-unverified">Unverified</span>
            )}
            {server.approvals.map((a) => {
              const org = getOrg(a.organizationId);
              return org ? (
                <span key={a.organizationId} className="badge badge-org">
                  {org.name}
                </span>
              ) : undefined;
            })}
          </div>
          <p>{server.description}</p>
          <div className="server-card-meta">
            <span>
              {server.approvals.length} approval
              {server.approvals.length !== 1 ? "s" : ""}
            </span>
            <span>{server.serverId}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function ServerDetail({
  server,
  getOrg,
  getTool,
  onBack,
}: {
  server: McpServer;
  getOrg: (id: string) => Organization | undefined;
  getTool: (id: string) => Tool | undefined;
  onBack: () => void;
}) {
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
      </div>

      <div className="approvals-section">
        <h3>Approvals ({server.approvals.length})</h3>
        {server.approvals.map((approval, i) => (
          <ApprovalCard
            key={i}
            approval={approval}
            org={getOrg(approval.organizationId)}
            getTool={getTool}
          />
        ))}
      </div>
    </div>
  );
}

function ApprovalCard({
  approval,
  org,
  getTool,
}: {
  approval: Approval;
  org: Organization | undefined;
  getTool: (id: string) => Tool | undefined;
}) {
  return (
    <div className="approval-card">
      <div className="approval-card-header">
        <span className="badge badge-org">
          {org?.name ?? approval.organizationId}
        </span>
        <span>Approved: {approval.date}</span>
        {approval.version && <span>Version: {approval.version}</span>}
      </div>
      {approval.installConfigs.map((config, j) => (
        <InstallConfigView key={j} config={config} getTool={getTool} />
      ))}
    </div>
  );
}

function InstallConfigView({
  config,
  getTool,
}: {
  config: InstallConfig;
  getTool: (id: string) => Tool | undefined;
}) {
  const tool = config.tool ? getTool(config.tool) : undefined;

  return (
    <div className="install-config">
      {tool && <div className="label">Tool: {tool.name}</div>}
      {config.installUrl && (
        <div>
          <a href={config.installUrl}>Install</a>
        </div>
      )}
      {config.openVsxUrl && (
        <div>
          <a href={config.openVsxUrl}>Open VSX Extension</a>
        </div>
      )}
      {config.config && <pre>{JSON.stringify(config.config, null, 2)}</pre>}
      {config.instructions && (
        <div className="instructions">{config.instructions}</div>
      )}
    </div>
  );
}

function OrgList({
  organizations,
  servers,
  getToolsForOrg,
}: {
  organizations: Organization[];
  servers: McpServer[];
  getToolsForOrg: (orgId: string) => Tool[];
}) {
  if (organizations.length === 0) {
    return <div className="empty-state">No organizations found</div>;
  }

  return (
    <div className="org-list">
      {organizations.map((org) => {
        const approvalCount = servers.reduce(
          (count, s) =>
            count +
            s.approvals.filter((a) => a.organizationId === org.id).length,
          0,
        );
        const tools = getToolsForOrg(org.id);

        return (
          <div key={org.id} className="org-card">
            <div className="org-card-header">
              {org.color && (
                <span
                  className="org-color-dot"
                  style={{ backgroundColor: org.color }}
                />
              )}
              <h3>{org.name}</h3>
            </div>
            <p>{org.description}</p>
            <a href={org.website} target="_blank" rel="noopener noreferrer">
              {org.website}
            </a>
            <div className="org-tools">
              {tools.map((tool) => (
                <span key={tool.id} className="badge badge-org">
                  {tool.name}
                </span>
              ))}
              <span className="badge badge-verified">
                {approvalCount} approval{approvalCount !== 1 ? "s" : ""}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default App;
