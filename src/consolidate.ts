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
import {
  enrichPluginMetadata,
  type ContainedSkill,
  type ContainedMcpServer,
} from "./plugin-source.js";
import { enrichAgentMetadata } from "./agent-source.js";
import { mcpConfigTransforms } from "./mcp-config-templates/registry.js";
import type { GenericMcpConfig } from "./mcp-config-templates/types.js";

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
    pluginInstallUrlPrefix?: string;
    agentInstallUrlPrefix?: string;
  }[];
  trusts?: {
    org: string;
    artifactTypes: {
      skills?: Record<string, never>;
      mcp?: Record<string, never>;
    };
  }[];
}

export interface SkillTrustEntry {
  org: string;
  trustedOrg: string;
}

export interface McpTrustEntry {
  org: string;
  trustedOrg: string;
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
  pluginInstallUrlPrefix?: string;
  agentInstallUrlPrefix?: string;
}

export interface InstallConfig {
  tool: string;
  installUrl?: string;
  openVsxUrl?: string;
  // "derived" means: resolve via the tool's registered transform function.
  // Prefers this approval's own root config when present; falls through to
  // another vendor's (newest by date) only when this approval has none at
  // all. If the config that's used — own or fallen-through — can't be
  // represented by the tool's transform (e.g. oauth, or 2+ headers), the
  // card is dropped rather than retried against a different vendor's
  // config: publishing a connection built from another vendor's stated
  // requirements when this approval's own couldn't be honored would show
  // details this approval never claimed. Always resolved to a concrete
  // object, or stripped back to the fields above, before the final output
  // is written — see resolveMcpCrossVendorConfigs.
  config?: Record<string, unknown> | "derived";
  instructions?: string;
}

export interface VendorMcpMetadata {
  name: string;
  description: string;
}

export interface ApprovalData {
  serverId: string;
  date: string;
  version?: string;
  config?: GenericMcpConfig;
  installConfigs?: InstallConfig[];
  metadata?: VendorMcpMetadata;
  selfPublished?: boolean;
}

export interface Approval {
  organizationId: string;
  date: string;
  version?: string;
  configHash: string;
  installConfigs: InstallConfig[];
  // installConfigs is always present in output (defaults to [])
  metadata?: VendorMcpMetadata;
  selfPublished?: boolean;
  genericConfig?: GenericMcpConfig;
  // present only on trust-derived approvals; holds the id of the
  // organization that actually filed the approval
  viaTrust?: string;
}

export interface McpEntry {
  serverId: string;
  name: string;
  description: string;
  latestVersion?: string;
  mcpRegistryVerified: boolean;
  approvals: Approval[];
  publisherClaimedBy?: string;
  // organization id of the single approval claiming to be the publisher
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
  viaTrust?: string;
  // present only on trust-derived approvals; holds the id of the
  // organization that actually filed the approval
}

export interface SkillEntry {
  skillId: string;
  name: string;
  description: string;
  source: { url: string; path?: string | string[] };
  contentHash: string;
  approvals: SkillApproval[];
}

export interface PluginInstallConfig {
  tool: string;
  installUrl?: string;
  config?: Record<string, unknown>;
  instructions?: string;
}

export interface PluginApprovalData {
  pluginId: string;
  date: string;
  source: { url: string; path?: string };
  installConfigs?: PluginInstallConfig[];
}

export interface PluginApproval {
  organizationId: string;
  date: string;
  configHash: string;
  installConfigs: PluginInstallConfig[];
  // installConfigs is always present in output (defaults to [])
}

export interface PluginEntry {
  pluginId: string;
  name: string;
  description: string;
  version?: string;
  author?: string;
  homepage?: string;
  keywords?: string[];
  source: { url: string; path?: string };
  contentHash: string;
  containedSkills: ContainedSkill[];
  containedMcpServers: ContainedMcpServer[];
  approvals: PluginApproval[];
}

export interface AgentInstallConfig {
  tool: string;
  installUrl?: string;
  config?: Record<string, unknown>;
  instructions?: string;
}

export interface AgentApprovalData {
  agentId: string;
  date: string;
  source: { url: string };
  installConfigs?: AgentInstallConfig[];
}

export interface AgentApproval {
  organizationId: string;
  date: string;
  configHash: string;
  installConfigs: AgentInstallConfig[];
}

export interface AgentEntry {
  agentId: string;
  name: string;
  description: string;
  source: { url: string };
  contentHash: string;
  approvals: AgentApproval[];
}

export interface ConsolidatedOutput {
  organizations: Organization[];
  tools: Tool[];
  mcp: McpEntry[];
  skills: SkillEntry[];
  plugins: PluginEntry[];
  agents: AgentEntry[];
}

// --- Pure logic (testable) ---

export function addOrganization(
  orgData: OrganizationData,
  output: ConsolidatedOutput,
  skillTrusts: SkillTrustEntry[] = [],
  mcpTrusts: McpTrustEntry[] = [],
): void {
  const { tools: orgTools = [], trusts = [], ...orgMeta } = orgData;
  output.organizations.push(orgMeta);

  for (const tool of orgTools) {
    output.tools.push({
      id: tool.id,
      name: tool.name,
      organizationId: orgData.id,
      skillInstallUrlPrefix: tool.skillInstallUrlPrefix,
      mcpInstallUrlPrefix: tool.mcpInstallUrlPrefix,
      pluginInstallUrlPrefix: tool.pluginInstallUrlPrefix,
      agentInstallUrlPrefix: tool.agentInstallUrlPrefix,
    });
  }

  for (const trust of trusts) {
    if (trust.artifactTypes.skills) {
      skillTrusts.push({ org: orgData.id, trustedOrg: trust.org });
    }
    if (trust.artifactTypes.mcp) {
      mcpTrusts.push({ org: orgData.id, trustedOrg: trust.org });
    }
  }
}

// Finds the first element of `list` matching `predicate`, or creates one via
// `seed()`, appends it, and returns it — the shared find-or-create shape
// behind addApproval/addSkillApproval/addPluginApproval/addAgentApproval.
// `created` tells the caller whether this is a brand-new entry (some callers
// use that to gate a source-conflict warning that only makes sense once a
// prior approval already exists).
export function findOrCreate<E>(
  list: E[],
  predicate: (e: E) => boolean,
  seed: () => E,
): { entry: E; created: boolean } {
  const existing = list.find(predicate);
  if (existing) return { entry: existing, created: false };
  const entry = seed();
  list.push(entry);
  return { entry, created: true };
}

// Shared sha256-of-JSON config hash used by every approval type to detect
// when a vendor's approval content changes between runs.
export function configHashOf(approvalData: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(approvalData))
    .digest("hex")
    .slice(0, 12);
}

export function addApproval(
  approvalData: ApprovalData,
  organizationId: string,
  output: ConsolidatedOutput,
): void {
  const { entry: mcpEntry } = findOrCreate(
    output.mcp,
    (m) => m.serverId === approvalData.serverId,
    () => ({
      serverId: approvalData.serverId,
      name: approvalData.serverId,
      description: "",
      mcpRegistryVerified: false,
      approvals: [],
    }),
  );

  const configHash = configHashOf(approvalData);

  const resolvedMcpConfigs = (approvalData.installConfigs ?? []).map((cfg) => {
    let resolved: InstallConfig = cfg;

    if (!resolved.installUrl) {
      const tool = output.tools.find((t) => t.id === cfg.tool);
      if (tool?.mcpInstallUrlPrefix) {
        resolved = {
          ...resolved,
          installUrl: tool.mcpInstallUrlPrefix + approvalData.serverId,
        };
      }
    }

    return resolved;
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
  if (approvalData.metadata) {
    approval.metadata = approvalData.metadata;
  }
  if (approvalData.selfPublished) {
    approval.selfPublished = approvalData.selfPublished;
  }
  if (approvalData.config) {
    approval.genericConfig = approvalData.config;
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

// preferOrg lets a caller make an approval's own organization win over a
// newer submission from a different vendor — used when deriving a config
// for that same approval, so a vendor's own stated connection info is never
// second-guessed by someone else's (possibly stale, possibly wrong) config
// for the same server.
export function pickWinningGenericConfig(
  candidates: Approval[],
  serverId: string,
  preferOrg?: string,
): GenericMcpConfig | undefined {
  if (candidates.length <= 1) return candidates[0]?.genericConfig;

  if (preferOrg) {
    const own = candidates.find((c) => c.organizationId === preferOrg);
    if (own) return own.genericConfig;
  }

  const distinctOrgs = new Set(candidates.map((c) => c.organizationId));
  const winner = [...candidates].sort((a, b) =>
    b.date.localeCompare(a.date),
  )[0];
  console.warn(
    `  WARNING: multiple generic configs for MCP server "${serverId}" from ${[...distinctOrgs].join(", ")} — using ${winner.organizationId}'s (newest by date)`,
  );
  return winner.genericConfig;
}

// Resolves any installConfigs entry still marked config: "derived" — i.e.
// entries whose own approval had no usable root config — by looking across
// every vendor's contribution for the same serverId. Must run after every
// vendor has been collected, so each entry's approvals reflect all of them.
export function resolveMcpCrossVendorConfigs(output: ConsolidatedOutput): void {
  for (const entry of output.mcp) {
    const candidates = entry.approvals.filter((a) => a.genericConfig);
    const slug = entry.serverId.split("/").pop()!;

    for (const approval of entry.approvals) {
      approval.installConfigs = approval.installConfigs.map((cfg) => {
        if (cfg.config !== "derived") return cfg;

        const winner = pickWinningGenericConfig(
          candidates,
          entry.serverId,
          approval.organizationId,
        );
        const transform = mcpConfigTransforms[cfg.tool];
        const derived = winner && transform?.(winner, slug);
        if (derived) {
          return { ...cfg, config: derived };
        }

        console.warn(
          `  WARNING: could not derive config for tool "${cfg.tool}" on MCP server "${entry.serverId}" — no generic config available or the tool can't represent it`,
        );
        const { config: _drop, ...rest } = cfg;
        return rest;
      });
    }
  }
}

/**
 * Resolve vendor-supplied fallback metadata (name/description) and publisher
 * claim status for an MCP entry.
 *
 * Precedence: Anthropic registry (already applied via enrichWithRegistryData)
 * > publisher-claimed metadata > earliest-dated vendor-suggested metadata.
 *
 * Throws if two different organizations both claim to be the publisher of the
 * same server — that's a genuine contradiction, not a matter of opinion.
 */
export function resolveVendorMetadata(entry: McpEntry): void {
  const claimingOrgs = [
    ...new Set(
      entry.approvals
        .filter((a) => a.selfPublished)
        .map((a) => a.organizationId),
    ),
  ];

  if (claimingOrgs.length > 1) {
    throw new Error(
      `Conflicting publisher claim for MCP server "${entry.serverId}": ${claimingOrgs.join(", ")}`,
    );
  }

  if (claimingOrgs.length === 1) {
    entry.publisherClaimedBy = claimingOrgs[0];
  }

  if (entry.mcpRegistryVerified) {
    return;
  }

  const withMetadata = entry.approvals.filter((a) => a.metadata);
  if (withMetadata.length === 0) {
    return;
  }

  const claimantWithMetadata = withMetadata.find((a) => a.selfPublished);
  const winner =
    claimantWithMetadata ??
    [...withMetadata].sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.organizationId.localeCompare(b.organizationId),
    )[0];

  entry.name = winner.metadata!.name;
  entry.description = winner.metadata!.description;

  const distinctOrgs = new Set(withMetadata.map((a) => a.organizationId));
  console.log(
    `  Vendor metadata: ${entry.serverId} (from ${winner.organizationId})`,
  );
  if (distinctOrgs.size > 1) {
    console.warn(
      `  WARNING: multiple vendor metadata suggestions for "${entry.serverId}" — using ${winner.organizationId}'s`,
    );
  }
}

interface HasInstallConfigs {
  installConfigs: { tool: string }[];
}

interface HasApprovals<A extends HasInstallConfigs> {
  approvals: A[];
}

// Filters entries to those with an approval targeting toolId, then strips
// other tools' installConfigs from what's left. The `as E` below is needed
// because TS can't verify a generic spread-and-override reproduces exactly
// E's shape — safe here since the only field touched, `approvals`, is
// pinned to A[] by the HasApprovals<A> constraint, so the override always
// produces an object structurally compatible with E.
function buildToolEntryView<
  A extends HasInstallConfigs,
  E extends HasApprovals<A>,
>(toolId: string, entries: E[]): E[] {
  return entries
    .filter((entry) =>
      entry.approvals.some((a) =>
        a.installConfigs.some((ic) => ic.tool === toolId),
      ),
    )
    .map(
      (entry) =>
        ({
          ...entry,
          approvals: entry.approvals.map((a) => ({
            ...a,
            installConfigs: a.installConfigs.filter((ic) => ic.tool === toolId),
          })),
        }) as E,
    );
}

export function buildToolView(toolId: string, servers: McpEntry[]): McpEntry[] {
  return buildToolEntryView(toolId, servers);
}

interface HasOrganizationId {
  organizationId: string;
}

// Unlike buildToolEntryView, install configs are never stripped: the org
// whitelist view is meant to show everything an org approved, including
// other orgs' approvals of the same artifact (e.g. "also approved by"), so
// filtering to the matching org's approvals alone would throw that context
// away for no benefit — nothing in installConfigs is org-specific.
export function buildOrgEntryView<
  A extends HasInstallConfigs & HasOrganizationId,
  E extends HasApprovals<A>,
>(orgId: string, entries: E[]): E[] {
  return entries.filter((entry) =>
    entry.approvals.some((a) => a.organizationId === orgId),
  );
}

export function addSkillApproval(
  approvalData: SkillApprovalData,
  organizationId: string,
  output: ConsolidatedOutput,
): void {
  const { entry: skillEntry } = findOrCreate(
    output.skills,
    (s) => s.skillId === approvalData.skillId,
    () => ({
      skillId: approvalData.skillId,
      name: approvalData.skillId,
      description: "",
      source: approvalData.source,
      contentHash: "",
      approvals: [],
    }),
  );

  const configHash = configHashOf(approvalData);

  const approval: SkillApproval = {
    organizationId,
    date: approvalData.date,
    configHash,
    installConfigs: approvalData.installConfigs ?? [],
  };
  skillEntry.approvals.push(approval);
}

export function addPluginApproval(
  approvalData: PluginApprovalData,
  organizationId: string,
  output: ConsolidatedOutput,
): void {
  const { entry: pluginEntry, created } = findOrCreate(
    output.plugins,
    (p) => p.pluginId === approvalData.pluginId,
    () => ({
      pluginId: approvalData.pluginId,
      name: approvalData.pluginId,
      description: "",
      source: approvalData.source,
      contentHash: "",
      containedSkills: [],
      containedMcpServers: [],
      approvals: [],
    }),
  );
  if (
    !created &&
    (pluginEntry.source.url !== approvalData.source.url ||
      pluginEntry.source.path !== approvalData.source.path)
  ) {
    // First-collected vendor's source wins. Mirrors resolveVendorMetadata's
    // non-fatal warn-on-disagreement pattern for MCP vendor metadata: a
    // genuine mismatch between vendors' claims is surfaced, not hidden,
    // but doesn't fail the shared build.
    console.warn(
      `  WARNING: plugin "${approvalData.pluginId}" approved with a different source by "${organizationId}" — using "${pluginEntry.approvals[0]?.organizationId}"'s (first collected)`,
    );
  }

  const configHash = configHashOf(approvalData);

  // Plugin IDs never change after this point (no glob/multi-path expansion,
  // unlike skills), so the prefix can be resolved right here rather than in
  // a separate post-enrichment pass — mirroring addApproval's inline
  // resolvedMcpConfigs above rather than skills' resolveSkillInstallUrls.
  const resolvedInstallConfigs = (approvalData.installConfigs ?? []).map(
    (cfg) => {
      if (cfg.installUrl) return cfg;
      const tool = output.tools.find((t) => t.id === cfg.tool);
      if (tool?.pluginInstallUrlPrefix) {
        return {
          ...cfg,
          installUrl: tool.pluginInstallUrlPrefix + approvalData.pluginId,
        };
      }
      return cfg;
    },
  );

  const approval: PluginApproval = {
    organizationId,
    date: approvalData.date,
    configHash,
    installConfigs: resolvedInstallConfigs,
  };
  pluginEntry.approvals.push(approval);
}

export function buildToolPluginView(
  toolId: string,
  plugins: PluginEntry[],
): PluginEntry[] {
  return buildToolEntryView(toolId, plugins);
}

export function addAgentApproval(
  approvalData: AgentApprovalData,
  organizationId: string,
  output: ConsolidatedOutput,
): void {
  const { entry: agentEntry, created } = findOrCreate(
    output.agents,
    (a) => a.agentId === approvalData.agentId,
    () => ({
      agentId: approvalData.agentId,
      name: approvalData.agentId,
      description: "",
      source: approvalData.source,
      contentHash: "",
      approvals: [],
    }),
  );

  if (!created && agentEntry.source.url !== approvalData.source.url) {
    console.warn(
      `  WARNING: agent "${approvalData.agentId}" approved with a different source by "${organizationId}" — using "${agentEntry.approvals[0]?.organizationId}"'s (first collected)`,
    );
  }

  const configHash = configHashOf(approvalData);

  const resolvedInstallConfigs = (approvalData.installConfigs ?? []).map(
    (cfg) => {
      if (cfg.installUrl) return cfg;
      const tool = output.tools.find((t) => t.id === cfg.tool);
      if (tool?.agentInstallUrlPrefix) {
        return {
          ...cfg,
          installUrl: tool.agentInstallUrlPrefix + approvalData.agentId,
        };
      }
      return cfg;
    },
  );

  const approval: AgentApproval = {
    organizationId,
    date: approvalData.date,
    configHash,
    installConfigs: resolvedInstallConfigs,
  };
  agentEntry.approvals.push(approval);
}

export function buildToolAgentView(
  toolId: string,
  agents: AgentEntry[],
): AgentEntry[] {
  return buildToolEntryView(toolId, agents);
}

// Splits skill trust entries into those referencing a registered vendor and
// those that don't. A vendor's own CI fails on an unknown trusted org before
// merge (see checkTrustedOrgIds in validate.ts); this is a defense-in-depth
// check for the shared consolidation build, which should stay up even if one
// vendor's reference is stale or CI was bypassed — so unknown entries are
// dropped rather than failing the whole build.
export function filterValidSkillTrusts(
  skillTrusts: SkillTrustEntry[],
  vendorIds: Set<string>,
): { valid: SkillTrustEntry[]; unknown: SkillTrustEntry[] } {
  const valid: SkillTrustEntry[] = [];
  const unknown: SkillTrustEntry[] = [];
  for (const trust of skillTrusts) {
    (vendorIds.has(trust.trustedOrg) ? valid : unknown).push(trust);
  }
  return { valid, unknown };
}

// Mirrors filterValidSkillTrusts exactly — see its comment for why unknown
// entries are dropped with a warning rather than failing the shared build.
export function filterValidMcpTrusts(
  mcpTrusts: McpTrustEntry[],
  vendorIds: Set<string>,
): { valid: McpTrustEntry[]; unknown: McpTrustEntry[] } {
  const valid: McpTrustEntry[] = [];
  const unknown: McpTrustEntry[] = [];
  for (const trust of mcpTrusts) {
    (vendorIds.has(trust.trustedOrg) ? valid : unknown).push(trust);
  }
  return { valid, unknown };
}

// Mirrors resolveSkillTrust structurally — see its comment for the general
// shape (single-hop only, skip if the trusting org already approved
// directly). The difference: a derived approval's installConfigs entries
// get real content (not just an auto-generated install URL), resolved via
// the same generic-config lookup resolveMcpCrossVendorConfigs uses, since an
// MCP install card needs a URL/command, not just a deep link.
export function resolveMcpTrust(
  output: ConsolidatedOutput,
  mcpTrusts: McpTrustEntry[],
): void {
  for (const { org, trustedOrg } of mcpTrusts) {
    const ownTools = output.tools.filter((t) => t.organizationId === org);
    for (const entry of output.mcp) {
      const sourceApproval = entry.approvals.find(
        (a) => a.organizationId === trustedOrg && !a.viaTrust,
      );
      if (!sourceApproval) continue;
      if (entry.approvals.some((a) => a.organizationId === org)) continue;

      const candidates = entry.approvals.filter((a) => a.genericConfig);
      const winner = pickWinningGenericConfig(
        candidates,
        entry.serverId,
        trustedOrg,
      );
      const slug = entry.serverId.split("/").pop()!;

      const installConfigs: InstallConfig[] = ownTools.map((tool) => {
        const transform = mcpConfigTransforms[tool.id];
        const derived = winner && transform?.(winner, slug);
        const installUrl = tool.mcpInstallUrlPrefix
          ? tool.mcpInstallUrlPrefix + entry.serverId
          : undefined;

        const cfg: InstallConfig = { tool: tool.id };
        if (derived) cfg.config = derived;
        if (installUrl) cfg.installUrl = installUrl;
        return cfg;
      });

      entry.approvals.push({
        organizationId: org,
        date: sourceApproval.date,
        configHash: sourceApproval.configHash,
        installConfigs,
        viaTrust: trustedOrg,
      });
    }
  }
}

// Resolve trust delegations into derived skill approvals. Must run after
// enrichSkillMetadata so that trust matches against final, expanded
// skillIds, and before resolveSkillInstallUrls so install URL generation
// fills in installUrl for the derived installConfigs below, the same way it
// does for direct approvals. Single-hop only: only directly-filed approvals
// (no viaTrust) are used as a trust source, so trust never chains through
// another organization's trust-derived approvals.
//
// A derived approval gets an installConfig entry for each tool the trusting
// organization itself provides, so trusting an organization actually makes
// the skill installable through the trusting organization's own tools —
// otherwise trust would only add a name to the approvals list without ever
// surfacing in a tool-specific view.
//
// If the trusting org already has its own direct approval for the skill, no
// derived approval is added: the website keys badges and counts approvals
// by organizationId, so a second entry for the same org would render as a
// duplicate badge (React key collision) and an inflated approval count. The
// org's own direct judgment already covers it — there's nothing a
// trust-derived copy would add.
export function resolveSkillTrust(
  output: ConsolidatedOutput,
  skillTrusts: SkillTrustEntry[],
): void {
  for (const { org, trustedOrg } of skillTrusts) {
    const ownTools = output.tools.filter((t) => t.organizationId === org);
    for (const skill of output.skills) {
      const sourceApproval = skill.approvals.find(
        (a) => a.organizationId === trustedOrg && !a.viaTrust,
      );
      if (!sourceApproval) continue;
      if (skill.approvals.some((a) => a.organizationId === org)) continue;

      skill.approvals.push({
        organizationId: org,
        date: sourceApproval.date,
        configHash: sourceApproval.configHash,
        installConfigs: ownTools.map((t) => ({ tool: t.id })),
        viaTrust: trustedOrg,
      });
    }
  }
}

// Resolve auto-generated skill install URLs against the final (possibly
// glob-expanded) skillId. Must run after enrichSkillMetadata so that expanded
// entries like "io.example/foo" get URLs matching their expanded skillId
// rather than the base approval skillId.
export function resolveSkillInstallUrls(output: ConsolidatedOutput): void {
  for (const skill of output.skills) {
    for (const approval of skill.approvals) {
      approval.installConfigs = approval.installConfigs.map((cfg) => {
        if (cfg.installUrl) return cfg;
        const tool = output.tools.find((t) => t.id === cfg.tool);
        if (tool?.skillInstallUrlPrefix) {
          return {
            ...cfg,
            installUrl: tool.skillInstallUrlPrefix + skill.skillId,
          };
        }
        return cfg;
      });
    }
  }
}

export function buildToolSkillView(
  toolId: string,
  skills: SkillEntry[],
): SkillEntry[] {
  return buildToolEntryView(toolId, skills);
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
  skillTrusts: SkillTrustEntry[],
  mcpTrusts: McpTrustEntry[],
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

  addOrganization(
    result.organization!.raw as OrganizationData,
    output,
    skillTrusts,
    mcpTrusts,
  );

  for (const { data } of result.approvals) {
    addApproval(data, vendorId, output);
    console.log(`  Collected MCP: ${data.serverId}`);
  }

  for (const { data } of result.skillApprovals) {
    addSkillApproval(data as SkillApprovalData, vendorId, output);
    console.log(`  Collected skill: ${data.skillId}`);
  }

  for (const { data } of result.pluginApprovals) {
    addPluginApproval(data as PluginApprovalData, vendorId, output);
    console.log(`  Collected plugin: ${data.pluginId}`);
  }

  for (const { data } of result.agentApprovals) {
    addAgentApproval(data as AgentApprovalData, vendorId, output);
    console.log(`  Collected agent: ${data.agentId}`);
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

  const mcpPath = resolve(outputDir, "mcp.json");
  writeJson(mcpPath, { mcp: output.mcp });
  console.log(`Written: ${mcpPath}`);

  const skillsPath = resolve(outputDir, "skills.json");
  writeJson(skillsPath, { skills: output.skills });
  console.log(`Written: ${skillsPath}`);

  const pluginsPath = resolve(outputDir, "plugins.json");
  writeJson(pluginsPath, { plugins: output.plugins });
  console.log(`Written: ${pluginsPath}`);

  const agentsPath = resolve(outputDir, "agents.json");
  writeJson(agentsPath, { agents: output.agents });
  console.log(`Written: ${agentsPath}`);

  const toolsDir = resolve(outputDir, "tools");
  mkdirSync(toolsDir, { recursive: true });

  for (const tool of output.tools) {
    const toolPath = resolve(toolsDir, `${tool.id}.json`);
    writeJson(toolPath, {
      mcp: buildToolView(tool.id, output.mcp),
      skills: buildToolSkillView(tool.id, output.skills),
      plugins: buildToolPluginView(tool.id, output.plugins),
      agents: buildToolAgentView(tool.id, output.agents),
    });
    console.log(`Written: ${toolPath}`);
  }

  const orgsDir = resolve(outputDir, "orgs");
  mkdirSync(orgsDir, { recursive: true });

  for (const org of output.organizations) {
    const orgPath = resolve(orgsDir, `${org.id}.json`);
    writeJson(orgPath, {
      mcp: buildOrgEntryView(org.id, output.mcp),
      skills: buildOrgEntryView(org.id, output.skills),
      plugins: buildOrgEntryView(org.id, output.plugins),
      agents: buildOrgEntryView(org.id, output.agents),
    });
    console.log(`Written: ${orgPath}`);
  }

  console.log(`\n  Organizations: ${output.organizations.length}`);
  console.log(`  Tools: ${output.tools.length}`);
  console.log(`  MCP servers: ${output.mcp.length}`);
  console.log(`  Skills: ${output.skills.length}`);
  console.log(`  Plugins: ${output.plugins.length}`);
  console.log(`  Agents: ${output.agents.length}`);
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
    plugins: [],
    agents: [],
  };
  const skillTrusts: SkillTrustEntry[] = [];
  const mcpTrusts: McpTrustEntry[] = [];

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
      collectVendorData(vendor.id, vendorPath, output, skillTrusts, mcpTrusts);
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

  // Drop (with a warning) any trust entry referencing an unregistered org,
  // rather than failing the whole build — a vendor's own CI already hard-
  // fails on this before merge (see checkTrustedOrgIds in validate.ts)
  const vendorIds = new Set(vendors.map((v) => v.id));
  const { valid: validSkillTrusts, unknown: unknownSkillTrusts } =
    filterValidSkillTrusts(skillTrusts, vendorIds);
  for (const { org, trustedOrg } of unknownSkillTrusts) {
    console.warn(
      `  WARNING: organization.json for "${org}" trusts unknown organization "${trustedOrg}" — skipping`,
    );
  }

  const { valid: validMcpTrusts, unknown: unknownMcpTrusts } =
    filterValidMcpTrusts(mcpTrusts, vendorIds);
  for (const { org, trustedOrg } of unknownMcpTrusts) {
    console.warn(
      `  WARNING: organization.json for "${org}" trusts unknown organization "${trustedOrg}" for MCP — skipping`,
    );
  }

  // Step 2a: Enrich MCP with Anthropic registry (fails build on registry errors)
  await enrichRegistryMetadata(output);

  // Step 2a2: Resolve vendor-supplied fallback metadata + publisher claim
  // (fails build on conflicting publisher claims for the same server)
  for (const entry of output.mcp) {
    resolveVendorMetadata(entry);
  }

  // Resolve MCP trust delegations, then handle any remaining explicit
  // "derived" requests via cross-vendor lookup
  resolveMcpTrust(output, validMcpTrusts);
  resolveMcpCrossVendorConfigs(output);

  // Step 2b: Enrich skills with source metadata (expands multi-path, skips unreachable sources)
  output.skills = enrichSkillMetadata(output.skills);

  // Resolve trust delegations into derived skill approvals
  resolveSkillTrust(output, validSkillTrusts);

  // Resolve auto-generated install URLs against the final (expanded) skillIds
  resolveSkillInstallUrls(output);

  // Check for duplicate skillIds after expansion
  const seenSkillIds = new Set<string>();
  for (const skill of output.skills) {
    if (seenSkillIds.has(skill.skillId)) {
      throw new Error(`Duplicate skillId after expansion: "${skill.skillId}"`);
    }
    seenSkillIds.add(skill.skillId);
  }

  // Step 2c: Enrich plugins with source metadata (skips unreachable sources)
  output.plugins = enrichPluginMetadata(output.plugins);

  // Step 2d: Enrich agents with source metadata (skips unreachable sources)
  output.agents = await enrichAgentMetadata(output.agents);

  // Step 3: Write output
  output.mcp.sort((a, b) => a.serverId.localeCompare(b.serverId));
  output.skills.sort((a, b) => a.skillId.localeCompare(b.skillId));
  output.plugins.sort((a, b) => a.pluginId.localeCompare(b.pluginId));
  output.agents.sort((a, b) => a.agentId.localeCompare(b.agentId));
  writeOutput(output);
}
