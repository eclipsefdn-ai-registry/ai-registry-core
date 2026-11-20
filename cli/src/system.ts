// The real probe and executor behind install plugin: the only code that runs
// Tools' CLIs. Kept thin, since none of it is unit-tested; the decisions live
// in the pure planners.
import { spawn } from "node:child_process";
import type {
  Action,
  ActionResult,
  CommandProbe,
  Probe,
  ToolId,
} from "./pluginTools.js";

interface Finished {
  code: number | null;
  stdout: string;
  stderr: string;
}

/**
 * Runs a command with stdin from /dev/null, so a Tool's CLI never waits for
 * input nobody can give it. Its stderr is passed through as it comes, and kept
 * for the report; its stdout is either kept (`capture`) or passed through.
 * Resolves to undefined when the command isn't on PATH.
 */
function runCommand(
  argv: string[],
  capture: boolean,
): Promise<Finished | undefined> {
  return new Promise((resolve) => {
    const child = spawn(argv[0], argv.slice(1), {
      stdio: ["ignore", capture ? "pipe" : "inherit", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => (stdout += chunk));
    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
      if (!capture) process.stderr.write(chunk);
    });
    child.on("error", (error: NodeJS.ErrnoException) =>
      resolve(
        error.code === "ENOENT"
          ? undefined
          : { code: null, stdout, stderr: error.message },
      ),
    );
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

async function probeVersion(command: string): Promise<CommandProbe> {
  const finished = await runCommand([command, "--version"], true);
  if (!finished) return { found: false };
  return { found: true, output: finished.code === 0 ? finished.stdout : "" };
}

export async function probe(tools: ToolId[]): Promise<Probe> {
  const result: Probe = {};
  if (tools.includes("codex")) result.codex = await probeVersion("codex");
  return result;
}

export async function execute(action: Action): Promise<ActionResult> {
  if (action.kind !== "exec") {
    return {
      ok: false,
      error: `This CLI can't carry out a ${action.kind} action yet.`,
    };
  }
  const finished = await runCommand(action.argv, false);
  if (!finished) {
    return { ok: false, error: `${action.argv[0]} wasn't found on PATH.` };
  }
  if (finished.code === 0) return { ok: true };
  const exit =
    finished.code === null ? "didn't finish" : `exited ${finished.code}`;
  return { ok: false, error: `It ${exit}.\n${finished.stderr}` };
}
