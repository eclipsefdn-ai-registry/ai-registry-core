import type { Plugin, Skill } from "./types";
import { approvedTarget } from "./approvedTarget";
import { cliSource, isGitHubUrl, sourceTreeUrl } from "./cliSource";

// The two source forms the skills CLI reads a path from, given what cliSource
// produces: the GitHub `owner/repo` shorthand, and a gitlab.com URL, nested
// groups included. Any other host goes over as an `https://….git` URL, which
// takes a `#ref` but no path.
const OWNER_REPO = /^[^/:]+\/[^/:]+$/;
const GITLAB_COM = /^https:\/\/gitlab\.com\/[^/]+\/.+$/;
// skills 1.7.4 looks for these anywhere in its argument, before the shorthand
// and before any other host, so one in a path or a URL would install from a
// repository that wasn't approved.
const MISROUTING_HOST = /github\.com\/|gitlab\.com\//;

// cli/src/skillsAdd.ts mirrors skillsCommand's rules by hand: change both.

/**
 * Builds the `npx skills add` command that installs one skill at the path and
 * revision its approval names.
 *
 * `<source>#<ref>` checked against skills 1.7.4, where the fragment is parsed
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
 * --skill picks the skill by its SKILL.md frontmatter name, which is what
 * `name` is, among those under the path. --full-depth keeps skills 1.7.4 from
 * fetching some GitHub owners' files from skills.sh instead of cloning; it also
 * searches below a SKILL.md at the path, which is why --skill goes on every
 * command, a skill at the repository root included.
 *
 * Returns undefined when the command can't be pointed at the approved path and
 * revision. A command that installs something other than what was approved is
 * worse than none.
 */
export function skillsCommand(
  skill: Pick<Skill, "name" | "source" | "contentHash" | "latestHash">,
): string | undefined {
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
  return `npx skills add ${source} --skill ${skill.name} --full-depth`;
}

/**
 * The source argument that makes skills look only at `path`, at `revision`.
 * Without the path, skills installs the first SKILL.md anywhere in the
 * repository with the name --skill gives.
 *
 * The GitHub shorthand takes both as `owner/repo/<path>#<revision>`. gitlab.com
 * takes a path only in a `/-/tree/<revision>/<path>` URL, which needs a
 * revision without a slash, since the URL's revision ends at the first one.
 * Any other host takes a revision but no path, and only as a `.git` URL:
 * without one skills reads the URL as a well-known endpoint and never clones.
 * skills reads everything after a `#` as the revision, and splits a skill
 * filter off it at an `@`, so a path can't hold a `#` and a revision can't
 * hold an `@`.
 */
function skillsSource(
  source: string,
  path: string | undefined,
  revision: string | undefined,
): string | undefined {
  if (path?.includes("#") || revision?.includes("@")) return undefined;
  const argument = sourceArgument(source, path, revision);
  if (!argument) return undefined;
  const afterHost = argument.replace(/^https:\/\/gitlab\.com\//, "");
  return MISROUTING_HOST.test(afterHost) ? undefined : argument;
}

function sourceArgument(
  source: string,
  path: string | undefined,
  revision: string | undefined,
): string | undefined {
  const fragment = revision ? `#${revision}` : "";
  if (OWNER_REPO.test(source)) {
    return `${source}${path ? `/${path}` : ""}${fragment}`;
  }
  if (GITLAB_COM.test(source)) {
    if (!path) return `${source}${fragment}`;
    if (!revision || revision.includes("/")) return undefined;
    return `${source}/-/tree/${revision}/${path}`;
  }
  return path ? undefined : `${source}.git${fragment}`;
}

/** One thing to do in a tool, in the order a plugin's option lists them. */
export type InstallStep =
  // A shell command to copy and run. `lead` says what it's for.
  | { kind: "command"; lead?: string; command: string }
  // A value to paste where `action` (a menu path or command palette entry)
  // asks for it, inside `app`.
  | { kind: "paste"; app: string; action: string; value: string };

/**
 * How to install a plugin with one tool: either the steps, several where the
 * tool needs them (such as adding a marketplace before installing from it), or
 * why the tool can't install what was approved, when it's still worth naming.
 *
 * `unavailable` and `warnings` are prose in which backticks mark code.
 */
export type PluginInstallOption = {
  tool: "kiro" | "npx-plugins";
  label: string;
  warnings: string[];
} & ({ steps: InstallStep[] } | { unavailable: string });

/**
 * Every install instruction for a plugin, in the order the detail page shows
 * them. The one place a rule about which tool can install which plugin lives.
 *
 * A tool that can't install this plugin at all is left out. A missing
 * `isAgentPlugin` (a feed that predates it) is unknown, not false, so it passes
 * both tools' verdict checks; their other checks still apply.
 */
export function pluginInstallOptions(
  plugin: Pick<Plugin, "source" | "isAgentPlugin">,
): PluginInstallOption[] {
  return [kiroOption(plugin), npxPluginsOption(plugin)].filter(
    (option) => option !== undefined,
  );
}

/**
 * Kiro's "Import power from GitHub", given the link to the plugin, which Kiro
 * reads natively as a power.
 *
 * Kiro installs from `/tree/<revision>/<path>` and accepts a full commit SHA,
 * so this pins to the commit contentHash was computed at, ref or no ref, as
 * sourceTreeUrl does. The path is required for a plugin in a subfolder: Kiro
 * ignores marketplace files, so the repository root alone doesn't find it.
 *
 * Offered only for an Agent Plugin on github.com with a `source.commit`: Kiro
 * rejects a non-GitHub URL and won't load a plugin.json without `$schema`, and
 * without the commit the link could only name a ref or HEAD.
 */
function kiroOption(
  plugin: Pick<Plugin, "source" | "isAgentPlugin">,
): PluginInstallOption | undefined {
  if (plugin.isAgentPlugin === false) return undefined;
  if (!isGitHubUrl(plugin.source.url)) return undefined;
  if (!plugin.source.commit) return undefined;
  return {
    tool: "kiro",
    label: "Install in Kiro",
    steps: [
      {
        kind: "paste",
        app: "Kiro",
        action: "Powers → Add Custom Power → Import power from GitHub",
        value: sourceTreeUrl(plugin.source),
      },
    ],
    warnings: [],
  };
}

/**
 * The `npx plugins add` command for a plugin that isn't an Agent Plugin, or why
 * there is none when the approval names a ref. An Agent Plugin gets nothing:
 * the tools that read the specification install it at the approved commit.
 *
 * Keyed to the CLI's capability, not to `source.pinned`: plugins 1.3.4 runs
 * `git clone --depth 1` with no ref and has no flag for one, so a branch ref is
 * as unreachable as a tag. The plugins CLI takes a source and nothing else, so
 * a plugin in a subdirectory resolves by discovery rather than by path. Remove
 * the suppression once the CLI can target a ref.
 */
function npxPluginsOption(
  plugin: Pick<Plugin, "source" | "isAgentPlugin">,
): PluginInstallOption | undefined {
  if (plugin.isAgentPlugin === true) return undefined;
  const option = {
    tool: "npx-plugins" as const,
    label: "Install in other agents",
    warnings: [],
  };
  const { ref, url } = plugin.source;
  if (ref) {
    return {
      ...option,
      unavailable: `Installing the approved version isn't currently possible with \`npx plugins add\`. This approval names \`${ref}\`, and the plugins CLI always installs from the repository's default branch.`,
    };
  }
  return {
    ...option,
    steps: [
      {
        kind: "command",
        lead: "For other agents, this plugin might be installable with:",
        command: `npx plugins add ${cliSource(url)}`,
      },
    ],
  };
}
