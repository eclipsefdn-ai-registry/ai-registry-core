import { parseArgs } from "node:util";
import { GUARDRAIL_ENV, PROJECT_CONFIG, resolveGuardrail } from "./config.js";
import type { Guardrail } from "./guardrail.js";
import type { InstallContext } from "./install.js";
import { installPlugin } from "./installPlugin.js";
import { MIN_CODEX_TEXT } from "./codexPlan.js";
import { MIN_KIRO_TEXT } from "./kiroPlan.js";
import { installSkill } from "./installSkill.js";
import {
  TOOLS,
  type Action,
  type ActionResult,
  type Probe,
  type ToolId,
} from "./pluginTools.js";
import {
  DEFAULT_REGISTRY,
  loadOrganizationsFeed,
  resolveRegistry,
} from "./registry.js";

const USAGE = `Usage: ai-registry install skill <id> [options]
       ai-registry install plugin <id> --tool <tool>... [options]

install skill installs a skill the AI Registry holds, through the skills CLI,
after printing who approved it and what the approval targets.

install plugin installs a plugin the AI Registry holds, at the commit that was
approved, into each Tool named with --tool, after printing who approved it.
It asks once, listing every command it will run, then reports one line per
Tool. It exits 0 only when every Tool ends installed or already installed.

Options:
  -y, --yes             Install without asking; for install skill, also let
                        the skills CLI install to the agents it detects
                        without asking either
  -a, --agent <name>    install skill: install for this agent; repeat for
                        several
  -g, --global          install skill: install for the user rather than the
                        project
      --tool <tool>     install plugin: install into this Tool, one of
                        ${TOOLS.join(", ")}; repeat for several.
                        Kiro needs git and kiro-cli ${MIN_KIRO_TEXT} or later on
                        PATH; without kiro-cli, a github.com plugin gets the
                        Kiro IDE's import step to take yourself.
                        Codex needs codex ${MIN_CODEX_TEXT} or later on PATH, or the
                        steps are printed for you to run
      --registry <url|path>
                        Read the registry from this base URL or local
                        directory, such as dist/api/v1 (default:
                        $AI_REGISTRY_URL, then ${DEFAULT_REGISTRY})
      --require-approval-from <org,...|off>
                        Install only what one of these organizations
                        approved; off installs anything the registry holds
                        (default: $${GUARDRAIL_ENV}, then
                        requireApprovalFrom in ./${PROJECT_CONFIG}, then in
                        ~/.config/ai-registry/config.json, then off)
  -h, --help            Show this help

The approval guardrail binds installs that go through this CLI only. It can't
stop anyone running the installers directly, such as npx skills add.

For Kiro, install plugin fetches the plugin's folder at the approved commit
with your git into $XDG_DATA_HOME/ai-registry/plugins/ (default
~/.local/share/ai-registry/plugins/), and deletes it once Kiro has its copy.

Config files hold JSON: {"requireApprovalFrom": ["eclipse", "anthropic"]}
or {"requireApprovalFrom": "off"}. $XDG_CONFIG_HOME replaces ~/.config.`;

/** Everything run touches outside the feed, so tests can stand it in. */
export interface Deps {
  env: Record<string, string | undefined>;
  // where the project and user config files are looked up
  cwd: string;
  homeDir: string;
  isTTY: boolean;
  printErr: (line: string) => void;
  confirm: (question: string) => Promise<boolean>;
  // runs the skills CLI with these arguments, resolving to its exit code
  runSkills: (args: string[]) => Promise<number>;
  // finds out what install plugin's planners need to know about these Tools
  // on this machine, including whether the Snapshot store holds the folder
  // `stored`; never throws, since what it can't read is unknown
  probe: (tools: ToolId[], stored?: string) => Promise<Probe>;
  // carries out one action of a Tool's plan
  execute: (action: Action) => Promise<ActionResult>;
}

/**
 * Runs one command line and resolves to the exit code. Everything this CLI
 * says goes to stderr, so stdout carries only the installer's own output.
 *
 * Typed rather than inferred (`install skill <id>`, `install plugin <id>`)
 * because ids are only
 * unique within a type.
 */
export async function run(argv: string[], deps: Deps): Promise<number> {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        registry: { type: "string" },
        "require-approval-from": { type: "string" },
        yes: { type: "boolean", short: "y" },
        agent: { type: "string", short: "a", multiple: true },
        global: { type: "boolean", short: "g" },
        tool: { type: "string", multiple: true },
        help: { type: "boolean", short: "h" },
      },
    });
  } catch (error) {
    return usageError(deps, (error as Error).message);
  }
  const { values, positionals } = parsed;
  if (values.help) {
    deps.printErr(USAGE);
    return 0;
  }
  const [command, type, id, ...rest] = positionals;
  if (
    command !== "install" ||
    (type !== "skill" && type !== "plugin") ||
    !id ||
    rest.length
  ) {
    return usageError(deps);
  }
  const tools = values.tool ?? [];
  if (type === "skill" && tools.length) {
    return usageError(
      deps,
      "--tool is for install plugin; install skill takes --agent.",
    );
  }
  if (type === "plugin" && (values.agent || values.global)) {
    return usageError(
      deps,
      "--agent and --global are for install skill; install plugin takes --tool.",
    );
  }
  const unknown = tools.find((tool) => !isToolId(tool));
  if (unknown !== undefined) {
    return usageError(
      deps,
      `Unknown tool ${unknown}: --tool takes ${TOOLS.join(", ")}.`,
    );
  }

  let guardrail: Guardrail;
  try {
    guardrail = await resolveGuardrail(values["require-approval-from"], deps);
  } catch (error) {
    deps.printErr((error as Error).message);
    return 1;
  }
  const registry = resolveRegistry(values.registry, deps.env);
  const context: InstallContext = {
    registry,
    guardrail,
    organizations: loadOrganizationsFeed(registry).then(
      (feed) => feed.organizations,
      () => [],
    ),
  };
  if (type === "plugin") {
    return installPlugin(
      id,
      { tools: tools.filter(isToolId), yes: values.yes },
      context,
      deps,
    );
  }
  return installSkill(
    id,
    { yes: values.yes, agents: values.agent, global: values.global },
    context,
    deps,
  );
}

function isToolId(value: string): value is ToolId {
  return (TOOLS as string[]).includes(value);
}

function usageError(deps: Deps, message?: string): number {
  if (message) deps.printErr(message);
  deps.printErr(USAGE);
  return 1;
}
