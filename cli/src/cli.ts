#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline/promises";
import { run, type Installer } from "./run.js";

// skills and plugins ship a bin and no programmatic API, so each runs as a
// child process. Resolved from this package's own pinned dependencies rather
// than through npx, so the installer that runs is the version this CLI was
// checked against.
const require = createRequire(import.meta.url);
const INSTALLER_BINS: Record<Installer, string> = {
  skills: join(
    dirname(require.resolve("skills/package.json")),
    "bin",
    "cli.mjs",
  ),
  plugins: join(
    dirname(require.resolve("plugins/package.json")),
    "dist",
    "index.js",
  ),
};

process.exitCode = await run(process.argv.slice(2), {
  env: process.env,
  cwd: process.cwd(),
  homeDir: homedir(),
  isTTY: Boolean(process.stdin.isTTY && process.stderr.isTTY),
  printErr: (line) => console.error(line),
  confirm: async (question) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stderr,
    });
    try {
      const answer = await rl.question(`${question} [y/N] `);
      return /^y(es)?$/i.test(answer.trim());
    } finally {
      rl.close();
    }
  },
  runInstaller: (installer, args) =>
    new Promise((resolve) => {
      const child = spawn(
        process.execPath,
        [INSTALLER_BINS[installer], ...args],
        {
          stdio: "inherit",
        },
      );
      child.on("error", (error) => {
        console.error(`Could not run the ${installer} CLI: ${error.message}`);
        resolve(1);
      });
      child.on("exit", (code) => resolve(code ?? 1));
    }),
});
