// The real probe and executor behind install plugin: the only code that runs
// Tools' CLIs. Kept thin, since none of it is unit-tested; the decisions live
// in the pure planners.
import { spawn } from "node:child_process";
import {
  cp,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join } from "node:path";
import { parseKiroInstalled } from "./kiroPlan.js";
import type {
  Action,
  ActionResult,
  CommandProbe,
  FileRead,
  KiroPower,
  Probe,
  ToolId,
} from "./pluginTools.js";
import type { Snapshot } from "./snapshotStore.js";
import { vsCodeUserFolder } from "./vscodePlan.js";
import { editPluginLocations } from "./vscodeSettings.js";

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
  env?: NodeJS.ProcessEnv,
): Promise<Finished | undefined> {
  return new Promise((resolve) => {
    const child = spawn(argv[0], argv.slice(1), {
      stdio: ["ignore", capture ? "pipe" : "inherit", "pipe"],
      ...(env ? { env } : {}),
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

// The Tools that install from a Plugin snapshot, and so need git.
const SNAPSHOT_TOOLS: ToolId[] = ["kiro", "vscode"];

export async function probe(tools: ToolId[], stored?: string): Promise<Probe> {
  const result: Probe = {};
  if (tools.some((tool) => SNAPSHOT_TOOLS.includes(tool))) {
    result.git = (await probeVersion("git")).found;
    result.snapshotStored = stored !== undefined && (await isDirectory(stored));
  }
  if (tools.includes("codex")) result.codex = await probeVersion("codex");
  if (tools.includes("kiro")) {
    result.kiro = await probeVersion("kiro-cli");
    result.kiroPowers = await readKiroPowers();
  }
  if (tools.includes("vscode")) {
    const userFolder = vsCodeUserFolder(
      process.platform,
      process.env,
      homedir(),
    );
    const settingsFile = join(userFolder, "settings.json");
    result.vscode = {
      userFolder,
      userFolderFound: await isDirectory(userFolder),
      settingsFile,
      settings: await readText(settingsFile),
      code: await probeVersion("code"),
    };
  }
  return result;
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

async function readText(path: string): Promise<FileRead> {
  try {
    return { kind: "read", text: await readFile(path, "utf-8") };
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT"
      ? { kind: "missing" }
      : { kind: "unreadable", error: (error as Error).message };
  }
}

// Kiro keeps its state under $KIRO_HOME, ~/.kiro by default.
async function readKiroPowers(): Promise<KiroPower[] | undefined> {
  const kiroHome = process.env.KIRO_HOME;
  const home =
    kiroHome && isAbsolute(kiroHome) ? kiroHome : join(homedir(), ".kiro");
  try {
    return parseKiroInstalled(
      await readFile(join(home, "powers", "installed.json"), "utf-8"),
    );
  } catch {
    return undefined;
  }
}

export async function execute(action: Action): Promise<ActionResult> {
  try {
    switch (action.kind) {
      case "exec":
        return await execCommand(action.argv);
      case "snapshot":
        return await fetchSnapshot(action.snapshot);
      case "remove":
        await rm(action.path, { recursive: true, force: true });
        return { ok: true };
      case "move":
        await rename(action.from, action.to);
        return { ok: true };
      case "edit-settings":
        return await editSettings(action.file, action.add, action.remove);
      default:
        return {
          ok: false,
          error: `This CLI can't carry out a ${action.kind} action yet.`,
        };
    }
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

/**
 * Edits `chat.pluginLocations` in a VS Code settings.json as it is now, which
 * may differ from what the probe read. Written in place rather than through a
 * temporary file, so a symlinked settings.json stays a symlink; a missing one
 * is created. Settings that can't be edited are left as they are.
 */
async function editSettings(
  file: string,
  add: string,
  remove: string[],
): Promise<ActionResult> {
  const current = await readText(file);
  if (current.kind === "unreadable") return { ok: false, error: current.error };
  const text = current.kind === "read" ? current.text : undefined;
  await writeFile(file, editPluginLocations(text, add, remove), "utf-8");
  return { ok: true };
}

async function execCommand(
  argv: string[],
  env?: NodeJS.ProcessEnv,
): Promise<ActionResult> {
  const finished = await runCommand(argv, false, env);
  if (!finished) {
    return { ok: false, error: `${argv[0]} wasn't found on PATH.` };
  }
  if (finished.code === 0) return { ok: true };
  const exit =
    finished.code === null ? "didn't finish" : `exited ${finished.code}`;
  return { ok: false, error: `It ${exit}.\n${finished.stderr}` };
}

/**
 * Fetches the plugin's folder at the approved commit into the snapshot's
 * staging folder, with the user's own git and credentials, the way
 * consolidation does: blobless, sparse to the plugin's path, and the commit
 * alone at depth 1, falling back to every branch and tag (still blobless) when
 * the host won't serve a commit by SHA. Never prompts, and never fetches
 * submodules or LFS content, since neither is in what contentHash covers.
 * Only the plugin's folder is copied into the snapshot, without `.git`.
 */
async function fetchSnapshot(snapshot: Snapshot): Promise<ActionResult> {
  const clone = `${snapshot.staging}-clone`;
  const env = {
    ...process.env,
    GIT_TERMINAL_PROMPT: "0",
    GIT_LFS_SKIP_SMUDGE: "1",
  };
  const git = (...args: string[]) =>
    execCommand(
      [
        "git",
        "-c",
        "submodule.recurse=false",
        "-c",
        "advice.detachedHead=false",
        "-c",
        "core.hooksPath=/dev/null",
        "-C",
        clone,
        ...args,
      ],
      env,
    );
  await mkdir(dirname(snapshot.staging), { recursive: true });
  try {
    await mkdir(clone, { recursive: true });
    for (const args of [
      ["init", "--quiet"],
      ["remote", "add", "origin", snapshot.url],
      ...(snapshot.path ? [["sparse-checkout", "set", snapshot.path]] : []),
    ]) {
      const outcome = await git(...args);
      if (!outcome.ok) return outcome;
    }
    const bySha = await git(
      "fetch",
      "--quiet",
      "--depth",
      "1",
      "--filter=blob:none",
      "--no-tags",
      "origin",
      snapshot.commit,
    );
    if (!bySha.ok) {
      const all = await git(
        "fetch",
        "--quiet",
        "--filter=blob:none",
        "--tags",
        "origin",
      );
      if (!all.ok) return all;
    }
    const checkout = await git("checkout", "--quiet", snapshot.commit);
    if (!checkout.ok) return checkout;

    const from = snapshot.path ? join(clone, snapshot.path) : clone;
    if (!(await isDirectory(from))) {
      return {
        ok: false,
        error: `${snapshot.path} isn't a folder at ${snapshot.commit}.`,
      };
    }
    await cp(from, snapshot.staging, {
      recursive: true,
      verbatimSymlinks: true,
      filter: (source) => source !== join(clone, ".git"),
    });
    return { ok: true };
  } finally {
    await rm(clone, { recursive: true, force: true });
  }
}
