import Ajv from "ajv";
import addFormats from "ajv-formats";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { lookupServer } from "./anthropic-registry.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const ajv = new Ajv.default({ allErrors: true });
addFormats.default(ajv);

function loadSchema(name: string): object {
  const schemaPath = resolve(__dirname, `../schemas/${name}`);
  return JSON.parse(readFileSync(schemaPath, "utf-8")) as object;
}

const validateOrg = ajv.compile(loadSchema("organization.schema.json"));
const validateAppr = ajv.compile(loadSchema("mcp-approval.schema.json"));

// --- Types ---

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface ApprovalData {
  serverId: string;
  date: string;
  versionRange?: string;
  installConfigs: { tool: string }[];
}

export interface ApprovalEntry {
  file: string;
  data: ApprovalData;
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

export function checkToolIds(
  approval: ApprovalData,
  toolIds: Set<string>,
): string[] {
  const errors: string[] = [];
  for (const ic of approval.installConfigs) {
    if (ic.tool && !toolIds.has(ic.tool)) {
      errors.push(`tool "${ic.tool}" not found in organization.json`);
    }
  }
  return errors;
}

// --- Core validation (pure, testable) ---

/**
 * Validate vendor data. Pure function — no I/O.
 * Takes parsed org data and approval entries, returns validation result.
 */
export function validateVendorData(
  orgData: unknown,
  approvals: ApprovalEntry[],
  expectedVendorId?: string,
): VendorValidationResult {
  const result: VendorValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
    approvals: [],
  };

  const orgResult = validateOrganization(orgData);
  if (!orgResult.valid) {
    result.valid = false;
    result.errors.push(`organization.json: ${orgResult.errors.join(", ")}`);
    return result;
  }

  const org = orgData as { id: string; tools: { id: string }[] };
  if (expectedVendorId && org.id !== expectedVendorId) {
    result.valid = false;
    result.errors.push(
      `organization.json id "${org.id}" does not match vendor id "${expectedVendorId}" from vendors.json`,
    );
    return result;
  }

  result.organization = { id: org.id, tools: org.tools, raw: orgData };
  const toolIds = new Set(org.tools.map((t) => t.id));

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
    return {
      valid: false,
      errors: ["organization.json not found"],
      warnings: [],
      approvals: [],
    };
  }

  let orgRaw: unknown;
  try {
    orgRaw = JSON.parse(readFileSync(orgPath, "utf-8"));
  } catch (err) {
    const detail = err instanceof Error ? err.message : "";
    return {
      valid: false,
      errors: [
        `organization.json is not valid JSON${detail ? `: ${detail}` : ""}`,
      ],
      warnings: [],
      approvals: [],
    };
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
        return {
          valid: false,
          errors: [
            `mcp/${file} is not valid JSON${detail ? `: ${detail}` : ""}`,
          ],
          warnings: [],
          approvals: [],
        };
      }
      approvals.push({ file, data: data as ApprovalData });
    }
  }

  return validateVendorData(orgRaw, approvals, expectedVendorId);
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

  console.log("\n--- Summary ---");
  if (!result.valid) {
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
