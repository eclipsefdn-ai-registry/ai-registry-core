import type { Plugin, Skill } from "./types";
import { approvedTarget } from "./approvedTarget";
import { cliSource } from "./cliSource";

// The two source forms the skills CLI reads a `#ref` fragment from, given what
// cliSource produces: the GitHub `owner/repo` shorthand, and a gitlab.com URL,
// nested groups included. It also reads one after an `https://….git` URL, but
// cliSource strips the `.git`, so a ref on any other host would stay glued to
// the URL. HTTP drops a URL's fragment, so that command would quietly clone the
// default branch instead of failing.
const OWNER_REPO = /^[^/:]+\/[^/:]+$/;
const GITLAB_COM = /^https:\/\/gitlab\.com\/[^/]+\/.+$/;

/**
 * Builds the `npx skills add` command that installs one skill at the revision
 * its approval names.
 *
 * `owner/repo#<ref>` checked against skills 1.7.0, where the fragment is parsed
 * and implemented but not in the README: the CLI clones with `--branch <ref>`,
 * falls back to fetching a full commit SHA directly, and records the ref in its
 * lock file so `skills update` keeps following it.
 *
 * A pinned approval goes over as source.commit rather than its ref. That is the
 * commit contentHash was computed at, and a tag can be moved afterwards while a
 * commit can't. Any other ref goes over as given, so for a branch the lock file
 * records the branch and `skills update` follows it. Without source.pinned,
 * approvedTarget can tell a tag from a branch only once the tag's hash has
 * changed, so until then an unchanged tag goes over as given too.
 *
 * Returns undefined when the approval names a ref the command can't carry. A
 * command that installs something other than what was approved is worse than
 * none.
 */
export function skillsCommand(
  skill: Pick<Skill, "name" | "source" | "contentHash" | "latestHash">,
): string | undefined {
  const source = cliSource(skill.source.url);
  const { ref, commit } = skill.source;
  if (ref && !OWNER_REPO.test(source) && !GITLAB_COM.test(source)) {
    return undefined;
  }
  // Falls back to the ref for a feed that predates source.commit.
  const revision =
    approvedTarget(skill).kind === "pinned" ? (commit ?? ref) : ref;
  // A repository holding several skills needs --skill to pick this one; when
  // the skill is the repository root there is nothing to disambiguate. The
  // flag matches on the SKILL.md frontmatter name, which is what `name` is.
  return `npx skills add ${source}${revision ? `#${revision}` : ""}${
    skill.source.path ? ` --skill ${skill.name}` : ""
  }`;
}

/**
 * Builds the `npx plugins add` command for a plugin, or returns undefined when
 * the approval names a ref.
 *
 * Keyed to the CLI's capability, not to `source.pinned`: plugins 1.3.4 runs
 * `git clone --depth 1` with no ref and has no flag for one, so a branch ref is
 * as unreachable as a tag. The plugins CLI takes a source and nothing else, so
 * a plugin in a subdirectory resolves by discovery rather than by path. Remove
 * the suppression once the CLI can target a ref.
 */
export function pluginsCommand(
  plugin: Pick<Plugin, "source">,
): string | undefined {
  if (plugin.source.ref) return undefined;
  return `npx plugins add ${cliSource(plugin.source.url)}`;
}
