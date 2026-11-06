import type { Plugin } from "./types.js";
import { approvedTarget } from "./approvedTarget.js";
import { cliSource, normalizeRepoUrl } from "./cliSource.js";

// The plugins version this CLI depends on, and that its rules were checked
// against; keep it equal to the dependency in package.json.
const PLUGINS_VERSION = "1.3.5";

/** What the user may pass through to the plugins CLI; nothing else is. */
export interface PluginInstallerOptions {
  // skip the installer's own prompts, using the tools it detects
  yes?: boolean;
  // one tool id, such as claude-code
  target?: string;
  scope?: string;
}

/**
 * The arguments to the plugins CLI that install one plugin, or undefined when
 * the approval names a ref. Mirrors pluginsCommand in
 * website/src/installCommand.ts by hand: keep them in sync.
 *
 * plugins 1.3.5 runs `git clone --depth 1` with no ref and has no flag for
 * one, so a branch ref is as unreachable as a tag, and installing anyway
 * would fetch the default branch instead of what was approved. Remove the
 * refusal once the plugins CLI can target a ref.
 *
 * The plugins CLI takes a repository, not a path in it, and with -y installs
 * every plugin it discovers there. So a plugin in a subdirectory never gets
 * -y: the installer's own picker is then the only way to leave its unapproved
 * neighbours out.
 */
export function pluginsAddArgs(
  plugin: Pick<Plugin, "source">,
  options: PluginInstallerOptions,
): string[] | undefined {
  if (plugin.source.ref) return undefined;
  const args = ["add", cliSource(plugin.source.url)];
  if (options.target) args.push("--target", options.target);
  if (options.scope) args.push("--scope", options.scope);
  if (options.yes && !plugin.source.path) args.push("-y");
  return args;
}

/**
 * The commands that install a plugin at the revision its approval names, by
 * hand, for when pluginsAddArgs refuses: clone, check out, and point the
 * plugins CLI at the plugin's own directory, where it discovers only that one.
 * A pinned approval checks out source.commit, the commit contentHash was
 * computed at, since a tag can be moved afterwards.
 */
export function manualInstallCommands(
  plugin: Pick<Plugin, "source" | "contentHash" | "latestHash">,
): string[] {
  const url = normalizeRepoUrl(plugin.source.url);
  const dir = url.slice(url.lastIndexOf("/") + 1);
  const { ref, commit, path } = plugin.source;
  const revision =
    approvedTarget(plugin).kind === "pinned" ? (commit ?? ref) : ref;
  return [
    `git clone ${url} ${dir}`,
    ...(revision ? [`git -C ${dir} checkout ${revision}`] : []),
    // ./ keeps the plugins CLI from reading dir/path as a GitHub owner/repo.
    `npx plugins@${PLUGINS_VERSION} add ./${dir}${path ? `/${path}` : ""}`,
  ];
}
