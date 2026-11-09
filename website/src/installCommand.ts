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
  | { kind: "command"; lead?: string; command: string }
  // A value to paste where `action` (a menu path or command palette entry)
  // asks for it, inside `app`.
  | { kind: "paste"; app: string; action: string; value: string }
  // Install the entry named `plugin` from the marketplace the step before
  // added, inside `app`.
  | { kind: "install"; app: string; plugin: string };

/**
 * How to install a plugin with one tool: either the steps, several where the
 * tool needs them (such as adding a marketplace before installing from it), or
 * why the tool can't install what was approved, when it's still worth naming.
 *
 * `unavailable` and `warnings` are prose in which backticks mark code.
 */
export type PluginInstallOption = {
  tool: "claude-code" | "codex" | "vscode" | "kiro" | "npx-plugins";
  label: string;
  warnings: string[];
} & ({ steps: InstallStep[] } | { unavailable: string });

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
 * under (see marketplaceCommand).
 *
 * A tool that can't install this plugin at all is left out. A missing
 * `isAgentPlugin` (a feed that predates it) is unknown, not false, so it passes
 * every tool's verdict check; their other checks still apply.
 */
export function pluginInstallOptions(
  plugin: PluginFacts,
  baseUrl: string,
): PluginInstallOption[] {
  return [
    kiroOption(plugin),
    ...claudeCodeOptions(plugin, baseUrl),
    codexOption(plugin),
    vsCodeOption(plugin),
    npxPluginsOption(plugin),
  ].filter((option) => option !== undefined);
}

/**
 * Claude Code, once per organization whose published marketplace lists the
 * plugin: trust here is held by an organization, so the reader subscribes to
 * the one they trust. The published entry pins `sha` to `source.commit`, so
 * this installs the approved commit whatever ref the approval names, and is
 * offered whether or not the plugin is an Agent Plugin.
 *
 * Only from `publishedMarketplaces`, which consolidation reads off the files it
 * writes, so the entry named is one that exists. A feed without the listing
 * gets nothing, and so does one without a full 40-character `source.commit`,
 * since then the published entry has no `sha` to pin the install to.
 *
 * Each option warns when the plugin's MCP servers are in none of the files
 * Claude Code reads them from (see mcpConfigWarnings).
 */
function claudeCodeOptions(
  plugin: PluginFacts,
  baseUrl: string,
): PluginInstallOption[] {
  if (!FULL_SHA.test(plugin.source.commit ?? "")) return [];
  const warnings = mcpConfigWarnings(plugin);
  return (plugin.publishedMarketplaces ?? []).map(
    ({ orgId, marketplaceName, entryName }) => ({
      tool: "claude-code",
      label: "Install in Claude Code",
      steps: [
        {
          kind: "command",
          lead: `Add the marketplace of plugins ${orgId} approved:`,
          command: marketplaceCommand(baseUrl, orgId),
        },
        {
          kind: "command",
          command: `claude plugin install ${entryName}@${marketplaceName}`,
        },
      ],
      warnings,
    }),
  );
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
 * Offered only for an Agent Plugin with a `source.commit` whose first-found
 * Codex marketplace file has an entry for it. Consolidation sets `entryName`
 * only for a repository-relative entry, so a git-URL entry, which Codex would
 * fetch on its own and only pin by its own `sha`, never qualifies. Any git
 * host: github.com goes as `owner/repo`, any other as its git URL.
 */
function codexOption(plugin: PluginFacts): PluginInstallOption | undefined {
  if (plugin.isAgentPlugin === false) return undefined;
  const { commit, url } = plugin.source;
  if (!commit) return undefined;
  const file = firstFound(plugin.marketplaceFiles, CODEX_MARKETPLACE_FILES);
  if (!file?.entryName || !file.marketplaceName) return undefined;
  const source = isGitHubUrl(url) ? cliSource(url) : url;
  return {
    tool: "codex",
    label: "Install in Codex",
    steps: [
      {
        kind: "command",
        lead: "Add the repository's marketplace at the approved commit:",
        command: `codex plugin marketplace add ${source} --ref ${commit}`,
      },
      {
        kind: "command",
        command: `codex plugin add ${file.entryName}@${file.marketplaceName}`,
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
 * would read the repository as that marketplace. A feed without
 * `marketplaceFiles` is unknown, and passes.
 *
 * Not gated on `isAgentPlugin`: VS Code also reads a Claude-format plugin. Both
 * forms warn when a contained MCP server uses `${PLUGIN_DATA}`, which VS Code
 * leaves unexpanded.
 */
function vsCodeOption(plugin: PluginFacts): PluginInstallOption | undefined {
  const { url, path, ref, commit } = plugin.source;
  if (!isGitHubUrl(url)) return undefined;
  const option = {
    tool: "vscode" as const,
    label: "Install in VS Code (GitHub Copilot)",
    warnings: pluginDataWarnings(plugin),
  };
  const file = firstFound(plugin.marketplaceFiles, VS_CODE_MARKETPLACE_FILES);
  if (file) {
    if (!file.entryName || !commit) return undefined;
    return {
      ...option,
      steps: [
        {
          kind: "paste",
          app: "VS Code",
          action: "Command Palette → Chat: Add Marketplace",
          value: `${cliSource(url)}#${commit}`,
        },
        { kind: "install", app: "VS Code", plugin: file.entryName },
      ],
    };
  }
  if (path || ref) return undefined;
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
 * Offered only for an Agent Plugin on github.com with a `source.commit`: Kiro
 * rejects a non-GitHub URL and won't load a plugin.json without `$schema`, and
 * without the commit the link could only name a ref or HEAD.
 */
function kiroOption(plugin: PluginFacts): PluginInstallOption | undefined {
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
 * a plugin in a subdirectory resolves by discovery rather than by path, and
 * every plugin it discovers in the repository is installed, which the command
 * says. Remove the suppression once the CLI can target a ref.
 */
function npxPluginsOption(
  plugin: PluginFacts,
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
    warnings: [
      "`npx plugins add` installs every plugin in the repository, not only this one, because it takes a repository and can't select a plugin in it.",
    ],
  };
}
