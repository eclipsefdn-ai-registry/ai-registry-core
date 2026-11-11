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
export interface InstallerOptions {
  // skip the installer's own prompts, using the agents it detects
  yes?: boolean;
  agents?: string[];
  global?: boolean;
}

/**
 * The arguments to the skills CLI that install one skill at the path and
 * revision its approval names, or undefined when the installer can't be
 * pointed at them. Installing something other than what was approved is worse
 * than refusing.
 *
 * A pinned approval goes over as source.commit rather than its ref: that is
 * the commit contentHash was computed at, and a tag can be moved afterwards.
 * Any other ref goes over as given, so a branch stays followed.
 *
 * --skill picks the skill by its SKILL.md frontmatter name, which is what
 * `name` is, among those under the path. --full-depth keeps skills 1.7.4 from
 * fetching some GitHub owners' files from skills.sh instead of cloning; it also
 * searches below a SKILL.md at the path, which is why --skill goes on every
 * install, a skill at the repository root included.
 */
export function skillsAddArgs(
  skill: Pick<Skill, "name" | "source" | "contentHash" | "latestHash">,
  options: InstallerOptions,
): string[] | undefined {
  const { ref, commit } = skill.source;
  // Falls back to the ref for a feed that predates source.commit.
  const revision =
    approvedTarget(skill).kind === "pinned" ? (commit ?? ref) : ref;
  const source = skillsSource(
    cliSource(skill.source.url),
    skill.source.path,
    revision,
  );
  if (!source) return undefined;
  const args = ["add", source, "--skill", skill.name, "--full-depth"];
  if (options.agents?.length) args.push("--agent", ...options.agents);
  if (options.global) args.push("--global");
  if (options.yes) args.push("-y");
  return args;
}

/**
 * The source argument that makes skills look only at `path`, at `revision`.
 * Without the path, skills installs the first SKILL.md anywhere in the
 * repository with the name --skill gives.
 *
 * The GitHub shorthand takes both as `owner/repo/<path>#<revision>`. gitlab.com
 * takes a path only in a `/-/tree/<revision>/<path>` URL, which needs a
 * revision without a slash, since the URL's revision ends at the first one.
 * Any other host takes neither. skills reads everything after a `#` as the
 * revision, and splits a skill filter off it at an `@`, so a path can't hold a
 * `#` and a revision can't hold an `@`.
 */
function skillsSource(
  source: string,
  path: string | undefined,
  revision: string | undefined,
): string | undefined {
  if (path?.includes("#") || revision?.includes("@")) return undefined;
  const fragment = revision ? `#${revision}` : "";
  if (OWNER_REPO.test(source)) {
    return `${source}${path ? `/${path}` : ""}${fragment}`;
  }
  if (GITLAB_COM.test(source)) {
    if (!path) return `${source}${fragment}`;
    if (!revision || revision.includes("/")) return undefined;
    return `${source}/-/tree/${revision}/${path}`;
  }
  return path || revision ? undefined : source;
}

/**
 * The environment the skills CLI runs in: this one without the variables that
 * point it at a host other than the source printed as approved. skills
 * resolves the owner/repo shorthand skillsAddArgs passes against GH_HOST, so
 * with it set a GitHub Enterprise user would clone from that host. It fetches
 * files from SKILLS_DOWNLOAD_URL in place of a clone, which --full-depth
 * already skips; dropping it as well keeps that true if a later skills reads
 * it elsewhere.
 */
export function installerEnv(
  env: Record<string, string | undefined>,
): Record<string, string | undefined> {
  const { GH_HOST: _host, SKILLS_DOWNLOAD_URL: _downloadUrl, ...rest } = env;
  return rest;
}
