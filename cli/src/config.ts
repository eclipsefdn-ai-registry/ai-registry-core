import { readFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import {
  GUARDRAIL_OFF,
  organizationIds,
  parseRequireApprovalFrom,
  type Guardrail,
  type RequireApprovalFrom,
} from "./guardrail.js";

export const GUARDRAIL_ENV = "AI_REGISTRY_REQUIRE_APPROVAL_FROM";
export const PROJECT_CONFIG = ".ai-registry.json";

interface GuardrailSources {
  flag: string | undefined;
  env: Record<string, string | undefined>;
  cwd: string;
  homeDir: string;
}

/**
 * The guardrail in force, from the first of: the --require-approval-from
 * flag, the AI_REGISTRY_REQUIRE_APPROVAL_FROM variable, .ai-registry.json in
 * the working directory, the user's ai-registry/config.json, and off. Throws
 * an error naming the setting it couldn't read: a guardrail someone meant to
 * set must never quietly read as off.
 */
export async function resolveGuardrail({
  flag,
  env,
  cwd,
  homeDir,
}: GuardrailSources): Promise<Guardrail> {
  for (const [value, setBy] of [
    [flag, "--require-approval-from"],
    // an exported but empty variable reads as unset, as it does in most tools
    [env[GUARDRAIL_ENV] || undefined, GUARDRAIL_ENV],
  ] as const) {
    if (value === undefined) continue;
    const requireApprovalFrom = parseRequireApprovalFrom(value);
    if (!requireApprovalFrom) {
      throw new Error(
        `${setBy} takes off or organization ids separated by commas.`,
      );
    }
    return { requireApprovalFrom, setBy };
  }
  // The XDG spec says to ignore a relative XDG_CONFIG_HOME.
  const xdg = env.XDG_CONFIG_HOME;
  const userConfigDir = xdg && isAbsolute(xdg) ? xdg : join(homeDir, ".config");
  for (const path of [
    join(cwd, PROJECT_CONFIG),
    join(userConfigDir, "ai-registry", "config.json"),
  ]) {
    const requireApprovalFrom = await readConfigFile(path);
    if (requireApprovalFrom) return { requireApprovalFrom, setBy: path };
  }
  return GUARDRAIL_OFF;
}

// Undefined when the file doesn't exist or doesn't set requireApprovalFrom.
async function readConfigFile(
  path: string,
): Promise<RequireApprovalFrom | undefined> {
  let config: unknown;
  try {
    config = JSON.parse(await readFile(path, "utf-8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw new Error(
      `Could not read ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (typeof config !== "object" || config === null || Array.isArray(config)) {
    throw new Error(`${path} must hold a JSON object.`);
  }
  if (!("requireApprovalFrom" in config)) return undefined;
  const value = config.requireApprovalFrom;
  if (value === "off") return value;
  const ids =
    Array.isArray(value) &&
    value.every((id) => typeof id === "string") &&
    organizationIds(value);
  if (ids) return ids;
  throw new Error(
    `requireApprovalFrom in ${path} takes "off" or a list of organization ids.`,
  );
}
