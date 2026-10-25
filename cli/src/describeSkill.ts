import type { Organization, Skill } from "./types.js";
import { approvedTarget, approvedTargetText } from "./approvedTarget.js";
import { sourceTreeUrl } from "./cliSource.js";

/** One line of the pre-install summary; no name continues the field above. */
export function field(name: string | undefined, value: string): string {
  return `${(name ? `${name}:` : "").padEnd(16)}${value}`;
}

/**
 * What is about to be installed, printed before anything is: the skill, the
 * source at the commit that was hashed, every approval behind it, what the
 * approvals target, and the content hash. `generatedAt` is the feed's, and
 * dates any claim that the source has changed, since a stored latest is only
 * as current as the run that stored it.
 */
export function describeSkill(
  skill: Skill,
  organizations: Organization[],
  generatedAt?: string,
): string[] {
  const orgName = (id: string) =>
    organizations.find((org) => org.id === id)?.name ?? id;
  return [
    `${skill.name} (${skill.skillId})`,
    field("Source", sourceTreeUrl(skill.source)),
    ...skill.approvals.map((approval, i) => {
      const via = approval.viaTrust
        ? `, via trust in ${orgName(approval.viaTrust)}`
        : "";
      return field(
        i === 0 ? "Approved by" : undefined,
        `${orgName(approval.organizationId)}, ${approval.date}${via}`,
      );
    }),
    field("Target", approvedTargetText(approvedTarget(skill), generatedAt)),
    field("Content hash", skill.contentHash),
  ];
}
