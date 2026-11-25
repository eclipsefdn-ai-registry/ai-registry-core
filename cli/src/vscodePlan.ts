// VS Code's route, the CLI's own: the website's Command Palette steps can't
// be run from a terminal. Its no-commit reason and its `${PLUGIN_DATA}`
// warning mirror vsCodeOption in website/src/installCommand.ts by hand: keep
// them in sync. The website's github.com, `pluginRoot`, marketplace entry and
// root-without-ref gates don't apply, since nothing here reads a marketplace
// file: VS Code loads the snapshot folder itself.
import { dirname, posix, win32 } from "node:path";
import type { PlanContext, Probe, ToolPlan } from "./pluginTools.js";
import type { Plugin } from "./types.js";
import { atLeast, parseVersion, type Version } from "./version.js";
import { PLUGIN_LOCATIONS, readPluginLocations } from "./vscodeSettings.js";

// `chat.pluginLocations` arrived in 1.115.0.
const MIN_VSCODE: Version = [1, 115, 0];
export const MIN_VSCODE_TEXT = MIN_VSCODE.join(".");

// As FULL_SHA in website/src/installCommand.ts.
const FULL_SHA = /^[0-9a-f]{40}$/;

const PROFILE_NOTE =
  "Only VS Code's default profile loads it; other profiles don't.";

/**
 * VS Code, from a kept Plugin snapshot: fetch the plugin's folder at
 * `source.commit` into the Snapshot store, where it stays, and add that folder
 * to `chat.pluginLocations` in the default profile's user settings.json. Every
 * other entry under this plugin's store folder goes, so after a re-approval
 * only the new commit loads; entries outside it are never touched. Any host,
 * path or ref.
 *
 * Settings that can't be read, parsed or edited become a step for the user,
 * the snapshot still kept so the step points at a real folder. With the entry
 * already set and its snapshot in the store, the plan is `done`.
 */
export function planVsCode(
  plugin: Pick<Plugin, "name" | "source" | "containedMcpServers">,
  probe: Pick<Probe, "git" | "vscode" | "snapshotStored">,
  { snapshot }: PlanContext,
): ToolPlan {
  const unavailable = (reason: string): ToolPlan => ({
    kind: "unavailable",
    reason,
  });
  const { commit } = plugin.source;
  if (!commit || !snapshot) {
    return unavailable(
      "The registry has no commit recorded for this plugin, so VS Code can't be pointed at the approved version.",
    );
  }
  // A short SHA can't name one folder per commit in the store.
  if (!FULL_SHA.test(commit)) {
    return unavailable(
      "The registry has no full commit SHA recorded for this plugin, so VS Code can't be pointed at the approved version.",
    );
  }
  const vscode = probe.vscode;
  if (!vscode?.userFolderFound) {
    return unavailable(
      `VS Code's user settings folder wasn't found at \`${vscode?.userFolder ?? "its usual place"}\`.`,
    );
  }
  // Only a version it can read stops it: `code` is often not on PATH.
  const version = vscode.code.found
    ? parseVersion(vscode.code.output.split("\n", 1)[0])
    : undefined;
  if (version && !atLeast(version, MIN_VSCODE)) {
    return unavailable(
      `Upgrade VS Code to ${MIN_VSCODE_TEXT} or later: older versions don't read \`${PLUGIN_LOCATIONS}\`.`,
    );
  }
  // git is needed only to fetch: a snapshot in the store is used as is.
  const noGit =
    !probe.snapshotStored && !probe.git
      ? unavailable(
          "git not found: this CLI fetches the approved commit for VS Code with the git on your PATH.",
        )
      : undefined;

  const add = snapshot.stored;
  const fetch = probe.snapshotStored
    ? []
    : [{ kind: "snapshot" as const, snapshot, keep: true }];
  const file = vscode.settingsFile;
  const read =
    vscode.settings.kind === "unreadable"
      ? {
          ok: false as const,
          problem: `It couldn't be read (${vscode.settings.error}).`,
        }
      : readPluginLocations(
          vscode.settings.kind === "read" ? vscode.settings.text : undefined,
        );
  if (!read.ok) {
    if (noGit) return noGit;
    return {
      kind: "manual",
      steps: [
        `Add \`"${add}": true\` to \`${PLUGIN_LOCATIONS}\` in ${file}, the user settings of VS Code's default profile.`,
      ],
      hint: `This CLI didn't edit ${file}. ${read.problem}`,
      actions: fetch,
    };
  }

  // The store keeps every commit of a plugin side by side in one folder.
  const ownFolder = dirname(add);
  const remove = Object.keys(read.locations).filter(
    (key) => key !== add && dirname(key) === ownFolder,
  );
  const set = read.locations[add] === true && !remove.length;
  if (set && probe.snapshotStored) {
    return {
      kind: "done",
      message: `\`${plugin.name}\` is already installed at the approved commit in VS Code's default profile.`,
    };
  }
  if (noGit) return noGit;
  return {
    kind: "run",
    actions: [
      ...fetch,
      ...(set ? [] : [{ kind: "edit-settings" as const, file, add, remove }]),
    ],
    notes: [PROFILE_NOTE],
    warnings: pluginDataWarnings(plugin.containedMcpServers),
    success: `Installed \`${plugin.name}\` at commit \`${commit.slice(0, 7)}\` in VS Code's default profile. Start a new chat to use it.`,
  };
}

/**
 * Stable VS Code's user settings folder: under `%APPDATA%` on Windows,
 * `~/Library/Application Support` on macOS, and `$XDG_CONFIG_HOME` (default
 * `~/.config`) elsewhere, as Electron places it.
 */
export function vsCodeUserFolder(
  platform: NodeJS.Platform,
  env: Record<string, string | undefined>,
  homeDir: string,
): string {
  if (platform === "win32") {
    const appData = env.APPDATA ?? win32.join(homeDir, "AppData", "Roaming");
    return win32.join(appData, "Code", "User");
  }
  if (platform === "darwin") {
    return posix.join(
      homeDir,
      "Library",
      "Application Support",
      "Code",
      "User",
    );
  }
  const config = env.XDG_CONFIG_HOME?.startsWith("/")
    ? env.XDG_CONFIG_HOME
    : posix.join(homeDir, ".config");
  return posix.join(config, "Code", "User");
}

// Mirrors pluginDataWarnings in website/src/installCommand.ts, wording and
// all. A feed that predates `usesPluginData` gets no warning.
function pluginDataWarnings(servers: Plugin["containedMcpServers"]): string[] {
  const names = servers
    .filter((server) => server.usesPluginData)
    .map((server) => server.name);
  if (!names.length) return [];
  const quoted = names.map((name) => `\`${name}\``);
  const which =
    quoted.length === 1
      ? `the MCP server ${quoted[0]} uses, so it may`
      : `the MCP servers ${quoted.slice(0, -1).join(", ")} and ${quoted.at(-1)} use, so they may`;
  return [
    `VS Code doesn't expand \`\${PLUGIN_DATA}\`, which ${which} not work there.`,
  ];
}
