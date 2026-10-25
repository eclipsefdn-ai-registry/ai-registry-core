import type { Organization, Skill } from "./types.js";
import { approvedTarget, approvedTargetText } from "./approvedTarget.js";
import { sourceTreeUrl } from "./cliSource.js";

const label = (name?: string) => (name ? `${name}:` : "").padEnd(16);

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
    `${label("Source")}${sourceTreeUrl(skill.source)}`,
    ...skill.approvals.map((approval, i) => {
      const via = approval.viaTrust
        ? `, via trust in ${orgName(approval.viaTrust)}`
        : "";
      return `${label(i === 0 ? "Approved by" : undefined)}${orgName(approval.organizationId)}, ${approval.date}${via}`;
    }),
    `${label("Target")}${approvedTargetText(approvedTarget(skill), generatedAt)}`,
    `${label("Content hash")}${skill.contentHash}`,
  ];
}
