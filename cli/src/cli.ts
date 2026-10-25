#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { createInterface } from "node:readline/promises";
import { run } from "./run.js";

// skills ships a bin and no programmatic API, so it runs as a child process.
// Resolved from this package's own pinned dependency rather than through npx,
// so the installer that runs is the version this CLI was checked against.
const SKILLS_BIN = join(
  dirname(createRequire(import.meta.url).resolve("skills/package.json")),
  "bin",
  "cli.mjs",
);

process.exitCode = await run(process.argv.slice(2), {
  env: process.env,
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
  runSkills: (args) =>
    new Promise((resolve) => {
      const child = spawn(process.execPath, [SKILLS_BIN, ...args], {
        stdio: "inherit",
      });
      child.on("error", (error) => {
        console.error(`Could not run the skills CLI: ${error.message}`);
        resolve(1);
      });
      child.on("exit", (code) => resolve(code ?? 1));
    }),
});
