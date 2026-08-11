import type { Skill, Organization } from "../types";
import { ArtifactList } from "./ArtifactList";

export function SkillList({
  skills,
  getOrg,
  onSelect,
}: {
  skills: Skill[];
  getOrg: (id: string) => Organization | undefined;
  onSelect: (id: string) => void;
}) {
  return (
    <ArtifactList
      items={skills}
      getId={(skill) => skill.skillId}
      getOrg={getOrg}
      onSelect={onSelect}
      emptyLabel="No skills found."
      approvedTitle={(org) => `Approved by ${org.name}`}
    />
  );
}
