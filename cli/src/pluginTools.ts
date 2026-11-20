// The Tools `install plugin` installs into, and how each is planned.
//
// Mirrors the rules of pluginInstallOptions in website/src/installCommand.ts
// by hand: which Tools a verdict gets, and each Tool's unavailable reasons.
// Keep them in sync. Where the CLI goes further than the website, it is
// because a terminal can do a step the website can only describe.
import { planCodex } from "./codexPlan.js";
import { planKiro } from "./kiroPlan.js";
import { planVsCode } from "./vscodePlan.js";
import type { Snapshot } from "./snapshotStore.js";
import type { Plugin } from "./types.js";

export type ToolId = "kiro" | "claude-code" | "codex" | "vscode";

/** Every Tool, in the order they are listed, planned and run. */
export const TOOLS: ToolId[] = ["kiro", "claude-code", "codex", "vscode"];

export const TOOL_LABELS: Record<ToolId, string> = {
  kiro: "Kiro",
  "claude-code": "Claude Code",
  codex: "Codex",
  vscode: "VS Code",
};

/**
 * One step of an install, as data rather than a closure: the confirmation
 * prints it, tests assert it, and the executor is the only code that carries
 * it out.
 */
export type Action =
  // fetch the snapshot into its staging folder, once per run however many
  // Tools ask; at the end of the run it is kept in the store if any Tool asked
  // to keep it, and deleted otherwise
  | { kind: "snapshot"; snapshot: Snapshot; keep: boolean }
  // run with stdin from /dev/null; onFailure runs once this fails, to undo
  // what the actions before it did
  | { kind: "exec"; argv: string[]; onFailure?: Action[] }
  | { kind: "write-file"; path: string; contents: string }
  | { kind: "edit-settings"; file: string; add: string; remove: string[] }
  // the run's own clean-up of a staging snapshot, never part of a plan
  | { kind: "remove"; path: string }
  | { kind: "move"; from: string; to: string };

/** What carrying out one action came to; `error` says why it failed. */
export type ActionResult = { ok: true } | { ok: false; error: string };

/**
 * What installing into one Tool comes to:
 * - run: the actions, then `success` once they all succeed
 * - manual: steps for the user, with any prep actions that still run first
 * - done: already installed at the approved commit
 * - unavailable: why the Tool can't install the approved plugin
 *
 * Notes, warnings, hints and reasons are prose in which backticks mark code.
 */
export type ToolPlan =
  | {
      kind: "run";
      actions: Action[];
      notes: string[];
      warnings: string[];
      success: string;
    }
  | { kind: "manual"; steps: string[]; hint?: string; actions?: Action[] }
  | { kind: "done"; message: string }
  | { kind: "unavailable"; reason: string };

/**
 * What running a Tool's CLI with `--version` gave: not found on PATH, or its
 * output, empty when it ran and failed.
 */
export type CommandProbe = { found: false } | { found: true; output: string };

/** A power listed in Kiro's `powers/installed.json`. */
export interface KiroPower {
  name: string;
  // "user-added" for a power imported in the Kiro IDE
  registryId?: string;
}

/** What reading a file came to; unreadable is any failure but its absence. */
export type FileRead =
  | { kind: "missing" }
  | { kind: "read"; text: string }
  | { kind: "unreadable"; error: string };

/** What the probe found of stable VS Code's default profile. */
export interface VsCodeProbe {
  // the user settings folder, where it was looked for
  userFolder: string;
  userFolderFound: boolean;
  // its settings.json
  settingsFile: string;
  settings: FileRead;
  // `code --version`, whose first line is the bare version
  code: CommandProbe;
}

/** What the probe found on this machine, for the Tools it was asked about. */
export interface Probe {
  // whether git is on PATH, asked only for the Tools that need a snapshot
  git?: boolean;
  codex?: CommandProbe;
  kiro?: CommandProbe;
  // the powers Kiro has installed; undefined when that can't be read
  kiroPowers?: KiroPower[];
  vscode?: VsCodeProbe;
  // whether the store already holds the snapshot of the approved commit
  snapshotStored?: boolean;
}

/** What planning knows about the run beyond the plugin and the probe. */
export interface PlanContext {
  // the snapshot this run would fetch; undefined without a commit
  snapshot?: Snapshot;
}

export interface PlannedTool {
  tool: ToolId;
  plan: ToolPlan;
}

/**
 * The Tools the registry offers a plugin, by its verdict, since the registry
 * backs the Agent Plugins specification: all four for an Agent Plugin, Claude
 * Code only for a plugin that isn't one. A missing verdict (a feed that
 * predates it) is unknown, not false, and gets all four. Unlike the website,
 * `npx plugins` is never offered: it installs the default branch and every
 * plugin in the repository.
 */
export function listedTools(plugin: Pick<Plugin, "isAgentPlugin">): ToolId[] {
  return plugin.isAgentPlugin === false ? ["claude-code"] : TOOLS;
}

const NOT_LISTED =
  "This plugin isn't an Agent Plugin, so the registry offers it for Claude Code only.";

function notYet(label: string): () => ToolPlan {
  return () => ({
    kind: "unavailable",
    reason: `This CLI doesn't install plugins into ${label} yet.`,
  });
}

// One planner per Tool. A new Tool is a planner here and an entry in TOOLS.
const PLANNERS: Record<
  ToolId,
  (plugin: Plugin, probe: Probe, context: PlanContext) => ToolPlan
> = {
  kiro: planKiro,
  "claude-code": notYet("Claude Code"),
  codex: (plugin, probe) => planCodex(plugin, probe.codex ?? { found: false }),
  vscode: planVsCode,
};

/**
 * A plan for each requested Tool, once each, those that can install first,
 * then the ones that can't, each group in the order of TOOLS. A requested Tool
 * the verdict doesn't list is unavailable, and the others are still planned.
 */
export function planTools(
  plugin: Plugin,
  requested: ToolId[],
  probe: Probe,
  context: PlanContext,
): PlannedTool[] {
  const listed = listedTools(plugin);
  const planned = TOOLS.filter((tool) => requested.includes(tool)).map(
    (tool): PlannedTool => ({
      tool,
      plan: listed.includes(tool)
        ? PLANNERS[tool](plugin, probe, context)
        : { kind: "unavailable", reason: NOT_LISTED },
    }),
  );
  // Stable, so each group keeps the order of TOOLS.
  return planned.sort(
    (a, b) =>
      Number(a.plan.kind === "unavailable") -
      Number(b.plan.kind === "unavailable"),
  );
}
