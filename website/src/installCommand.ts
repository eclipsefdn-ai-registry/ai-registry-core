import type { Plugin, Skill } from "./types";
import { approvedTarget } from "./approvedTarget";
import { cliSource, isGitHubUrl, sourceTreeUrl } from "./cliSource";

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
