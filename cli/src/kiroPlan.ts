// Kiro's route. Its fallback, the Kiro IDE's "Import power from GitHub" step,
// mirrors kiroOption in website/src/installCommand.ts by hand, as does its
// no-commit reason: keep them in sync. Installing through kiro-cli from a
// snapshot is the CLI's own, so it is offered for any host, where the website
// offers github.com only.
import { isGitHubUrl, sourceTreeUrl } from "./cliSource.js";
import type {
  CommandProbe,
  KiroPower,
  PlanContext,
  Probe,
  ToolPlan,
} from "./pluginTools.js";
import type { Plugin } from "./types.js";
import { atLeast, parseVersionLine, type Version } from "./version.js";

// `kiro-cli chat --v3` and the Kiro IDE load powers kiro-cli installs from 3.0.0
// on; the 2.x chat ignores them.
const MIN_KIRO: Version = [3, 0, 0];
export const MIN_KIRO_TEXT = MIN_KIRO.join(".");

const IDE_ONLY_ON_GITHUB = "the Kiro IDE imports powers only from github.com";

/**
 * Kiro, from a Plugin snapshot: fetch the plugin's folder at `source.commit`
 * with the user's git, run `kiro-cli powers install` on it, and delete it,
 * since Kiro copies what it installs. A snapshot already in the store is used
 * as is, and not deleted. Installing again replaces the power, which is how a
 * power is updated, so a plan is never `done`.
 *
 * Without a kiro-cli it can run, nothing is fetched: on github.com the Kiro
 * IDE's import step, pinned to the commit, is the user's to take; elsewhere
 * Kiro is unavailable. That step needs no git, so git is checked only once
 * kiro-cli can run.
 */
export function planKiro(
  plugin: Pick<Plugin, "name" | "source" | "containedMcpServers">,
  probe: Pick<Probe, "git" | "kiro" | "kiroPowers" | "snapshotStored">,
  { snapshot }: PlanContext,
): ToolPlan {
  const unavailable = (reason: string): ToolPlan => ({
    kind: "unavailable",
    reason,
  });
  if (!plugin.source.commit || !snapshot) {
    return unavailable(
      "The registry has no commit recorded for this plugin, so Kiro can't be pointed at the approved version.",
    );
  }

  const problem = kiroProblem(probe.kiro ?? { found: false });
  if (problem) {
    if (!isGitHubUrl(plugin.source.url)) return unavailable(problem.reason);
    return {
      kind: "manual",
      steps: [
        `In Kiro, open Powers → Add Custom Power → Import power from GitHub, and enter ${sourceTreeUrl(plugin.source)}`,
      ],
      hint: problem.hint,
    };
  }
  if (!probe.git) {
    return unavailable(
      "git not found: this CLI fetches the approved commit for Kiro with the git on your PATH.",
    );
  }

  const folder = probe.snapshotStored ? snapshot.stored : snapshot.staging;
  return {
    kind: "run",
    actions: [
      ...(probe.snapshotStored
        ? []
        : [{ kind: "snapshot" as const, snapshot, keep: false }]),
      { kind: "exec", argv: ["kiro-cli", "powers", "install", folder] },
    ],
    notes: [
      ...replacedNote(plugin.name, probe.kiroPowers),
      ...mcpServersNote(plugin.containedMcpServers.map(({ name }) => name)),
    ],
    warnings: [],
    success: `Installed power \`${plugin.name}\`. It loads in \`kiro-cli chat --v3\` and the Kiro IDE.`,
  };
}

// kiro-cli names a power after plugin.json's name, which is the plugin's name
// in the feed, and replaces an installed power of that name.
function replacedNote(name: string, powers: KiroPower[] | undefined): string[] {
  const installed = powers?.find((power) => power.name === name);
  if (!installed) return [];
  const imported =
    installed.registryId === "user-added" ? " (imported in the Kiro IDE)" : "";
  return [`Replaces the installed power \`${name}\`${imported}.`];
}

// Kiro starts a power's MCP servers when it loads the power, without asking.
function mcpServersNote(names: string[]): string[] {
  if (!names.length) return [];
  const list = names.map((name) => `\`${name}\``).join(", ");
  return [
    names.length === 1
      ? `Its MCP server (${list}) starts automatically the next time Kiro loads the power.`
      : `Its MCP servers (${list}) start automatically the next time Kiro loads the power.`,
  ];
}

// Why this CLI can't run kiro-cli itself, as the hint beside the IDE step and
// as the reason Kiro is unavailable where there is no IDE step; undefined when
// it can.
function kiroProblem(
  kiro: CommandProbe,
): { hint: string; reason: string } | undefined {
  const lets = `With kiro-cli ${MIN_KIRO_TEXT} or later, this CLI installs the power for you.`;
  if (!kiro.found) {
    return {
      hint: `\`kiro-cli\` wasn't found on PATH. ${lets}`,
      reason: `Install kiro-cli ${MIN_KIRO_TEXT} or later: \`kiro-cli\` wasn't found on PATH, and ${IDE_ONLY_ON_GITHUB}.`,
    };
  }
  const version = parseVersionLine(kiro.output, "kiro-cli");
  if (!version) {
    const unread =
      "Couldn't read the kiro-cli version from `kiro-cli --version`";
    return {
      hint: `${unread}. ${lets}`,
      reason: `${unread}, and ${IDE_ONLY_ON_GITHUB}.`,
    };
  }
  if (!atLeast(version, MIN_KIRO)) {
    return {
      hint: `Upgrade kiro-cli to ${MIN_KIRO_TEXT} or later, and this CLI installs the power for you.`,
      reason: `Upgrade kiro-cli to ${MIN_KIRO_TEXT} or later: ${IDE_ONLY_ON_GITHUB}.`,
    };
  }
  return undefined;
}

/**
 * The powers in Kiro's `powers/installed.json`
 * (`{"installedPowers": [{"name": ..., "registryId"?: ...}]}`), skipping
 * entries without a name. Undefined when the text isn't of that shape, which
 * reads as unknown.
 */
export function parseKiroInstalled(text: string): KiroPower[] | undefined {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return undefined;
  }
  const powers = (data as { installedPowers?: unknown }).installedPowers;
  if (!Array.isArray(powers)) return undefined;
  return powers.flatMap((power: unknown): KiroPower[] => {
    if (typeof power !== "object" || power === null) return [];
    const { name, registryId } = power as Record<string, unknown>;
    if (typeof name !== "string") return [];
    return [typeof registryId === "string" ? { name, registryId } : { name }];
  });
}
