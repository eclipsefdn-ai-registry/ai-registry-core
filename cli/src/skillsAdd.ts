import type { Skill } from "./types.js";
import { approvedTarget } from "./approvedTarget.js";
import { cliSource } from "./cliSource.js";

// Mirrors the rules of skillsCommand in website/src/installCommand.ts by hand:
// keep them in sync. The two source forms the skills CLI reads a `#ref`
// fragment from, given what cliSource produces: the GitHub `owner/repo`
// shorthand, and a gitlab.com URL, nested groups included. On any other host
// the ref would stay glued to the URL, and HTTP drops a URL's fragment, so the
// installer would quietly clone the default branch instead of failing.
const OWNER_REPO = /^[^/:]+\/[^/:]+$/;
const GITLAB_COM = /^https:\/\/gitlab\.com\/[^/]+\/.+$/;

/** What the user may pass through to the installer; nothing else is. */
export interface SkillInstallerOptions {
  // skip the installer's own prompts, using the agents it detects
  yes?: boolean;
  agents?: string[];
  global?: boolean;
}

/**
 * The arguments to the skills CLI that install one skill at the revision its
 * approval names, or undefined when the approval names a ref the installer
 * can't carry. Installing something other than what was approved is worse
 * than refusing.
 *
 * A pinned approval goes over as source.commit rather than its ref: that is
 * the commit contentHash was computed at, and a tag can be moved afterwards.
 * Any other ref goes over as given, so a branch stays followed.
 */
export function skillsAddArgs(
  skill: Pick<Skill, "name" | "source" | "contentHash" | "latestHash">,
  options: SkillInstallerOptions,
): string[] | undefined {
  const source = cliSource(skill.source.url);
  const { ref, commit } = skill.source;
  if (ref && !OWNER_REPO.test(source) && !GITLAB_COM.test(source)) {
    return undefined;
  }
  // Falls back to the ref for a feed that predates source.commit.
  const revision =
    approvedTarget(skill).kind === "pinned" ? (commit ?? ref) : ref;
  const args = ["add", `${source}${revision ? `#${revision}` : ""}`];
  // A repository holding several skills needs --skill to pick this one; the
  // flag matches on the SKILL.md frontmatter name, which is what `name` is.
  if (skill.source.path) args.push("--skill", skill.name);
  if (options.agents?.length) args.push("--agent", ...options.agents);
  if (options.global) args.push("--global");
  if (options.yes) args.push("-y");
  return args;
}
