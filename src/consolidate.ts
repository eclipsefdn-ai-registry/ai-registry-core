import {
  readFileSync,
  writeFileSync,
  existsSync,
  mkdirSync,
  rmSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { validateVendorFiles } from "./validate.js";
import { lookupServer, type ServerLookupResult } from "./anthropic-registry.js";
import { enrichSkillMetadata } from "./skill-source.js";

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
  inferred?: boolean;
  tools?: {
    id: string;
    name: string;
    skillInstallUrlPrefix?: string;
    mcpInstallUrlPrefix?: string;
  }[];
}

export interface Organization {
  id: string;
  name: string;
  description: string;
  website: string;
  color?: string;
  inferred?: boolean;
}

export interface Tool {
  id: string;
  name: string;
  organizationId: string;
  skillInstallUrlPrefix?: string;
  mcpInstallUrlPrefix?: string;
}

export interface InstallConfig {
  tool: string;
  installUrl?: string;
  openVsxUrl?: string;
  config?: Record<string, unknown>;
  instructions?: string;
}

export interface ApprovalData {
  serverId: string;
  date: string;
  version?: string;
  installConfigs?: InstallConfig[];
}

export interface Approval {
  organizationId: string;
  date: string;
  version?: string;
  configHash: string;
  installConfigs: InstallConfig[];
  // installConfigs is always present in output (defaults to [])
}

export interface McpEntry {
  serverId: string;
  name: string;
  description: string;
  latestVersion?: string;
  mcpRegistryVerified: boolean;
  approvals: Approval[];
}

export interface SkillInstallConfig {
  tool: string;
  installUrl?: string;
}

export interface SkillApprovalData {
  skillId: string;
  date: string;
  source: { url: string; path?: string | string[] };
  installConfigs?: SkillInstallConfig[];
}

export interface SkillApproval {
  organizationId: string;
  date: string;
  configHash: string;
  installConfigs: SkillInstallConfig[];
  // installConfigs is always present in output (defaults to [])
}

export interface SkillEntry {
  skillId: string;
  name: string;
  description: string;
  source: { url: string; path?: string | string[] };
  contentHash: string;
  approvals: SkillApproval[];
}

export interface ConsolidatedOutput {
  organizations: Organization[];
  tools: Tool[];
  mcp: McpEntry[];
  skills: SkillEntry[];
}

// --- Pure logic (testable) ---

export function addOrganization(
  orgData: OrganizationData,
  output: ConsolidatedOutput,
): void {
  const { tools: orgTools = [], ...orgMeta } = orgData;
  output.organizations.push(orgMeta);

  for (const tool of orgTools) {
    output.tools.push({
      id: tool.id,
      name: tool.name,
      organizationId: orgData.id,
      skillInstallUrlPrefix: tool.skillInstallUrlPrefix,
      mcpInstallUrlPrefix: tool.mcpInstallUrlPrefix,
    });
  }
}

export function addApproval(
  approvalData: ApprovalData,
  organizationId: string,
  output: ConsolidatedOutput,
): void {
  let mcpEntry = output.mcp.find((m) => m.serverId === approvalData.serverId);
  if (!mcpEntry) {
    mcpEntry = {
      serverId: approvalData.serverId,
      name: approvalData.serverId,
      description: "",
      mcpRegistryVerified: false,
      approvals: [],
    };
    output.mcp.push(mcpEntry);
  }

  const configHash = createHash("sha256")
    .update(JSON.stringify(approvalData))
    .digest("hex")
    .slice(0, 12);

  const resolvedMcpConfigs = (approvalData.installConfigs ?? []).map((cfg) => {
    if (cfg.installUrl) return cfg;
    const tool = output.tools.find((t) => t.id === cfg.tool);
    if (tool?.mcpInstallUrlPrefix) {
      return {
        ...cfg,
        installUrl: tool.mcpInstallUrlPrefix + approvalData.serverId,
      };
    }
    return cfg;
  });

  const approval: Approval = {
    organizationId,
    date: approvalData.date,
    configHash,
    installConfigs: resolvedMcpConfigs,
  };
  if (approvalData.version) {
    approval.version = approvalData.version;
  }
  mcpEntry.approvals.push(approval);
}

export function enrichWithRegistryData(
  entry: McpEntry,
  result: ServerLookupResult,
): void {
  entry.name = result.name;
  entry.description = result.description;
  entry.latestVersion = result.latestVersion;
  entry.mcpRegistryVerified = result.verified;

  // Approvals without a pinned version default to the latest from the registry
  for (const approval of entry.approvals) {
    if (!approval.version) {
      approval.version = result.latestVersion;
    }
  }
}

export function buildToolView(toolId: string, servers: McpEntry[]): McpEntry[] {
  return servers
    .filter((server) =>
      server.approvals.some((a) =>
        a.installConfigs.some((ic) => ic.tool === toolId),
      ),
    )
    .map((server) => ({
      ...server,
      approvals: server.approvals.map((a) => ({
        ...a,
        installConfigs: a.installConfigs.filter((ic) => ic.tool === toolId),
      })),
    }));
}

export function addSkillApproval(
  approvalData: SkillApprovalData,
  organizationId: string,
  output: ConsolidatedOutput,
): void {
  let skillEntry = output.skills.find(
    (s) => s.skillId === approvalData.skillId,
  );
  if (!skillEntry) {
    skillEntry = {
      skillId: approvalData.skillId,
      name: approvalData.skillId,
      description: "",
      source: approvalData.source,
      contentHash: "",
      approvals: [],
    };
    output.skills.push(skillEntry);
  }

  const configHash = createHash("sha256")
    .update(JSON.stringify(approvalData))
    .digest("hex")
    .slice(0, 12);

  const resolvedSkillConfigs = (approvalData.installConfigs ?? []).map(
    (cfg) => {
      if (cfg.installUrl) return cfg;
      const tool = output.tools.find((t) => t.id === cfg.tool);
      if (tool?.skillInstallUrlPrefix) {
        return {
          ...cfg,
          installUrl: tool.skillInstallUrlPrefix + approvalData.skillId,
        };
      }
      return cfg;
    },
  );

  const approval: SkillApproval = {
    organizationId,
    date: approvalData.date,
    configHash,
    installConfigs: resolvedSkillConfigs,
  };
  skillEntry.approvals.push(approval);
}

export function buildToolSkillView(
  toolId: string,
  skills: SkillEntry[],
): SkillEntry[] {
  return skills
    .filter((skill) =>
      skill.approvals.some((a) =>
        a.installConfigs.some((ic) => ic.tool === toolId),
      ),
    )
    .map((skill) => ({
      ...skill,
      approvals: skill.approvals.map((a) => ({
        ...a,
        installConfigs: a.installConfigs.filter((ic) => ic.tool === toolId),
      })),
    }));
}

// --- Step 1: Collect vendor data (I/O + validation, no network) ---

function loadAndValidateVendors(): VendorEntry[] {
  const vendors = JSON.parse(
    readFileSync(resolve(ROOT, "vendors.json"), "utf-8"),
  ) as VendorEntry[];

  const seenIds = new Set<string>();
  const seenRepos = new Set<string>();
  for (const v of vendors) {
    if (seenIds.has(v.id)) {
      throw new Error(`Duplicate vendor ID in vendors.json: "${v.id}"`);
    }
    if (seenRepos.has(v.repo)) {
      throw new Error(`Duplicate repo URL in vendors.json: "${v.repo}"`);
    }
    seenIds.add(v.id);
    seenRepos.add(v.repo);
  }

  return vendors;
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
  } catch {
    throw new Error(`Failed to clone ${vendor.repo}`);
  }
  return dest;
}

function collectVendorData(
  vendorId: string,
  vendorPath: string,
  output: ConsolidatedOutput,
): void {
  const result = validateVendorFiles(vendorPath, vendorId);

  if (!result.valid) {
    throw new Error(
      `[${vendorId}] Validation failed:\n${result.errors.map((e) => `    - ${e}`).join("\n")}`,
    );
  }

  for (const w of result.warnings) {
    console.warn(`  WARNING [${vendorId}]: ${w}`);
  }

  addOrganization(result.organization!.raw as OrganizationData, output);

  for (const { data } of result.approvals) {
    addApproval(data, vendorId, output);
    console.log(`  Collected MCP: ${data.serverId}`);
  }

  for (const { data } of result.skillApprovals) {
    addSkillApproval(data as SkillApprovalData, vendorId, output);
    console.log(`  Collected skill: ${data.skillId}`);
  }
}

// --- Step 2: Enrich with Anthropic registry metadata (network, can fail systemically) ---

async function enrichRegistryMetadata(
  output: ConsolidatedOutput,
): Promise<void> {
  console.log("Enriching with Anthropic MCP registry metadata...\n");

  const results = await Promise.all(
    output.mcp.map((entry) => lookupServer(entry.serverId)),
  );

  for (let i = 0; i < output.mcp.length; i++) {
    const entry = output.mcp[i];
    const result = results[i];
    if (result) {
      enrichWithRegistryData(entry, result);
      console.log(`  Verified: ${entry.serverId}`);
      console.log(`    Name: ${result.name}`);
      console.log(`    Description: ${result.description}`);
    } else {
      console.log(
        `  Not found: ${entry.serverId} (mcpRegistryVerified: false)`,
      );
    }
  }
}

// --- Step 3: Write output files ---

function writeJson(filePath: string, data: unknown): void {
  writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n");
}

function writeOutput(output: ConsolidatedOutput): void {
  const outputDir = resolve(ROOT, "dist/api/v1");
  mkdirSync(outputDir, { recursive: true });

  const allPath = resolve(outputDir, "all.json");
  writeJson(allPath, output);
  console.log(`Written: ${allPath}`);

  const orgsPath = resolve(outputDir, "organizations.json");
  writeJson(orgsPath, {
    organizations: output.organizations,
    tools: output.tools,
  });
  console.log(`Written: ${orgsPath}`);

  const toolsDir = resolve(outputDir, "tools");
  mkdirSync(toolsDir, { recursive: true });

  for (const tool of output.tools) {
    const toolPath = resolve(toolsDir, `${tool.id}.json`);
    writeJson(toolPath, {
      mcp: buildToolView(tool.id, output.mcp),
      skills: buildToolSkillView(tool.id, output.skills),
    });
    console.log(`Written: ${toolPath}`);
  }

  console.log(`\n  Organizations: ${output.organizations.length}`);
  console.log(`  Tools: ${output.tools.length}`);
  console.log(`  MCP servers: ${output.mcp.length}`);
  console.log(`  Skills: ${output.skills.length}`);
}

// --- Main ---

export async function main(): Promise<void> {
  console.log("=== AI Registry Consolidation ===\n");

  const vendors = loadAndValidateVendors();
  const output: ConsolidatedOutput = {
    organizations: [],
    tools: [],
    mcp: [],
    skills: [],
  };

  // Step 1: Collect all vendor data (fails build on any error)
  const tmpDir = resolve(ROOT, ".tmp-vendors");
  if (existsSync(tmpDir)) {
    rmSync(tmpDir, { recursive: true });
  }
  mkdirSync(tmpDir, { recursive: true });

  try {
    for (const vendor of vendors) {
      console.log(`Processing vendor: ${vendor.id}`);
      const vendorPath = cloneOrUseLocal(vendor, tmpDir);
      collectVendorData(vendor.id, vendorPath, output);
      console.log();
    }
  } finally {
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true });
    }
  }

  // Verify no duplicate tool IDs across vendors
  const seenToolIds = new Set<string>();
  for (const tool of output.tools) {
    if (seenToolIds.has(tool.id)) {
      throw new Error(`Duplicate tool ID across vendors: "${tool.id}"`);
    }
    seenToolIds.add(tool.id);
  }

  // Step 2a: Enrich MCP with Anthropic registry (fails build on registry errors)
  await enrichRegistryMetadata(output);

  // Step 2b: Enrich skills with source metadata (expands multi-path, skips unreachable sources)
  output.skills = enrichSkillMetadata(output.skills);

  // Check for duplicate skillIds after expansion
  const seenSkillIds = new Set<string>();
  for (const skill of output.skills) {
    if (seenSkillIds.has(skill.skillId)) {
      throw new Error(`Duplicate skillId after expansion: "${skill.skillId}"`);
    }
    seenSkillIds.add(skill.skillId);
  }

  // Step 3: Write output
  output.mcp.sort((a, b) => a.serverId.localeCompare(b.serverId));
  output.skills.sort((a, b) => a.skillId.localeCompare(b.skillId));
  writeOutput(output);
}
