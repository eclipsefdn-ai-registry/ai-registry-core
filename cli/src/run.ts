import { parseArgs } from "node:util";
import { describeSkill, field } from "./describeSkill.js";
import {
  DEFAULT_REGISTRY,
  loadOrganizationsFeed,
  loadSkillsFeed,
} from "./registry.js";
import { skillsAddArgs } from "./skillsAdd.js";
import type { SkillsFeed } from "./types.js";

const USAGE = `Usage: ai-registry install skill <id> [options]

Installs a skill the AI Registry holds, through the skills CLI, after printing
who approved it and what the approval targets.

Options:
  -y, --yes             Install without asking, and let the skills CLI install
                        to the agents it detects without asking either
  -a, --agent <name>    Install for this agent; repeat for several
  -g, --global          Install for the user rather than the project
      --registry <url|path>
                        Read the registry from this base URL or local
                        directory, such as dist/api/v1 (default:
                        $AI_REGISTRY_URL, then ${DEFAULT_REGISTRY})
  -h, --help            Show this help`;

/** Everything run touches outside the feed, so tests can stand it in. */
export interface Deps {
  env: Record<string, string | undefined>;
  isTTY: boolean;
  printErr: (line: string) => void;
  confirm: (question: string) => Promise<boolean>;
  // runs the skills CLI with these arguments, resolving to its exit code
  runSkills: (args: string[]) => Promise<number>;
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
        yes: { type: "boolean", short: "y" },
        agent: { type: "string", short: "a", multiple: true },
        global: { type: "boolean", short: "g" },
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
  if (command !== "install" || type !== "skill" || !id || rest.length) {
    return usageError(deps);
  }

  const registry =
    values.registry ?? deps.env.AI_REGISTRY_URL ?? DEFAULT_REGISTRY;
  // Organization names are display only: without them approvals show ids,
  // which is no reason to refuse an install.
  const organizations = loadOrganizationsFeed(registry).then(
    (feed) => feed.organizations,
    () => [],
  );
  let skillsFeed: SkillsFeed;
  try {
    skillsFeed = await loadSkillsFeed(registry);
  } catch (error) {
    deps.printErr(error instanceof Error ? error.message : String(error));
    return 1;
  }

  // Exact match only: a near miss installed in its place would be something
  // nobody asked for.
  const skill = skillsFeed.skills.find((s) => s.skillId === id);
  if (!skill) {
    deps.printErr(`No skill with id ${id} in the registry at ${registry}.`);
    return 1;
  }
  for (const line of describeSkill(
    skill,
    await organizations,
    skillsFeed.generatedAt,
  )) {
    deps.printErr(line);
  }

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
  deps.printErr(field("Command", `skills ${args.join(" ")}`));

  if (!values.yes) {
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
  return deps.runSkills(args);
}

function usageError(deps: Deps, message?: string): number {
  if (message) deps.printErr(message);
  deps.printErr(USAGE);
  return 1;
}
