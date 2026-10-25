import type {
  Organization,
  Plugin,
  PluginApproval,
  Skill,
  SkillApproval,
} from "./types.js";
import { approvedTarget, approvedTargetText } from "./approvedTarget.js";
import { sourceTreeUrl } from "./cliSource.js";

/** One line of the pre-install summary; no name continues the field above. */
export function field(name: string | undefined, value: string): string {
  return `${(name ? `${name}:` : "").padEnd(16)}${value}`;
}

/** One field over several lines, or "none" when there is nothing to list. */
function list(name: string, values: string[]): string[] {
  if (!values.length) return [field(name, "none")];
  return values.map((value, i) => field(i === 0 ? name : undefined, value));
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
  return [
    `${skill.name} (${skill.skillId})`,
    ...describeApproved(skill, organizations, generatedAt),
  ];
}

/**
 * describeSkill for a plugin, plus its version and what installing it brings
 * along: the skills and MCP servers it contains. An approval that came
 * through a marketplace says so, since the organization vouched for the
 * marketplace file rather than reviewing this plugin.
 */
export function describePlugin(
  plugin: Plugin,
  organizations: Organization[],
  generatedAt?: string,
): string[] {
  return [
    `${plugin.name} (${plugin.pluginId})`,
    ...(plugin.version ? [field("Version", plugin.version)] : []),
    ...describeApproved(plugin, organizations, generatedAt),
    ...list(
      "Skills",
      plugin.containedSkills.map((skill) => skill.name),
    ),
    ...list(
      "MCP servers",
      plugin.containedMcpServers.map(
        (server) => `${server.name} (${server.transport})`,
      ),
    ),
  ];
}

// The lines every type shares: the source, the approvals, the approved target
// and the content hash.
function describeApproved(
  entry: Pick<Skill, "source" | "contentHash" | "latestHash"> & {
    approvals: (SkillApproval | PluginApproval)[];
  },
  organizations: Organization[],
  generatedAt?: string,
): string[] {
  const orgName = (id: string) =>
    organizations.find((org) => org.id === id)?.name ?? id;
  const approvals = entry.approvals.map((approval) => {
    const via = approval.viaTrust
      ? `, via trust in ${orgName(approval.viaTrust)}`
      : "";
    const marketplace =
      "sourcedFrom" in approval && approval.sourcedFrom
        ? `, through the marketplace at ${approval.sourcedFrom.marketplaceUrl}`
        : "";
    return `${orgName(approval.organizationId)}, ${approval.date}${via}${marketplace}`;
  });
  if (entry.approvals.some((a) => "sourcedFrom" in a && a.sourcedFrom)) {
    approvals.push(
      "(approved through a marketplace: the organization vouched for the marketplace, not for this entry on its own)",
    );
  }
  return [
    field("Source", sourceTreeUrl(entry.source)),
    ...list("Approved by", approvals),
    field("Target", approvedTargetText(approvedTarget(entry), generatedAt)),
    field("Content hash", entry.contentHash),
  ];
}
