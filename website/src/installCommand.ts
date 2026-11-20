import type { Plugin, RepositoryMarketplaceFile, Skill } from "./types";
import { approvedTarget } from "./approvedTarget";
import { cliSource, isGitHubUrl, sourceTreeUrl } from "./cliSource";
import { marketplaceCommand } from "./marketplaceCommand";

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
// cli/src/pluginTools.ts mirrors which tools pluginInstallOptions lists per
// verdict, cli/src/codexPlan.ts mirrors codexOption, and cli/src/kiroPlan.ts
// mirrors kiroOption's import step as its fallback: change both.

// The commit form a published marketplace entry carries as `sha`, matching
// src/marketplace-output.ts: Claude Code takes a full SHA and nothing shorter.
const FULL_SHA = /^[0-9a-f]{40}$/;

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
  | { kind: "command"; lead?: string; value: string }
  // A value to paste where `action` (a menu path or command palette entry)
  // asks for it, inside `app`.
  | { kind: "paste"; app: string; action: string; value: string }
  // Install the entry named `value` from the marketplace the step before
  // added, inside `app`.
  | { kind: "install"; app: string; value: string };

/**
 * How to install a plugin with one tool: either the steps, several where the
 * tool needs them (such as adding a marketplace before installing from it), or
 * why the tool can't install what was approved.
 *
 * `label` is the tool's name as its tab shows it. `unavailable` and `warnings`
 * are prose in which backticks mark code; only an option with steps has
 * warnings, since they are about what following the steps gets you.
 */
export type PluginInstallOption = {
  tool: "claude-code" | "codex" | "vscode" | "kiro" | "npx-plugins";
  label: string;
} & ({ steps: InstallStep[]; warnings: string[] } | { unavailable: string });

type PluginFacts = Pick<
  Plugin,
  | "source"
  | "isAgentPlugin"
  | "publishedMarketplaces"
  | "marketplaceFiles"
  | "containedMcpServers"
  | "mcpConfigFiles"
>;

/**
 * Every install instruction for a plugin, in the order the detail page shows
 * them. The one place a rule about which tool can install which plugin lives.
 *
 * `baseUrl` is the site's full base URL, which the published marketplaces sit
 * under (see marketplaceCommand). `orgName` gives an organization's name for
 * its id, as the instructions show it.
 *
 * The tools that can install the plugin come first, then the ones that can't,
 * each group in the order Kiro, Claude Code, Codex, VS Code, `npx plugins`.
 *
 * Which tools are listed follows the verdict, since the registry backs the
 * Agent Plugins specification. An Agent Plugin gets Kiro, Claude Code, Codex
 * and VS Code; a plugin that isn't one gets only Claude Code and `npx plugins`.
 * A missing `isAgentPlugin` (a feed that predates it) is unknown, not false,
 * and gets all five. A listed tool that can't install the approved plugin
 * comes back `unavailable`, with the first reason that stops it, rather than
 * being left out, so the reader sees that it was considered and why it doesn't
 * work.
 */
export function pluginInstallOptions(
  plugin: PluginFacts,
  baseUrl: string,
  orgName: (orgId: string) => string,
): PluginInstallOption[] {
  const claudeCode = claudeCodeOptions(plugin, baseUrl, orgName);
  const options =
    plugin.isAgentPlugin === false
      ? [...claudeCode, npxPluginsOption(plugin)]
      : [
          kiroOption(plugin),
          ...claudeCode,
          codexOption(plugin),
          vsCodeOption(plugin),
          ...(plugin.isAgentPlugin === true ? [] : [npxPluginsOption(plugin)]),
        ];
  // Stable, so each group keeps the order above.
  return options.sort(
    (a, b) => Number("unavailable" in a) - Number("unavailable" in b),
  );
}

// The reasons more than one tool gives for not installing a plugin. They say
// that the tool can't do it, never that the plugin is at fault or unsafe.
function noCommit(tool: string): string {
  return `The registry has no commit recorded for this plugin, so ${tool} can't be pointed at the approved version.`;
}

function notListed(tool: string, path: string): string {
  return `${tool} reads \`${path}\` as this repository's marketplace file, and it doesn't list this plugin from a path in the repository.`;
}

/**
 * Claude Code, once per organization whose published marketplace lists the
 * plugin: trust here is held by an organization, so the reader subscribes to
 * the one they trust. The published entry pins `sha` to `source.commit`, so
 * this installs the approved commit whatever ref the approval names, and is
 * offered whether or not the plugin is an Agent Plugin.
 *
 * Only from `publishedMarketplaces`, which consolidation reads off the files it
 * writes, so the entry named is one that exists. Unavailable, once, for a
 * plugin no published marketplace lists, for a feed without the listing, and without a
 * full 40-character `source.commit`, since then the published entry has no
 * `sha` to pin the install to.
 *
 * Each option warns when the plugin's MCP servers are in none of the files
 * Claude Code reads them from (see mcpConfigWarnings).
 */
function claudeCodeOptions(
  plugin: PluginFacts,
  baseUrl: string,
  orgName: (orgId: string) => string,
): PluginInstallOption[] {
  const option = {
    tool: "claude-code" as const,
    label: "Claude Code",
  };
  const unavailable = (reason: string): PluginInstallOption[] => [
    { ...option, unavailable: reason },
  ];
  const listings = plugin.publishedMarketplaces;
  if (!listings) {
    return unavailable(
      "The registry data doesn't record which published marketplaces list this plugin, and Claude Code installs an approved plugin through one.",
    );
  }
  if (listings.length === 0) {
    return unavailable(
      "No organization's published marketplace lists this plugin, and Claude Code installs an approved plugin through one.",
    );
  }
  if (!FULL_SHA.test(plugin.source.commit ?? "")) {
    return unavailable(
      "The registry has no full commit SHA recorded for this plugin, so a published marketplace entry can't pin Claude Code to the approved version.",
    );
  }
  const warnings = mcpConfigWarnings(plugin);
  return listings.map(({ orgId, marketplaceName, entryName }) => ({
    ...option,
    steps: [
      {
        kind: "command",
        lead: `Add the published marketplace of plugins ${orgName(orgId)} approved:`,
        value: marketplaceCommand(baseUrl, orgId),
      },
      {
        kind: "command",
        value: `claude plugin install ${entryName}@${marketplaceName}`,
      },
    ],
    warnings,
  }));
}

// The warning, if any, that Claude Code won't load the plugin's MCP servers,
// naming them. Claude Code reads a plugin's servers only from `.mcp.json` and
// from `mcpServers` in `.claude-plugin/plugin.json`, never from the
// agent-plugins.org `mcp.json`, so a plugin with servers and neither file
// installs and then has none (`claude mcp list` shows nothing). A feed that
// predates `mcpConfigFiles` gets no warning: it's unknown there, and warning
// about an unknown would put the warning on every plugin with servers.
function mcpConfigWarnings(plugin: PluginFacts): string[] {
  if (!plugin.mcpConfigFiles || plugin.mcpConfigFiles.length > 0) return [];
  const names = plugin.containedMcpServers.map((server) => server.name);
  if (names.length === 0) return [];
  return [
    "Claude Code reads a plugin's MCP servers only from `.mcp.json` or `mcpServers` in `.claude-plugin/plugin.json`, and this plugin has neither, so " +
      serverList(names, "won't", "won't") +
      " be available there.",
  ];
}

// "the MCP server `a` <one>" or "the MCP servers `a`, `b` and `c` <many>".
function serverList(names: string[], one: string, many: string): string {
  const quoted = names.map((name) => `\`${name}\``);
  return quoted.length === 1
    ? `the MCP server ${quoted[0]} ${one}`
    : `the MCP servers ${quoted.slice(0, -1).join(", ")} and ${quoted[quoted.length - 1]} ${many}`;
}

// The marketplace files Codex looks for in a repository, in its order. It
// reads the first one present and no other, whether or not that one lists
// the plugin (codex-rs/core-plugins/src/marketplace.rs).
const CODEX_MARKETPLACE_FILES = [
  ".agents/plugins/marketplace.json",
  ".agents/plugins/api_marketplace.json",
  ".claude-plugin/marketplace.json",
  ".cursor-plugin/marketplace.json",
];

/**
 * Codex, through the marketplace file in the plugin's own repository: add the
 * repository as a marketplace at `source.commit`, then the entry. `--ref`
 * pins the marketplace file, and a `local` entry inside it with it (tested
 * against Codex 0.167.0), so this installs the approved commit whatever ref
 * the approval names.
 *
 * Available only with a `source.commit` whose first-found Codex marketplace
 * file has an entry for it, and unavailable otherwise. Listed only for an
 * Agent Plugin (see pluginInstallOptions). Consolidation sets `entryName`
 * only for a repository-relative entry, so a git-URL entry, which Codex would
 * fetch on its own and only pin by its own `sha`, never qualifies. Any git
 * host: github.com goes as `owner/repo`, any other as its git URL.
 */
function codexOption(plugin: PluginFacts): PluginInstallOption {
  const option = { tool: "codex" as const, label: "Codex" };
  const unavailable = (reason: string): PluginInstallOption => ({
    ...option,
    unavailable: reason,
  });
  const { commit, url } = plugin.source;
  if (!commit) return unavailable(noCommit("Codex"));
  if (!plugin.marketplaceFiles) {
    return unavailable(
      "The registry data doesn't record this repository's marketplace files, and Codex installs a plugin through one.",
    );
  }
  const file = firstFound(plugin.marketplaceFiles, CODEX_MARKETPLACE_FILES);
  if (!file) {
    return unavailable(
      "Codex installs a plugin through a marketplace file in its repository, and this repository has none of the ones Codex reads.",
    );
  }
  if (!file.entryName || !file.marketplaceName) {
    return unavailable(notListed("Codex", file.path));
  }
  const source = isGitHubUrl(url) ? cliSource(url) : url;
  return {
    ...option,
    steps: [
      {
        kind: "command",
        lead: "Add the repository's marketplace at the approved commit:",
        value: `codex plugin marketplace add ${source} --ref ${commit}`,
      },
      {
        kind: "command",
        value: `codex plugin add ${file.entryName}@${file.marketplaceName}`,
      },
    ],
    warnings: [],
  };
}

// The marketplace file of a repository a tool reads: the first one present
// of the paths it looks for, in its order.
function firstFound(
  files: RepositoryMarketplaceFile[] | undefined,
  paths: string[],
): RepositoryMarketplaceFile | undefined {
  return paths
    .map((path) => files?.find((file) => file.path === path))
    .find((file) => file !== undefined);
}

// The marketplace files VS Code looks for in a repository, in its order. It
// reads the first one present and no other, whether or not that one lists
// the plugin, and treats the repository as a single plugin only when none is
// there (microsoft/vscode, src/vs/workbench/contrib/chat/common/plugins/
// pluginMarketplaceService.ts).
const VS_CODE_MARKETPLACE_FILES = [
  "marketplace.json",
  ".plugin/marketplace.json",
  ".github/plugin/marketplace.json",
  ".claude-plugin/marketplace.json",
];

/**
 * VS Code (GitHub Copilot), in one of two forms, github.com only.
 *
 * When VS Code's first-found marketplace file lists the plugin: add the
 * repository as a marketplace at `owner/repo#<source.commit>`, which pins it
 * and its `local` entries (tested against VS Code 1.145.2), then install
 * the entry. Needs `source.commit`, and is offered whatever ref the approval
 * names.
 *
 * When the repository has none of VS Code's marketplace files, for a plugin at
 * the repository root whose approval names no ref: "Install Plugin from
 * Source" with `owner/repo`. That can't pin: VS Code drops a `#<sha>` there and
 * installs the default branch, yet still displays the `#<sha>` (tested
 * against VS Code 1.145.2), so the commit is never appended. A file that is there
 * but doesn't list the plugin, or can't be parsed, gets neither form: VS Code
 * would read the repository as that marketplace. Nor does a file that sets a
 * non-empty `metadata.pluginRoot` (VS Code takes an empty one for none): VS Code resolves every string source under it
 * (`parsePluginSource` in pluginMarketplaceService.ts), while `entryName` was
 * matched without it, so the entry could be missing or another plugin's. A
 * feed without `marketplaceFiles` is unknown, and passes.
 *
 * Listed only for an Agent Plugin (see pluginInstallOptions), though VS Code
 * also reads a Claude-format plugin. Both
 * forms warn when a contained MCP server uses `${PLUGIN_DATA}`, which VS Code
 * leaves unexpanded. Whatever fits neither form is unavailable.
 */
function vsCodeOption(plugin: PluginFacts): PluginInstallOption {
  const { url, path, ref, commit } = plugin.source;
  const label = "VS Code (GitHub Copilot)";
  const unavailable = (reason: string): PluginInstallOption => ({
    tool: "vscode",
    label,
    unavailable: reason,
  });
  if (!isGitHubUrl(url)) {
    return unavailable(
      "Installing in VS Code is only known to work for a repository on github.com, and this plugin's is on another host.",
    );
  }
  const option = {
    tool: "vscode" as const,
    label,
    warnings: pluginDataWarnings(plugin),
  };
  const file = firstFound(plugin.marketplaceFiles, VS_CODE_MARKETPLACE_FILES);
  if (file) {
    if (file.pluginRoot) {
      return unavailable(
        `VS Code reads \`${file.path}\` as this repository's marketplace file, and it sets \`pluginRoot\`, which moves where VS Code looks for each plugin, so the registry can't tell which entry is this plugin.`,
      );
    }
    if (!file.entryName) return unavailable(notListed("VS Code", file.path));
    if (!commit) return unavailable(noCommit("VS Code"));
    return {
      ...option,
      steps: [
        {
          kind: "paste",
          app: "VS Code",
          action: "Command Palette → Chat: Add Marketplace",
          value: `${cliSource(url)}#${commit}`,
        },
        { kind: "install", app: "VS Code", value: file.entryName },
      ],
    };
  }
  if (path) {
    return unavailable(
      `This repository has none of the marketplace files VS Code reads, and without one VS Code installs the repository root, while this plugin is in \`${path}\`.`,
    );
  }
  if (ref) {
    return unavailable(
      `Without a marketplace file in the repository, VS Code can only install this plugin from its default branch, not the approved \`${ref}\`.`,
    );
  }
  return {
    ...option,
    steps: [
      {
        kind: "paste",
        app: "VS Code",
        action: "Command Palette → Chat: Install Plugin from Source",
        value: cliSource(url),
      },
    ],
  };
}

// The warning, if any, that VS Code won't expand `${PLUGIN_DATA}` for the
// contained MCP servers that use it, naming them. A feed that predates
// `usesPluginData` gets no warning: it's unknown there, and warning about an
// unknown would put the warning on every plugin.
function pluginDataWarnings(plugin: PluginFacts): string[] {
  const names = plugin.containedMcpServers
    .filter((server) => server.usesPluginData)
    .map((server) => server.name);
  if (names.length === 0) return [];
  return [
    "VS Code doesn't expand `${PLUGIN_DATA}`, which " +
      serverList(names, "uses, so it may", "use, so they may") +
      " not work there.",
  ];
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
 * Available only on github.com with a `source.commit`: Kiro rejects a
 * non-GitHub URL, and without the commit the link could only name a ref or
 * HEAD. Listed only for an Agent Plugin (see pluginInstallOptions), since Kiro
 * won't load a plugin.json without `$schema`.
 */
function kiroOption(plugin: PluginFacts): PluginInstallOption {
  const option = { tool: "kiro" as const, label: "Kiro" };
  const unavailable = (reason: string): PluginInstallOption => ({
    ...option,
    unavailable: reason,
  });
  if (!isGitHubUrl(plugin.source.url)) {
    return unavailable(
      "Kiro imports a power only from github.com, and this plugin's repository is on another host.",
    );
  }
  if (!plugin.source.commit) return unavailable(noCommit("Kiro"));
  return {
    ...option,
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
 * there is none when the approval names a ref. Listed only for such a plugin
 * (see pluginInstallOptions). For one known not to conform, the lead says,
 * without naming the specification, that it isn't in the format agents share,
 * so how another agent loads it is a best effort.
 *
 * Keyed to the CLI's capability, not to `source.pinned`: plugins 1.3.4 runs
 * `git clone --depth 1` with no ref and has no flag for one, so a branch ref is
 * as unreachable as a tag. The plugins CLI takes a source and nothing else, so
 * a plugin in a subdirectory resolves by discovery rather than by path, and
 * every plugin it discovers in the repository is installed, which the command
 * says. Remove the suppression once the CLI can target a ref.
 */
function npxPluginsOption(plugin: PluginFacts): PluginInstallOption {
  const option = {
    tool: "npx-plugins" as const,
    label: "Other agents",
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
        lead:
          plugin.isAgentPlugin === false
            ? "Other agents might install this plugin with the command below, but it isn't packaged in the format they share, so whether it loads, and how, depends on the agent:"
            : "For other agents, this plugin might be installable with:",
        value: `npx plugins add ${cliSource(url)}`,
      },
    ],
    warnings: [
      "`npx plugins add` installs every plugin in the repository, not only this one, because it takes a repository and can't select a plugin in it.",
    ],
  };
}
