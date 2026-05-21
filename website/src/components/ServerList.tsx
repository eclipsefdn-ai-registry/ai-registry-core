import type { McpServer, Organization } from "../types";

export function ServerList({
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
              <span
                className="badge badge-verified"
                title="This server exists in the Anthropic MCP registry"
              >
                Verified
              </span>
            ) : (
              <span
                className="badge badge-unverified"
                title="This server was not found in the Anthropic MCP registry"
              >
                Unverified
              </span>
            )}
            {server.approvals.map((a) => {
              const org = getOrg(a.organizationId);
              return org ? (
                <span
                  key={a.organizationId}
                  className="badge badge-org"
                  title={`Approved by ${org.name} — this organization has reviewed and endorsed this server for use with their tools`}
                >
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
