// The Tools `install plugin` installs into, and how each is planned.
//
// Mirrors the rules of pluginInstallOptions in website/src/installCommand.ts
// by hand: which Tools a verdict gets, and each Tool's unavailable reasons.
// Keep them in sync. Where the CLI goes further than the website, it is
// because a terminal can do a step the website can only describe.
import { planCodex } from "./codexPlan.js";
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
  | { kind: "snapshot"; keep: boolean }
  // run with stdin from /dev/null; onFailure runs once this fails, to undo
  // what the actions before it did
  | { kind: "exec"; argv: string[]; onFailure?: Action[] }
  | { kind: "write-file"; path: string; contents: string }
  | { kind: "edit-settings"; file: string; add: string; remove: string[] };

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

/** What the probe found on this machine, for the Tools it was asked about. */
export interface Probe {
  codex?: CommandProbe;
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
const PLANNERS: Record<ToolId, (plugin: Plugin, probe: Probe) => ToolPlan> = {
  kiro: notYet("Kiro"),
  "claude-code": notYet("Claude Code"),
  codex: (plugin, probe) => planCodex(plugin, probe.codex ?? { found: false }),
  vscode: notYet("VS Code"),
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
): PlannedTool[] {
  const listed = listedTools(plugin);
  const planned = TOOLS.filter((tool) => requested.includes(tool)).map(
    (tool): PlannedTool => ({
      tool,
      plan: listed.includes(tool)
        ? PLANNERS[tool](plugin, probe)
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
