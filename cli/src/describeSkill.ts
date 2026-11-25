import type { Organization, Skill, SkillApproval } from "./types.js";
import { approvedTarget, approvedTargetText } from "./approvedTarget.js";
import { sourceTreeUrl } from "./cliSource.js";

/** Names an organization for display, falling back to its id. */
export function organizationNamer(
  organizations: Organization[],
): (id: string) => string {
  return (id) => organizations.find((org) => org.id === id)?.name ?? id;
}

/** One line of the pre-install summary; no name continues the field above. */
export function field(name: string | undefined, value: string): string {
  return `${(name ? `${name}:` : "").padEnd(16)}${value}`;
}

/**
 * One line per approval, under an "Approved by" field: who approved, when,
 * and the organization whose judgement a trust-derived approval rests on.
 */
export function approvalLines(
  approvals: Pick<SkillApproval, "organizationId" | "date" | "viaTrust">[],
  orgName: (id: string) => string,
): string[] {
  return approvals.map((approval, i) => {
    const via = approval.viaTrust
      ? `, via trust in ${orgName(approval.viaTrust)}`
      : "";
    return field(
      i === 0 ? "Approved by" : undefined,
      `${orgName(approval.organizationId)}, ${approval.date}${via}`,
    );
  });
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
  orgName: (id: string) => string,
  generatedAt?: string,
): string[] {
  return [
    `${skill.name} (${skill.skillId})`,
    field("Source", sourceTreeUrl(skill.source)),
    ...approvalLines(skill.approvals, orgName),
    field("Target", approvedTargetText(approvedTarget(skill), generatedAt)),
    field("Content hash", skill.contentHash),
  ];
}
