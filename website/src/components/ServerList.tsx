import type { McpServer, Organization } from "../types";
import { McpVerificationBadge } from "./McpVerificationBadge";
import { ArtifactList } from "./ArtifactList";

export function ServerList({
  servers,
  getOrg,
  onSelect,
}: {
  servers: McpServer[];
  getOrg: (id: string) => Organization | undefined;
  onSelect: (id: string) => void;
}) {
  return (
    <ArtifactList
      items={servers}
      getId={(server) => server.serverId}
      getOrg={getOrg}
      onSelect={onSelect}
      emptyLabel="No servers found."
      approvedTitle={(org) =>
        `Approved by ${org.name} — this organization has reviewed and endorsed this server for use with their tools`
      }
      renderBadge={(server) => (
        <McpVerificationBadge server={server} getOrg={getOrg} interactive />
      )}
    />
  );
}
