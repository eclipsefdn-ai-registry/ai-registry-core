// Mirrors codexOption in website/src/installCommand.ts by hand: the same
// marketplace file, source and commands, and its unavailable reasons verbatim.
// Keep them in sync.
import { cliSource, isGitHubUrl } from "./cliSource.js";
import type { CommandProbe, ToolPlan } from "./pluginTools.js";
import type { Plugin, RepositoryMarketplaceFile } from "./types.js";
import { atLeast, parseVersionLine, type Version } from "./version.js";

// The marketplace files Codex looks for in a repository, in its order. It
// reads the first one present and no other, whether or not that one lists the
// plugin.
const CODEX_MARKETPLACE_FILES = [
  ".agents/plugins/marketplace.json",
  ".agents/plugins/api_marketplace.json",
  ".claude-plugin/marketplace.json",
  ".cursor-plugin/marketplace.json",
];

// `codex plugin add` arrived in 0.131.0.
const MIN_CODEX: Version = [0, 131, 0];
export const MIN_CODEX_TEXT = MIN_CODEX.join(".");

/**
 * Codex, through the marketplace file in the plugin's own repository: add the
 * repository as a marketplace at `source.commit`, then the entry. `--ref` pins
 * the marketplace file, and the `local` entry inside it with it, so this
 * installs the approved commit whatever ref the approval names. Codex fetches
 * the commit itself, so there is no snapshot and no need for git.
 *
 * Unavailable for the website's reasons. When `codex` is missing, too old for
 * `plugin add`, or prints a version this can't read, the two commands become
 * steps for the user. Codex records no commit for an installed plugin, so a
 * plan is never `done`: `plugin add` runs every time, replacing its copy.
 */
export function planCodex(
  plugin: Pick<Plugin, "source" | "marketplaceFiles">,
  codex: CommandProbe,
): ToolPlan {
  const unavailable = (reason: string): ToolPlan => ({
    kind: "unavailable",
    reason,
  });
  const { commit, url } = plugin.source;
  if (!commit) {
    return unavailable(
      "The registry has no commit recorded for this plugin, so Codex can't be pointed at the approved version.",
    );
  }
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
    return unavailable(
      `Codex reads \`${file.path}\` as this repository's marketplace file, and it doesn't list this plugin from a path in the repository.`,
    );
  }

  const source = isGitHubUrl(url) ? cliSource(url) : url;
  const entry = `${file.entryName}@${file.marketplaceName}`;
  const marketplaceAdd = [
    "codex",
    "plugin",
    "marketplace",
    "add",
    source,
    "--ref",
    commit,
  ];
  const pluginAdd = ["codex", "plugin", "add", entry];

  const hint = codexProblem(codex);
  if (hint) {
    return {
      kind: "manual",
      steps: [marketplaceAdd.join(" "), pluginAdd.join(" ")],
      hint,
    };
  }
  return {
    kind: "run",
    actions: [
      { kind: "exec", argv: marketplaceAdd },
      { kind: "exec", argv: pluginAdd },
    ],
    notes: [],
    warnings: [],
    success: `Installed \`${entry}\` at the approved commit. Start a new Codex session to use it.`,
  };
}

// Why this CLI can't run codex itself, or undefined when it can.
function codexProblem(codex: CommandProbe): string | undefined {
  if (!codex.found) return "`codex` wasn't found on PATH.";
  const version = parseVersionLine(codex.output, "codex-cli");
  if (!version)
    return "Couldn't read the Codex version from `codex --version`.";
  if (!atLeast(version, MIN_CODEX)) {
    return `Upgrade Codex to ${MIN_CODEX_TEXT} or later, and this CLI runs these for you.`;
  }
  return undefined;
}

// The marketplace file of a repository a tool reads: the first one present of
// the paths it looks for, in its order.
function firstFound(
  files: RepositoryMarketplaceFile[],
  paths: string[],
): RepositoryMarketplaceFile | undefined {
  return paths
    .map((path) => files.find((file) => file.path === path))
    .find((file) => file !== undefined);
}
