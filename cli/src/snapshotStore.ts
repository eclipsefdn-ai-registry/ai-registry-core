// Where install plugin keeps Plugin snapshots: the plugin's folder at its
// approved commit, without `.git`, fetched with the user's own git.
import { isAbsolute, join } from "node:path";
import type { Plugin } from "./types.js";

/**
 * A Plugin snapshot of one approved commit: what to fetch, the folder it is
 * fetched into (`staging`), and the folder it is kept at in the store when a
 * Tool keeps reading it after the install (`stored`).
 */
export interface Snapshot {
  url: string;
  // the plugin's folder in the repository; absent for the repository root
  path?: string;
  commit: string;
  stored: string;
  staging: string;
}

/**
 * The Snapshot store: `$XDG_DATA_HOME/ai-registry` when that is absolute, else
 * `~/.local/share/ai-registry`, on every OS, as config.ts does for config.
 * Snapshots go under `plugins/`, leaving the root free for other records.
 */
export function storeRoot(
  env: Record<string, string | undefined>,
  homeDir: string,
): string {
  // The XDG spec says to ignore a relative XDG_DATA_HOME.
  const xdg = env.XDG_DATA_HOME;
  const dataDir =
    xdg && isAbsolute(xdg) ? xdg : join(homeDir, ".local", "share");
  return join(dataDir, "ai-registry");
}

/**
 * The snapshot of a plugin's approved commit: kept at
 * `plugins/<pluginId with / as -->/<commit>/`, fetched into a
 * `<commit>.partial-<suffix>` folder beside it so that an interrupted fetch
 * never looks like a kept one. Undefined without a commit.
 */
export function snapshotFor(
  root: string,
  plugin: Pick<Plugin, "pluginId" | "source">,
  suffix: string,
): Snapshot | undefined {
  const { url, path, commit } = plugin.source;
  if (!commit) return undefined;
  const stored = join(
    root,
    "plugins",
    plugin.pluginId.replaceAll("/", "--"),
    commit,
  );
  return {
    url,
    ...(path && path !== "." ? { path } : {}),
    commit,
    stored,
    staging: `${stored}.partial-${suffix}`,
  };
}
