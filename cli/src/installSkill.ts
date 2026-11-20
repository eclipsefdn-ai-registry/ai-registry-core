import { describeSkill, field, organizationNamer } from "./describeSkill.js";
import { loadSkillsFeed } from "./registry.js";
import {
  approvalGate,
  confirmInstall,
  type InstallContext,
} from "./install.js";
import type { Deps } from "./run.js";
import { skillsAddArgs, type InstallerOptions } from "./skillsAdd.js";
import type { SkillsFeed } from "./types.js";

/**
 * `install skill <id>`: installs one skill through the skills CLI, after
 * describing it and checking the guardrail. Resolves to the exit code, the
 * skills CLI's own once it runs.
 */
export async function installSkill(
  id: string,
  options: InstallerOptions,
  context: InstallContext,
  deps: Deps,
): Promise<number> {
  const { registry } = context;
  let skillsFeed: SkillsFeed;
  try {
    skillsFeed = await loadSkillsFeed(registry);
  } catch (error) {
    deps.printErr((error as Error).message);
    return 1;
  }

  // Exact match only: a near miss installed in its place would be something
  // nobody asked for.
  const skill = skillsFeed.skills.find((s) => s.skillId === id);
  if (!skill) {
    deps.printErr(`No skill with id ${id} in the registry at ${registry}.`);
    return 1;
  }
  const orgName = organizationNamer(await context.organizations);
  for (const line of describeSkill(skill, orgName, skillsFeed.generatedAt)) {
    deps.printErr(line);
  }
  if (!approvalGate(skill.approvals, context.guardrail, orgName, deps)) {
    return 1;
  }

  const args = skillsAddArgs(skill, options);
  // Never falls back to the default branch or a search by name: either would
  // install content nobody approved.
  if (!args) {
    const target = [skill.source.path, skill.source.ref]
      .filter(Boolean)
      .join(" at ");
    deps.printErr(
      `Not installing: the skills CLI can't be pointed at ${target} in ${skill.source.url}, and anything else would install something other than what was approved.`,
    );
    return 1;
  }
  deps.printErr(field("Command", `skills ${args.join(" ")}`));

  if (!(await confirmInstall(options.yes, deps))) return 1;
  return deps.runSkills(args);
}
