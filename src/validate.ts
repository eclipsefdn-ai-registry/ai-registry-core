import Ajv from "ajv";
import addFormats from "ajv-formats";
import { readFileSync, readdirSync, existsSync } from "node:fs";
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

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

interface ApprovalData {
  serverId: string;
  date: string;
  versionRange?: string;
  installConfigs: { tool?: string }[];
}

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

export function checkToolIds(
  approval: ApprovalData,
  toolIds: Set<string>,
): string[] {
  const warnings: string[] = [];
  for (const ic of approval.installConfigs) {
    if (ic.tool && !toolIds.has(ic.tool)) {
      warnings.push(`tool "${ic.tool}" not found in organization.json`);
    }
  }
  return warnings;
}

export function validateApproval(data: unknown): ValidationResult {
  const valid = validateAppr(data);
  return {
    valid: !!valid,
    errors: valid ? [] : formatErrors(validateAppr),
  };
}

/**
 * Validate a vendor repository directory.
 * Used by the CLI (`validate-vendor` bin) and can be called programmatically.
 */
export async function validateVendorRepo(repoDir: string): Promise<boolean> {
  console.log("=== AI Registry — Vendor Validation ===\n");

  let hasErrors = false;
  let hasWarnings = false;

  // Validate organization.json
  const orgPath = resolve(repoDir, "organization.json");
  if (!existsSync(orgPath)) {
    console.error("FAIL: organization.json not found");
    return false;
  }

  console.log("Validating organization.json...");
  const orgData: unknown = JSON.parse(readFileSync(orgPath, "utf-8"));
  const orgResult = validateOrganization(orgData);
  let toolIds: Set<string> = new Set();
  if (!orgResult.valid) {
    console.error("  FAIL: organization.json");
    orgResult.errors.forEach((e) => console.error(`    - ${e}`));
    hasErrors = true;
  } else {
    console.log("  PASS: organization.json");
    const org = orgData as { tools: { id: string }[] };
    toolIds = new Set(org.tools.map((t) => t.id));
  }

  // Validate approval files
  const mcpDir = resolve(repoDir, "mcp");
  if (!existsSync(mcpDir)) {
    console.log("\nNo mcp/ directory found, skipping approval validation");
  } else {
    const approvalFiles = readdirSync(mcpDir).filter((f) =>
      f.endsWith(".json"),
    );

    // Phase 1: Schema validation
    console.log(`\nValidating ${approvalFiles.length} approval file(s)...\n`);
    console.log("Phase 1: Schema validation");
    const validFiles: { file: string; data: ApprovalData }[] = [];

    for (const file of approvalFiles) {
      const filePath = join(mcpDir, file);
      const data: unknown = JSON.parse(readFileSync(filePath, "utf-8"));

      const result = validateApproval(data);
      if (!result.valid) {
        console.error(`  FAIL: mcp/${file}`);
        result.errors.forEach((e) => console.error(`    - ${e}`));
        hasErrors = true;
        continue;
      }

      const approval = data as ApprovalData;

      // Check filename convention: serverId with / replaced by --
      const expectedFilename = approval.serverId.replace(/\//g, "--") + ".json";
      if (file !== expectedFilename) {
        console.warn(
          `  WARNING: mcp/${file} — filename should be "${expectedFilename}" (based on serverId "${approval.serverId}")`,
        );
        hasWarnings = true;
      }

      // Check tool IDs reference valid tools from organization.json
      if (toolIds.size > 0) {
        const toolErrors = checkToolIds(approval, toolIds);
        for (const e of toolErrors) {
          console.error(`  FAIL: mcp/${file} — ${e}`);
          hasErrors = true;
        }
      }

      console.log(`  PASS: mcp/${file}`);
      validFiles.push({ file, data: approval });
    }

    // Phase 2: Anthropic MCP registry verification
    console.log("\nPhase 2: Anthropic MCP registry verification");
    for (const { file, data } of validFiles) {
      try {
        const result = await lookupServer(data.serverId);
        if (!result) {
          console.warn(
            `  WARNING: mcp/${file} — serverId "${data.serverId}" not found in Anthropic MCP registry (may be newly submitted)`,
          );
          hasWarnings = true;
        } else {
          console.log(`  PASS: mcp/${file}`);
          console.log(`    Name: ${result.name}`);
          console.log(`    Description: ${result.description}`);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(
          `  WARNING: mcp/${file} — could not reach Anthropic MCP registry: ${message}`,
        );
        hasWarnings = true;
      }
    }
  }

  // Summary
  console.log("\n--- Summary ---");
  if (hasErrors) {
    console.error("FAILED: Schema validation errors found");
    return false;
  }
  if (hasWarnings) {
    console.warn("PASSED with warnings");
  } else {
    console.log("PASSED: All files valid");
  }
  return true;
}
