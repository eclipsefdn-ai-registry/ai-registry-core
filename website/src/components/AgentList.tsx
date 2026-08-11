import type { Agent, Organization } from "../types";
import { ArtifactList } from "./ArtifactList";

export function AgentList({
  agents,
  getOrg,
  onSelect,
}: {
  agents: Agent[];
  getOrg: (id: string) => Organization | undefined;
  onSelect: (id: string) => void;
}) {
  return (
    <ArtifactList
      items={agents}
      getId={(agent) => agent.agentId}
      getOrg={getOrg}
      onSelect={onSelect}
      emptyLabel="No agents found."
      approvedTitle={(org) => `Approved by ${org.name}`}
    />
  );
}
