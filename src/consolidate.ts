import {
  readFileSync,
  writeFileSync,
  readdirSync,
  existsSync,
  mkdirSync,
  rmSync,
} from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { validateOrganization, validateApproval } from "./validate.js";
import { lookupServer, type ServerLookupResult } from "./anthropic-registry.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// --- Types ---

interface VendorEntry {
  id: string;
  repo: string;
}

interface OrganizationData {
  id: string;
  name: string;
  description: string;
  website: string;
  color?: string;
  tools: { id: string; name: string }[];
}

export interface Organization {
  id: string;
  name: string;
  description: string;
  website: string;
  color?: string;
}

export interface Tool {
  id: string;
  name: string;
  organizationId: string;
}

export interface InstallConfig {
  tool?: string;
  installUrl?: string;
  openVsxUrl?: string;
  config?: Record<string, unknown>;
  instructions?: string;
}

export interface ApprovalData {
  serverId: string;
  date: string;
  versionRange?: string;
  installConfigs: InstallConfig[];
}

export interface Approval {
  organizationId: string;
  date: string;
  versionRange?: string;
  installConfigs: InstallConfig[];
}

export interface McpEntry {
  serverId: string;
  name: string;
  description: string;
  mcpRegistryVerified: boolean;
  approvals: Approval[];
}

export interface ConsolidatedOutput {
  organizations: Organization[];
  tools: Tool[];
  mcp: McpEntry[];
}

// --- Pure logic (testable) ---

export function addOrganization(
  orgData: OrganizationData,
  output: ConsolidatedOutput,
): void {
  const { tools: orgTools, ...orgMeta } = orgData;
  output.organizations.push(orgMeta);

  for (const tool of orgTools) {
    output.tools.push({
      id: tool.id,
      name: tool.name,
      organizationId: orgData.id,
    });
  }
}

export function addApproval(
  approvalData: ApprovalData,
  organizationId: string,
  registryResult: ServerLookupResult | undefined,
  output: ConsolidatedOutput,
): void {
  let mcpEntry = output.mcp.find((m) => m.serverId === approvalData.serverId);
  if (!mcpEntry) {
    mcpEntry = {
      serverId: approvalData.serverId,
      name: registryResult?.name ?? approvalData.serverId,
      description: registryResult?.description ?? "",
      mcpRegistryVerified: registryResult?.verified ?? false,
      approvals: [],
    };
    output.mcp.push(mcpEntry);
  }

  const approval: Approval = {
    organizationId,
    date: approvalData.date,
    installConfigs: approvalData.installConfigs,
  };
  if (approvalData.versionRange) {
    approval.versionRange = approvalData.versionRange;
  }
  mcpEntry.approvals.push(approval);
}

export function buildToolView(toolId: string, servers: McpEntry[]): McpEntry[] {
  // Only include servers that have at least one approval for this tool
  return servers
    .filter((server) =>
      server.approvals.some((a) =>
        a.installConfigs.some((ic) => ic.tool === toolId),
      ),
    )
    .map((server) => ({
      ...server,
      approvals: server.approvals.map((a) => {
        const isForTool = a.installConfigs.some((ic) => ic.tool === toolId);
        return isForTool ? a : { ...a, installConfigs: [] };
      }),
    }));
}

// --- I/O ---

function loadVendors(): VendorEntry[] {
  return JSON.parse(
    readFileSync(resolve(ROOT, "vendors.json"), "utf-8"),
  ) as VendorEntry[];
}

function cloneOrUseLocal(vendor: VendorEntry, tmpDir: string): string {
  const localBase = process.env.LOCAL_VENDORS_DIR;
  if (localBase) {
    const localPath = resolve(localBase, `ai-registry-${vendor.id}`);
    if (existsSync(localPath)) {
      console.log(`  Using local path: ${localPath}`);
      return localPath;
    }
  }

  const dest = join(tmpDir, vendor.id);
  const token = process.env.GH_TOKEN;
  const repoUrl = token
    ? vendor.repo.replace("https://", `https://x-access-token:${token}@`)
    : vendor.repo;
  console.log(`  Cloning ${vendor.repo}...`);
  try {
    execSync(`git clone --depth 1 ${repoUrl} ${dest}`, { stdio: "pipe" });
  } catch (err) {
    const stderr =
      err instanceof Error && "stderr" in err
        ? String((err as { stderr: Buffer }).stderr)
        : "";
    throw new Error(
      `Failed to clone ${vendor.repo}: ${stderr.trim() || "unknown error"}`,
    );
  }
  return dest;
}

async function processVendorRepo(
  vendorId: string,
  vendorPath: string,
  output: ConsolidatedOutput,
): Promise<void> {
  const orgPath = join(vendorPath, "organization.json");
  if (!existsSync(orgPath)) {
    console.warn(`  WARNING [${vendorId}]: organization.json not found`);
    return;
  }

  let orgRaw: unknown;
  try {
    orgRaw = JSON.parse(readFileSync(orgPath, "utf-8"));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.warn(
      `  WARNING [${vendorId}]: Failed to parse organization.json: ${message}`,
    );
    return;
  }
  const orgResult = validateOrganization(orgRaw);
  if (!orgResult.valid) {
    console.warn(
      `  WARNING [${vendorId}]: organization.json validation failed:`,
    );
    orgResult.errors.forEach((e) => console.warn(`    - ${e}`));
    return;
  }

  const orgData = orgRaw as OrganizationData;
  addOrganization(orgData, output);

  const mcpDir = join(vendorPath, "mcp");
  if (!existsSync(mcpDir)) {
    console.log(`  No mcp/ directory found, skipping approvals`);
    return;
  }

  const approvalFiles = readdirSync(mcpDir).filter((f) => f.endsWith(".json"));
  for (const file of approvalFiles) {
    let approvalRaw: unknown;
    try {
      approvalRaw = JSON.parse(readFileSync(join(mcpDir, file), "utf-8"));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(
        `  WARNING [${vendorId}]: Failed to parse mcp/${file}: ${message}`,
      );
      continue;
    }

    const approvalResult = validateApproval(approvalRaw);
    if (!approvalResult.valid) {
      console.warn(`  WARNING [${vendorId}]: ${file} validation failed:`);
      approvalResult.errors.forEach((e) => console.warn(`    - ${e}`));
      continue;
    }

    const approvalData = approvalRaw as ApprovalData;
    const lookup = await lookupServer(approvalData.serverId);

    if (lookup) {
      console.log(`  Resolved from Anthropic registry:`);
      console.log(`    Name: ${lookup.name}`);
      console.log(`    Description: ${lookup.description}`);
    } else {
      console.warn(
        `  WARNING: ${approvalData.serverId} not found in Anthropic MCP registry`,
      );
    }

    addApproval(approvalData, orgData.id, lookup, output);
    console.log(
      `  Processed: ${approvalData.serverId} (verified: ${lookup !== undefined})`,
    );
  }
}

function writeJson(filePath: string, data: unknown): void {
  writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n");
}

function writeOutput(output: ConsolidatedOutput): void {
  const outputDir = resolve(ROOT, "dist/api/v1");
  mkdirSync(outputDir, { recursive: true });

  // Write all.json — full registry
  const allPath = resolve(outputDir, "all.json");
  writeJson(allPath, output);
  console.log(`Written: ${allPath}`);

  // Write organizations.json — orgs and their tools
  const orgsPath = resolve(outputDir, "organizations.json");
  writeJson(orgsPath, {
    organizations: output.organizations,
    tools: output.tools,
  });
  console.log(`Written: ${orgsPath}`);

  // Write per-tool files — just the mcp array filtered for that tool
  for (const tool of output.tools) {
    const toolPath = resolve(outputDir, `${tool.id}.json`);
    writeJson(toolPath, { mcp: buildToolView(tool.id, output.mcp) });
    console.log(`Written: ${toolPath}`);
  }

  console.log(`\n  Organizations: ${output.organizations.length}`);
  console.log(`  Tools: ${output.tools.length}`);
  console.log(`  MCP servers: ${output.mcp.length}`);
}

// --- Main ---

export async function main(): Promise<void> {
  console.log("=== AI Registry Consolidation ===\n");

  const vendors = loadVendors();
  const output: ConsolidatedOutput = {
    organizations: [],
    tools: [],
    mcp: [],
  };

  const tmpDir = resolve(ROOT, ".tmp-vendors");
  if (existsSync(tmpDir)) {
    rmSync(tmpDir, { recursive: true });
  }
  mkdirSync(tmpDir, { recursive: true });

  try {
    for (const vendor of vendors) {
      console.log(`Processing vendor: ${vendor.id}`);
      try {
        const vendorPath = cloneOrUseLocal(vendor, tmpDir);
        await processVendorRepo(vendor.id, vendorPath, output);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.warn(`  WARNING [${vendor.id}]: ${message}`);
      }
      console.log();
    }
  } finally {
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true });
    }
  }

  output.mcp.sort((a, b) => a.serverId.localeCompare(b.serverId));
  writeOutput(output);
}
