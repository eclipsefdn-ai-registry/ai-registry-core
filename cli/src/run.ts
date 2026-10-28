import { parseArgs } from "node:util";
import { GUARDRAIL_ENV, PROJECT_CONFIG, resolveGuardrail } from "./config.js";
import {
  describePlugin,
  describeSkill,
  field,
  organizationNamer,
} from "./describe.js";
import {
  checkApprovals,
  guardrailLines,
  type Approval,
  type Guardrail,
} from "./guardrail.js";
import {
  DEFAULT_REGISTRY,
  loadOrganizationsFeed,
  loadPluginsFeed,
  loadSkillsFeed,
} from "./registry.js";
import { manualInstallCommands, pluginsAddArgs } from "./pluginsAdd.js";
import { skillsAddArgs } from "./skillsAdd.js";
import type { Organization } from "./types.js";

const USAGE = `Usage: ai-registry install skill <id> [options]
       ai-registry install plugin <id> [options]

Installs a skill or plugin the AI Registry holds, through the skills or
plugins CLI, after printing who approved it and what the approval targets.

Options:
  -y, --yes             Install without asking, and let the installer
                        install to the tools it detects without asking either.
                        A plugin in a subdirectory still needs a terminal:
                        the plugins CLI would install its neighbours too
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

install skill:
  -a, --agent <name>    Install for this agent; repeat for several
  -g, --global          Install for the user rather than the project

install plugin:
  -t, --target <tool>   Install for this tool only, such as claude-code
  -s, --scope <scope>   user (the plugins CLI's default), project, or local

The approval guardrail binds installs that go through this CLI only. It can't
stop anyone running the installers directly, such as npx skills add.

Config files hold JSON: {"requireApprovalFrom": ["eclipse", "anthropic"]}
or {"requireApprovalFrom": "off"}. $XDG_CONFIG_HOME replaces ~/.config.`;

// The flags only one install command takes, which the other rejects.
const OWN_OPTIONS = {
  skill: ["agent", "global"],
  plugin: ["target", "scope"],
} as const;
const SCOPES = ["user", "project", "local"];

export type Installer = "skills" | "plugins";

/** Everything run touches outside the feed, so tests can stand it in. */
export interface Deps {
  env: Record<string, string | undefined>;
  // where the project and user config files are looked up
  cwd: string;
  homeDir: string;
  isTTY: boolean;
  printErr: (line: string) => void;
  confirm: (question: string) => Promise<boolean>;
  // runs the installer's CLI with these arguments, resolving to its exit code
  runInstaller: (installer: Installer, args: string[]) => Promise<number>;
}

/**
 * Runs one command line and resolves to the exit code. Everything this CLI
 * says goes to stderr, so stdout carries only the installer's own output.
 *
 * Typed rather than inferred (`install skill <id>`) because ids are only
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
        target: { type: "string", short: "t" },
        scope: { type: "string", short: "s" },
        help: { type: "boolean", short: "h" },
      },
    });
  } catch (error) {
    return usageError(deps, error instanceof Error ? error.message : "");
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
  const other = type === "skill" ? "plugin" : "skill";
  const foreign = OWN_OPTIONS[other].find((name) => values[name] !== undefined);
  if (foreign) {
    return usageError(deps, `--${foreign} is an option of install ${other}.`);
  }
  if (values.scope !== undefined && !SCOPES.includes(values.scope)) {
    return usageError(deps, `--scope takes ${SCOPES.join(", ")}.`);
  }

  let guardrail: Guardrail;
  try {
    guardrail = await resolveGuardrail({
      flag: values["require-approval-from"],
      env: deps.env,
      cwd: deps.cwd,
      homeDir: deps.homeDir,
    });
  } catch (error) {
    deps.printErr(error instanceof Error ? error.message : String(error));
    return 1;
  }
  const registry =
    values.registry ?? deps.env.AI_REGISTRY_URL ?? DEFAULT_REGISTRY;
  const context = { registry, guardrail, deps };

  if (type === "skill") {
    const skill = await resolve(context, id, {
      type: "skill",
      load: async (r) => {
        const feed = await loadSkillsFeed(r);
        return { generatedAt: feed.generatedAt, entries: feed.skills };
      },
      idOf: (s) => s.skillId,
      describe: describeSkill,
    });
    if (!skill) return 1;
    const args = skillsAddArgs(skill, {
      yes: values.yes,
      agents: values.agent,
      global: values.global,
    });
    // Never falls back to the default branch: that would install content
    // nobody approved.
    if (!args) {
      deps.printErr(
        `Not installing: the skills CLI can't install ${skill.source.ref} from ${skill.source.url}. It reads a ref only from GitHub and gitlab.com sources, and anything else would install something other than what was approved.`,
      );
      return 1;
    }
    return confirmAndInstall(deps, "skills", args, values.yes);
  }

  const plugin = await resolve(context, id, {
    type: "plugin",
    load: async (r) => {
      const feed = await loadPluginsFeed(r);
      return { generatedAt: feed.generatedAt, entries: feed.plugins };
    },
    idOf: (p) => p.pluginId,
    describe: describePlugin,
  });
  if (!plugin) return 1;
  const args = pluginsAddArgs(plugin, {
    yes: values.yes,
    target: values.target,
    scope: values.scope,
  });
  // The plugins CLI clones the default branch and takes no ref, so it can't
  // install what a ref approved. See pluginsAddArgs for when this goes away.
  if (!args) {
    deps.printErr(
      `Not installing: the plugins CLI can't install ${plugin.source.ref} from ${plugin.source.url}. It always installs the default branch, which isn't what was approved. To install the approved revision by hand:`,
    );
    for (const line of manualInstallCommands(plugin)) {
      deps.printErr(`  ${line}`);
    }
    return 1;
  }
  if (plugin.source.path) {
    // Given the repository, the plugins CLI discovers every plugin in it, and
    // without a terminal installs them all. On one, it asks which to keep.
    if (!deps.isTTY) {
      deps.printErr(
        `Not installing: the plugins CLI would install every plugin in ${plugin.source.url}, not only ${plugin.name}, and with no terminal there is no way to pick. Run this from a terminal.`,
      );
      return 1;
    }
    deps.printErr(
      `The plugins CLI will list every plugin in the repository: keep only ${plugin.name} selected, the others aren't covered by this approval.`,
    );
  }
  return confirmAndInstall(deps, "plugins", args, values.yes);
}

interface ArtifactType<T extends { approvals: Approval[] }> {
  type: "skill" | "plugin";
  load: (registry: string) => Promise<{ generatedAt?: string; entries: T[] }>;
  idOf: (entry: T) => string;
  describe: (
    entry: T,
    organizations: Organization[],
    generatedAt?: string,
  ) => string[];
}

/**
 * The step every install command shares: finds the id in its type's feed,
 * prints what it found and who approved it, and holds it to the approval
 * guardrail. Resolves to undefined, having said why, when there is nothing to
 * install or the guardrail refuses it.
 */
async function resolve<T extends { approvals: Approval[] }>(
  {
    registry,
    guardrail,
    deps,
  }: { registry: string; guardrail: Guardrail; deps: Deps },
  id: string,
  artifact: ArtifactType<T>,
): Promise<T | undefined> {
  // Organization names are display only: without them approvals show ids,
  // which is no reason to refuse an install.
  const organizations = loadOrganizationsFeed(registry).then(
    (feed) => feed.organizations,
    () => [],
  );
  let feed;
  try {
    feed = await artifact.load(registry);
  } catch (error) {
    deps.printErr(error instanceof Error ? error.message : String(error));
    return undefined;
  }
  // Exact match only: a near miss installed in its place would be something
  // nobody asked for.
  const entry = feed.entries.find((e) => artifact.idOf(e) === id);
  if (!entry) {
    deps.printErr(
      `No ${artifact.type} with id ${id} in the registry at ${registry}.`,
    );
    return undefined;
  }
  const orgs = await organizations;
  for (const line of artifact.describe(entry, orgs, feed.generatedAt)) {
    deps.printErr(line);
  }
  const decision = checkApprovals(
    entry.approvals,
    guardrail.requireApprovalFrom,
  );
  const orgName = organizationNamer(orgs);
  for (const line of guardrailLines(decision, guardrail, orgName)) {
    deps.printErr(line);
  }
  return decision.allowed ? entry : undefined;
}

/** Prints the command, asks unless told not to, then hands over. */
async function confirmAndInstall(
  deps: Deps,
  installer: Installer,
  args: string[],
  yes: boolean | undefined,
): Promise<number> {
  deps.printErr(field("Command", `${installer} ${args.join(" ")}`));
  if (!yes) {
    // An agent can't answer a prompt, so waiting for one would hang it.
    if (!deps.isTTY) {
      deps.printErr(
        "Not installing: there is no terminal to confirm on. Pass --yes to install without asking.",
      );
      return 1;
    }
    if (!(await deps.confirm("Install it?"))) {
      deps.printErr("Nothing was installed.");
      return 1;
    }
  }
  return deps.runInstaller(installer, args);
}

function usageError(deps: Deps, message?: string): number {
  if (message) deps.printErr(message);
  deps.printErr(USAGE);
  return 1;
}
