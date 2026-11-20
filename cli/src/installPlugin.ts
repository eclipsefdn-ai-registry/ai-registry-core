import { randomBytes } from "node:crypto";
import { sourceTreeUrl } from "./cliSource.js";
import { approvalLines, field, organizationNamer } from "./describeSkill.js";
import {
  approvalGate,
  confirmInstall,
  type InstallContext,
} from "./install.js";
import {
  listedTools,
  type ActionResult,
  planTools,
  TOOL_LABELS,
  TOOLS,
  type Action,
  type PlannedTool,
  type ToolId,
  type ToolPlan,
} from "./pluginTools.js";
import { loadPluginsFeed } from "./registry.js";
import type { Deps } from "./run.js";
import { snapshotFor, storeRoot, type Snapshot } from "./snapshotStore.js";
import type { Plugin, PluginsFeed } from "./types.js";

export interface PluginInstallOptions {
  tools: ToolId[];
  yes?: boolean;
}

type Status =
  | "installed"
  | "already installed"
  | "manual step needed"
  | "unavailable"
  | "failed";

interface ToolResult {
  tool: ToolId;
  status: Status;
  // what follows the status on its line, and any lines under it
  detail: string;
  more: string[];
}

/**
 * `install plugin <id>`: installs one approved plugin, at its approved commit,
 * into each requested Tool. Describes the plugin and checks the guardrail
 * before anything else, probes and plans each Tool, asks once for everything
 * that will run, runs it, and reports one line per Tool. Resolves to 0 only
 * when every requested Tool ends installed or already installed.
 */
export async function installPlugin(
  id: string,
  options: PluginInstallOptions,
  context: InstallContext,
  deps: Deps,
): Promise<number> {
  const { registry } = context;
  let feed: PluginsFeed;
  try {
    feed = await loadPluginsFeed(registry);
  } catch (error) {
    deps.printErr((error as Error).message);
    return 1;
  }
  // Exact match only: a near miss installed in its place would be something
  // nobody asked for.
  const plugin = feed.plugins.find((p) => p.pluginId === id);
  if (!plugin) {
    deps.printErr(`No plugin with id ${id} in the registry at ${registry}.`);
    return 1;
  }
  const orgName = organizationNamer(await context.organizations);
  for (const line of describePlugin(plugin, orgName)) deps.printErr(line);
  if (!approvalGate(plugin.approvals, context.guardrail, orgName, deps)) {
    return 1;
  }
  // No Tool is ever picked for the user: one nobody named could get a plugin
  // nobody asked it to have.
  if (!options.tools.length) {
    deps.printErr(
      `Not installing: say which Tools to install it into with --tool (${TOOLS.join(", ")}).`,
    );
    return 1;
  }

  const listed = listedTools(plugin);
  const snapshot = snapshotFor(
    storeRoot(deps.env, deps.homeDir),
    plugin,
    randomBytes(4).toString("hex"),
  );
  const probe = await deps.probe(
    options.tools.filter((tool) => listed.includes(tool)),
    snapshot?.stored,
  );
  const planned = planTools(plugin, options.tools, probe, { snapshot });

  if (planned.some(({ plan }) => actionsOf(plan).length)) {
    for (const line of confirmationLines(planned)) deps.printErr(line);
    if (!(await confirmInstall(options.yes, deps))) return 1;
  }

  const runner = new Runner(deps);
  const results: ToolResult[] = [];
  for (const { tool, plan } of planned) {
    results.push(await carryOut(tool, plan, runner));
  }
  await runner.finish();
  for (const line of reportLines(results)) deps.printErr(line);
  return results.every(
    (r) => r.status === "installed" || r.status === "already installed",
  )
    ? 0
    : 1;
}

/**
 * What is about to be installed, printed before anything is: the plugin, its
 * source at the approved commit, the commit, and every approval behind it.
 */
export function describePlugin(
  plugin: Plugin,
  orgName: (id: string) => string,
): string[] {
  return [
    `${plugin.name} (${plugin.pluginId})`,
    field("Source", sourceTreeUrl(plugin.source)),
    field("Commit", plugin.source.commit ?? "none recorded"),
    ...approvalLines(plugin.approvals, orgName),
  ];
}

// The actions a plan runs: a manual plan's are the prep its steps rely on.
function actionsOf(plan: ToolPlan): Action[] {
  if (plan.kind === "run") return plan.actions;
  if (plan.kind === "manual") return plan.actions ?? [];
  return [];
}

/**
 * The one confirmation's text: the snapshot, if any Tool needs one, with where
 * it is fetched and whether it is kept; per Tool that will run something, its
 * commands, notes and warnings; then the Tools that won't, and why.
 */
export function confirmationLines(planned: PlannedTool[]): string[] {
  const lines: string[] = [];
  const fetches = planned.flatMap(({ plan }) =>
    actionsOf(plan).filter((action) => action.kind === "snapshot"),
  );
  if (fetches.length) {
    const { snapshot } = fetches[0]!;
    lines.push(`Fetch: ${describeAction(fetches[0]!).replace(/^fetch /, "")}`);
    lines.push(
      fetches.some((fetch) => fetch.keep)
        ? `  into ${snapshot.staging}, then kept at ${snapshot.stored}`
        : `  into ${snapshot.staging}, deleted once the install is over`,
    );
  }
  for (const { tool, plan } of planned) {
    // The fetch is listed once above, however many Tools use it.
    const actions = actionsOf(plan).filter(
      (action) => action.kind !== "snapshot",
    );
    if (!actions.length) continue;
    lines.push(`${TOOL_LABELS[tool]} will run:`);
    for (const action of actions) lines.push(`  ${describeAction(action)}`);
    if (plan.kind === "run") {
      for (const note of plan.notes) lines.push(`  Note: ${note}`);
      for (const warning of plan.warnings) lines.push(`  Warning: ${warning}`);
    }
  }
  for (const { tool, plan } of planned) {
    if (plan.kind === "unavailable") {
      lines.push(`${TOOL_LABELS[tool]} can't install it: ${plan.reason}`);
    } else if (plan.kind === "done") {
      lines.push(`${TOOL_LABELS[tool]}: ${plan.message}`);
    }
  }
  return lines;
}

/** One action as the confirmation and the report show it. */
export function describeAction(action: Action): string {
  switch (action.kind) {
    case "exec":
      return action.argv.map(shellWord).join(" ");
    case "snapshot": {
      const { url, path, commit } = action.snapshot;
      return `fetch ${path ? `${path} from ` : ""}${url} at ${commit}`;
    }
    case "write-file":
      return `write ${action.path}`;
    case "edit-settings":
      return `add ${action.add} to ${action.file}`;
    case "remove":
      return `delete ${action.path}`;
    case "move":
      return `move ${action.from} to ${action.to}`;
  }
}

// Quotes an argument the way a POSIX shell would need it, so a printed
// command can be copied and run.
function shellWord(word: string): string {
  return /^[\w@%+=:,./-]+$/.test(word)
    ? word
    : `'${word.replace(/'/g, `'\\''`)}'`;
}

/**
 * Carries out the actions of every Tool in a run. The snapshot is fetched once,
 * however many Tools ask for it, and a Tool that asks after a failed fetch
 * gets the same failure. `finish` then keeps the snapshot in the store if any
 * Tool asked to keep it, and deletes its staging folder otherwise, whether the
 * installs succeeded or not.
 */
class Runner {
  private fetch?: { snapshot: Snapshot; result: Promise<ActionResult> };
  private keep = false;

  constructor(private readonly deps: Pick<Deps, "execute" | "printErr">) {}

  execute(action: Action): Promise<ActionResult> {
    if (action.kind !== "snapshot") return this.announce(action);
    this.keep ||= action.keep;
    this.fetch ??= { snapshot: action.snapshot, result: this.announce(action) };
    return this.fetch.result;
  }

  private announce(action: Action): Promise<ActionResult> {
    this.deps.printErr(`Running: ${describeAction(action)}`);
    return this.deps.execute(action);
  }

  async finish(): Promise<void> {
    if (!this.fetch) return;
    const { snapshot } = this.fetch;
    const fetched = (await this.fetch.result).ok;
    const cleanUp: Action =
      fetched && this.keep
        ? { kind: "move", from: snapshot.staging, to: snapshot.stored }
        : { kind: "remove", path: snapshot.staging };
    const outcome = await this.deps.execute(cleanUp);
    if (!outcome.ok) {
      this.deps.printErr(
        `Couldn't ${describeAction(cleanUp)}: ${outcome.error.trim()}`,
      );
    }
  }
}

// Carries out one Tool's plan. A failed action stops this Tool's remaining
// actions, never the next Tool's.
async function carryOut(
  tool: ToolId,
  plan: ToolPlan,
  runner: Runner,
): Promise<ToolResult> {
  const result = (status: Status, detail: string, more: string[] = []) => ({
    tool,
    status,
    detail,
    more,
  });
  if (plan.kind === "unavailable") return result("unavailable", plan.reason);
  if (plan.kind === "done") return result("already installed", plan.message);

  for (const action of actionsOf(plan)) {
    const outcome = await runner.execute(action);
    if (outcome.ok) continue;
    return result(
      "failed",
      `\`${describeAction(action)}\` failed.`,
      errorLines(outcome.error),
    );
  }

  if (plan.kind === "manual") {
    return result(
      "manual step needed",
      plan.hint ?? "",
      plan.steps.map((step, i) => `${i + 1}. ${step}`),
    );
  }
  return result("installed", plan.success);
}

function errorLines(error: string): string[] {
  return error
    .trimEnd()
    .split("\n")
    .filter((line) => line.trim());
}

/** One line per requested Tool, with any steps or errors indented under it. */
function reportLines(results: ToolResult[]): string[] {
  return results.flatMap(({ tool, status, detail, more }) => [
    `${TOOL_LABELS[tool]}: ${status}${detail ? `. ${detail}` : ""}`,
    ...more.map((line) => `  ${line}`),
  ]);
}
