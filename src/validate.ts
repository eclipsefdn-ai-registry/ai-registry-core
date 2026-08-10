import Ajv from "ajv";
import addFormats from "ajv-formats";
import {
  readFileSync,
  readdirSync,
  existsSync,
  mkdirSync,
  rmSync,
} from "node:fs";
import { execSync } from "node:child_process";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { lookupServer } from "./anthropic-registry.js";
import { isGlobPattern, resolveSkillPaths } from "./skill-source.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const ajv = new Ajv.default({ allErrors: true });
addFormats.default(ajv);

function loadSchema(name: string): object {
  const schemaPath = resolve(__dirname, `../schemas/${name}`);
  return JSON.parse(readFileSync(schemaPath, "utf-8")) as object;
}

const validateOrg = ajv.compile(loadSchema("organization.schema.json"));
// Must compile before mcp-approval.schema.json: that schema $refs this one by
// its $id, and ajv resolves $refs against schemas already registered in the
// instance (compile() registers as a side effect for any schema with an $id).
// Nothing calls the root config schema directly — validateApproval already
// covers it via that $ref — so the compiled validator itself is discarded.
ajv.compile(loadSchema("mcp-server-config.schema.json"));
const validateAppr = ajv.compile(loadSchema("mcp-approval.schema.json"));
const validateSkillAppr = ajv.compile(loadSchema("skill-approval.schema.json"));
const validatePluginAppr = ajv.compile(
  loadSchema("plugin-approval.schema.json"),
);

// --- Types ---

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface ApprovalData {
  serverId: string;
  date: string;
  version?: string;
  installConfigs?: { tool: string }[];
}

export interface ApprovalEntry {
  file: string;
  data: ApprovalData;
}

export interface SkillApprovalData {
  skillId: string;
  date: string;
  source: { url: string; path?: string | string[] };
  installConfigs?: { tool: string; installUrl?: string }[];
}

export interface SkillApprovalEntry {
  file: string;
  data: SkillApprovalData;
}

export interface PluginApprovalData {
  pluginId: string;
  date: string;
  source: { url: string; path?: string };
  installConfigs?: {
    tool: string;
    installUrl?: string;
    config?: Record<string, unknown>;
    instructions?: string;
  }[];
}

export interface PluginApprovalEntry {
  file: string;
  data: PluginApprovalData;
}

export interface VendorValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  organization?: {
    id: string;
    tools: { id: string }[];
    raw: unknown;
  };
  approvals: ApprovalEntry[];
  skillApprovals: SkillApprovalEntry[];
  pluginApprovals: PluginApprovalEntry[];
}

// A VendorValidationResult with no organization and no collected approvals —
// every early-return failure case in validateVendorFiles is exactly this
// shape plus its own `errors` array, so building it in one place means a
// fifth approval type never means a sixth copy of this literal.
export function emptyResult(errors: string[]): VendorValidationResult {
  return {
    valid: false,
    errors,
    warnings: [],
    approvals: [],
    skillApprovals: [],
    pluginApprovals: [],
  };
}

// --- Schema validation ---

function formatErrors(validate: typeof validateOrg): string[] {
  return (validate.errors ?? []).map(
    (e) => `${e.instancePath || "/"}: ${e.message ?? "unknown error"}`,
  );
}

export function validateOrganization(data: unknown): ValidationResult {
  const valid = validateOrg(data);
  return {
    valid: !!valid,
    errors: valid ? [] : formatErrors(validateOrg),
  };
}

export function validateApproval(data: unknown): ValidationResult {
  const valid = validateAppr(data);
  return {
    valid: !!valid,
    errors: valid ? [] : formatErrors(validateAppr),
  };
}

export function validateSkillApproval(data: unknown): ValidationResult {
  const valid = validateSkillAppr(data);
  return {
    valid: !!valid,
    errors: valid ? [] : formatErrors(validateSkillAppr),
  };
}

export function validatePluginApproval(data: unknown): ValidationResult {
  const valid = validatePluginAppr(data);
  return {
    valid: !!valid,
    errors: valid ? [] : formatErrors(validatePluginAppr),
  };
}

export function checkToolIds(
  approval: { installConfigs?: { tool: string }[] },
  toolIds: Set<string>,
): string[] {
  const errors: string[] = [];
  for (const ic of approval.installConfigs ?? []) {
    if (ic.tool && !toolIds.has(ic.tool)) {
      errors.push(`tool "${ic.tool}" not found in organization.json`);
    }
  }
  return errors;
}

// Checked separately from validateVendorData (which has no knowledge of
// other vendors): only the vendor-local CLI entry point calls this, since it
// alone knows to load vendors.json. A vendor trusting an org id that isn't
// registered fails their own validation — the central consolidation build
// only warns and skips it (see resolveSkillTrust's caller in consolidate.ts)
// so one vendor's bad reference doesn't fail the shared build for everyone.
export function checkTrustedOrgIds(
  trusts: { org: string }[] | undefined,
  knownOrgIds: Set<string>,
): string[] {
  const errors: string[] = [];
  for (const trust of trusts ?? []) {
    if (!knownOrgIds.has(trust.org)) {
      errors.push(
        `trusts unknown organization "${trust.org}" (not registered in vendors.json)`,
      );
    }
  }
  return errors;
}

// --- Core validation (pure, testable) ---

export interface ValidateVendorDataOptions {
  expectedVendorId?: string;
  skillApprovals?: SkillApprovalEntry[];
  pluginApprovals?: PluginApprovalEntry[];
}

/**
 * Validate vendor data. Pure function — no I/O.
 * Takes parsed org data and approval entries, returns validation result.
 */
export function validateVendorData(
  orgData: unknown,
  approvals: ApprovalEntry[],
  options: ValidateVendorDataOptions = {},
): VendorValidationResult {
  const {
    expectedVendorId,
    skillApprovals = [],
    pluginApprovals = [],
  } = options;
  const result: VendorValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
    approvals: [],
    skillApprovals: [],
    pluginApprovals: [],
  };

  const orgResult = validateOrganization(orgData);
  if (!orgResult.valid) {
    result.valid = false;
    result.errors.push(`organization.json: ${orgResult.errors.join(", ")}`);
    return result;
  }

  const org = orgData as {
    id: string;
    tools?: { id: string }[];
    trusts?: { org: string }[];
  };
  if (expectedVendorId && org.id !== expectedVendorId) {
    result.valid = false;
    result.errors.push(
      `organization.json id "${org.id}" does not match vendor id "${expectedVendorId}" from vendors.json`,
    );
    return result;
  }

  const orgTools = org.tools ?? [];
  result.organization = { id: org.id, tools: orgTools, raw: orgData };

  const toolIds = new Set<string>();
  for (const tool of orgTools) {
    if (toolIds.has(tool.id)) {
      result.valid = false;
      result.errors.push(`organization.json: duplicate tool ID "${tool.id}"`);
    }
    toolIds.add(tool.id);
  }

  const seenTrustedOrgs = new Set<string>();
  for (const trust of org.trusts ?? []) {
    if (seenTrustedOrgs.has(trust.org)) {
      result.valid = false;
      result.errors.push(
        `organization.json: duplicate trust entry for organization "${trust.org}"`,
      );
    }
    if (trust.org === org.id) {
      result.valid = false;
      result.errors.push(
        `organization.json: cannot trust itself ("${org.id}")`,
      );
    }
    seenTrustedOrgs.add(trust.org);
  }

  const seenServerIds = new Set<string>();
  for (const { file, data } of approvals) {
    const approvalResult = validateApproval(data);
    if (!approvalResult.valid) {
      result.valid = false;
      result.errors.push(`${file}: ${approvalResult.errors.join(", ")}`);
      continue;
    }

    const approval = data as ApprovalData;

    if (seenServerIds.has(approval.serverId)) {
      result.valid = false;
      result.errors.push(
        `${file}: duplicate approval for serverId "${approval.serverId}"`,
      );
      continue;
    }
    seenServerIds.add(approval.serverId);

    const expectedFilename = approval.serverId.replace(/\//g, "--") + ".json";
    if (file !== expectedFilename) {
      result.warnings.push(
        `${file} — filename should be "${expectedFilename}"`,
      );
    }

    const toolErrors = checkToolIds(approval, toolIds);
    for (const e of toolErrors) {
      result.valid = false;
      result.errors.push(`${file}: ${e}`);
    }

    result.approvals.push({ file, data: approval });
  }

  // Skill approvals
  const seenSkillIds = new Set<string>();
  for (const { file, data } of skillApprovals) {
    const skillResult = validateSkillApproval(data);
    if (!skillResult.valid) {
      result.valid = false;
      result.errors.push(`${file}: ${skillResult.errors.join(", ")}`);
      continue;
    }

    const skill = data as SkillApprovalData;

    // Multi-path: skillId must be a prefix (no /)
    const isMultiPath =
      Array.isArray(skill.source.path) ||
      (typeof skill.source.path === "string" &&
        isGlobPattern(skill.source.path));
    if (isMultiPath && skill.skillId.includes("/")) {
      result.valid = false;
      result.errors.push(
        `${file}: skillId "${skill.skillId}" must not contain "/" when using multi-path source (it acts as a prefix)`,
      );
      continue;
    }

    // Multi-path sources expand into multiple skills, so a single explicit
    // installUrl cannot apply to all of them. Auto-generation via the tool's
    // skillInstallUrlPrefix is required instead.
    if (isMultiPath) {
      const explicit = (skill.installConfigs ?? []).find((ic) => ic.installUrl);
      if (explicit) {
        result.valid = false;
        result.errors.push(
          `${file}: installConfig for tool "${explicit.tool}" sets an explicit installUrl, which is not allowed with a multi-path source (it expands to multiple skills; rely on the tool's skillInstallUrlPrefix instead)`,
        );
        continue;
      }
    }

    if (seenSkillIds.has(skill.skillId)) {
      result.valid = false;
      result.errors.push(
        `${file}: duplicate approval for skillId "${skill.skillId}"`,
      );
      continue;
    }
    seenSkillIds.add(skill.skillId);

    const expectedFilename = skill.skillId.replace(/\//g, "--") + ".json";
    if (file !== expectedFilename) {
      result.warnings.push(
        `${file} — filename should be "${expectedFilename}"`,
      );
    }

    const toolErrors = checkToolIds(skill, toolIds);
    for (const e of toolErrors) {
      result.valid = false;
      result.errors.push(`${file}: ${e}`);
    }

    result.skillApprovals.push({ file, data: skill });
  }

  // Plugin approvals
  const seenPluginIds = new Set<string>();
  for (const { file, data } of pluginApprovals) {
    const pluginResult = validatePluginApproval(data);
    if (!pluginResult.valid) {
      result.valid = false;
      result.errors.push(`${file}: ${pluginResult.errors.join(", ")}`);
      continue;
    }

    const plugin = data as PluginApprovalData;

    if (seenPluginIds.has(plugin.pluginId)) {
      result.valid = false;
      result.errors.push(
        `${file}: duplicate approval for pluginId "${plugin.pluginId}"`,
      );
      continue;
    }
    seenPluginIds.add(plugin.pluginId);

    const expectedFilename = plugin.pluginId.replace(/\//g, "--") + ".json";
    if (file !== expectedFilename) {
      result.warnings.push(
        `${file} — filename should be "${expectedFilename}"`,
      );
    }

    const toolErrors = checkToolIds(plugin, toolIds);
    for (const e of toolErrors) {
      result.valid = false;
      result.errors.push(`${file}: ${e}`);
    }

    result.pluginApprovals.push({ file, data: plugin });
  }

  return result;
}

// --- File reading layer ---

/**
 * Read and validate all files in a vendor repo directory.
 * Thin wrapper around validateVendorData that handles I/O.
 */
export function validateVendorFiles(
  repoDir: string,
  expectedVendorId?: string,
): VendorValidationResult {
  const orgPath = resolve(repoDir, "organization.json");
  if (!existsSync(orgPath)) {
    return emptyResult(["organization.json not found"]);
  }

  let orgRaw: unknown;
  try {
    orgRaw = JSON.parse(readFileSync(orgPath, "utf-8"));
  } catch (err) {
    const detail = err instanceof Error ? err.message : "";
    return emptyResult([
      `organization.json is not valid JSON${detail ? `: ${detail}` : ""}`,
    ]);
  }

  const approvals: ApprovalEntry[] = [];
  const mcpDir = resolve(repoDir, "mcp");
  if (existsSync(mcpDir)) {
    for (const file of readdirSync(mcpDir).filter((f) => f.endsWith(".json"))) {
      let data: unknown;
      try {
        data = JSON.parse(readFileSync(join(mcpDir, file), "utf-8"));
      } catch (err) {
        const detail = err instanceof Error ? err.message : "";
        return emptyResult([
          `mcp/${file} is not valid JSON${detail ? `: ${detail}` : ""}`,
        ]);
      }
      approvals.push({ file, data: data as ApprovalData });
    }
  }

  const skillApprovals: SkillApprovalEntry[] = [];
  const skillsDir = resolve(repoDir, "skills");
  if (existsSync(skillsDir)) {
    for (const file of readdirSync(skillsDir).filter((f) =>
      f.endsWith(".json"),
    )) {
      let data: unknown;
      try {
        data = JSON.parse(readFileSync(join(skillsDir, file), "utf-8"));
      } catch (err) {
        const detail = err instanceof Error ? err.message : "";
        return emptyResult([
          `skills/${file} is not valid JSON${detail ? `: ${detail}` : ""}`,
        ]);
      }
      skillApprovals.push({ file, data: data as SkillApprovalData });
    }
  }

  const pluginApprovals: PluginApprovalEntry[] = [];
  const pluginsDir = resolve(repoDir, "plugins");
  if (existsSync(pluginsDir)) {
    for (const file of readdirSync(pluginsDir).filter((f) =>
      f.endsWith(".json"),
    )) {
      let data: unknown;
      try {
        data = JSON.parse(readFileSync(join(pluginsDir, file), "utf-8"));
      } catch (err) {
        const detail = err instanceof Error ? err.message : "";
        return emptyResult([
          `plugins/${file} is not valid JSON${detail ? `: ${detail}` : ""}`,
        ]);
      }
      pluginApprovals.push({ file, data: data as PluginApprovalData });
    }
  }

  return validateVendorData(orgRaw, approvals, {
    expectedVendorId,
    skillApprovals,
    pluginApprovals,
  });
}

// --- Vendor ID lookup ---

interface VendorEntry {
  id: string;
  repo: string;
}

function lookupVendorId(repoDir: string): string | undefined {
  const vendorsPath = resolve(__dirname, "../vendors.json");
  if (!existsSync(vendorsPath)) return undefined;

  let remoteUrl: string;
  try {
    remoteUrl = execSync("git remote get-url origin", {
      cwd: repoDir,
      stdio: "pipe",
    })
      .toString()
      .trim();
  } catch {
    return undefined;
  }

  const vendors = JSON.parse(
    readFileSync(vendorsPath, "utf-8"),
  ) as VendorEntry[];

  const normalize = (url: string) =>
    url
      .replace(/\.git$/, "")
      .replace(/^git@github\.com:/, "https://github.com/");
  const entry = vendors.find((v) => normalize(v.repo) === normalize(remoteUrl));
  return entry?.id;
}

function loadVendorIds(): Set<string> | undefined {
  const vendorsPath = resolve(__dirname, "../vendors.json");
  if (!existsSync(vendorsPath)) return undefined;

  const vendors = JSON.parse(
    readFileSync(vendorsPath, "utf-8"),
  ) as VendorEntry[];
  return new Set(vendors.map((v) => v.id));
}

// --- CLI entry point ---

export async function validateVendorRepo(repoDir: string): Promise<boolean> {
  console.log("=== AI Registry — Vendor Validation ===\n");

  const expectedVendorId = lookupVendorId(repoDir);
  if (expectedVendorId) {
    console.log(`Vendor ID from vendors.json: ${expectedVendorId}\n`);
  }

  console.log("Phase 1: Schema validation");
  const result = validateVendorFiles(repoDir, expectedVendorId);

  for (const e of result.errors) {
    console.error(`  FAIL: ${e}`);
  }
  for (const w of result.warnings) {
    console.warn(`  WARNING: ${w}`);
  }
  for (const { file } of result.approvals) {
    console.log(`  PASS: ${file}`);
  }

  const vendorIds = loadVendorIds();
  let trustValid = true;
  if (vendorIds) {
    const org = result.organization?.raw as
      | { trusts?: { org: string }[] }
      | undefined;
    const trustErrors = checkTrustedOrgIds(org?.trusts, vendorIds);
    for (const e of trustErrors) {
      console.error(`  FAIL: organization.json: ${e}`);
    }
    trustValid = trustErrors.length === 0;
  } else {
    console.warn(
      "  WARNING: could not verify trusted organizations — vendors.json not found",
    );
  }

  if (result.approvals.length > 0) {
    console.log("\nPhase 2: Anthropic MCP registry verification");
    for (const { file, data } of result.approvals) {
      try {
        const lookup = await lookupServer(data.serverId);
        if (!lookup) {
          console.warn(
            `  WARNING: ${file} — serverId "${data.serverId}" not found in Anthropic MCP registry (may be newly submitted)`,
          );
        } else {
          console.log(`  PASS: ${file}`);
          console.log(`    Name: ${lookup.name}`);
          console.log(`    Description: ${lookup.description}`);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(
          `  WARNING: ${file} — could not reach Anthropic MCP registry: ${message}`,
        );
      }
    }
  }

  if (result.skillApprovals.length > 0) {
    console.log("\nPhase 3: Skill source verification");
    const { fetchSkillMetadata } = await import("./skill-source.js");
    const tmpDir = join(repoDir, ".tmp-validate-skills");
    mkdirSync(tmpDir, { recursive: true });

    try {
      for (const { file, data } of result.skillApprovals) {
        const { path } = data.source;

        // Resolve paths, expanding any globs to concrete paths
        let pathsToVerify: (string | undefined)[];
        if (path === undefined) {
          pathsToVerify = [undefined];
        } else {
          const { resolved, warnings } = resolveSkillPaths(
            data.source.url,
            path,
            tmpDir,
          );
          for (const w of warnings) {
            console.warn(`  WARNING: ${file} — ${w}`);
          }
          pathsToVerify = resolved;
        }

        for (const singlePath of pathsToVerify) {
          try {
            const metadata = fetchSkillMetadata(
              data.source.url,
              singlePath,
              tmpDir,
            );
            const label = singlePath ? `${file} (${singlePath})` : file;
            console.log(`  PASS: ${label}`);
            console.log(`    Name: ${metadata.name}`);
            console.log(`    Description: ${metadata.description}`);
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            const label = singlePath ? `${file} (${singlePath})` : file;
            console.warn(
              `  WARNING: ${label} — could not verify skill source: ${message}`,
            );
          }
        }
      }
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  if (result.pluginApprovals.length > 0) {
    console.log("\nPhase 4: Plugin manifest verification");
    const { fetchPluginManifest } = await import("./plugin-source.js");
    const tmpDir = join(repoDir, ".tmp-validate-plugins");
    mkdirSync(tmpDir, { recursive: true });

    try {
      for (const { file, data } of result.pluginApprovals) {
        try {
          const metadata = fetchPluginManifest(
            data.source.url,
            data.source.path,
            tmpDir,
          );
          console.log(`  PASS: ${file}`);
          console.log(`    Name: ${metadata.name}`);
          console.log(`    Description: ${metadata.description}`);
          console.log(
            `    Contains: ${metadata.containedSkills.length} skill(s), ${metadata.containedMcpServers.length} MCP server(s)`,
          );
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.warn(
            `  WARNING: ${file} — could not verify plugin source: ${message}`,
          );
        }
      }
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  console.log("\n--- Summary ---");
  if (!result.valid || !trustValid) {
    console.error("FAILED: Validation errors found");
    return false;
  }
  if (result.warnings.length > 0) {
    console.warn("PASSED with warnings");
  } else {
    console.log("PASSED: All files valid");
  }
  return true;
}
