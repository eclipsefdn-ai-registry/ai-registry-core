import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { execSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Shared by consolidate.test.ts and marketplace-source.test.ts — both create
// a real local git repo with a Codex-format marketplace.json to exercise the
// actual clone/sparse-checkout/parse pipeline, not a mock.
export function makeMarketplaceRepo(plugins: unknown[]): {
  dir: string;
  sourceUrl: string;
  cleanup: () => void;
} {
  const dir = mkdtempSync(join(tmpdir(), "marketplace-fixture-"));
  execSync("git init -b main", { cwd: dir, stdio: "pipe" });
  execSync('git config user.email "test@test.com"', {
    cwd: dir,
    stdio: "pipe",
  });
  execSync('git config user.name "Test"', { cwd: dir, stdio: "pipe" });
  mkdirSync(join(dir, ".agents", "plugins"), { recursive: true });
  writeFileSync(
    join(dir, ".agents", "plugins", "marketplace.json"),
    JSON.stringify({ name: "test-plugins", plugins }),
  );
  execSync("git add -A && git commit -m init", { cwd: dir, stdio: "pipe" });
  return {
    dir,
    sourceUrl: `file://${dir}`,
    cleanup: () => rmSync(dir, { recursive: true, force: true }),
  };
}
