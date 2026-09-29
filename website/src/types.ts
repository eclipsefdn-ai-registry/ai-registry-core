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
}

export interface InstallConfig {
  tool: string;
  installUrl?: string;
  openVsxUrl?: string;
  config?: Record<string, unknown>;
  instructions?: string;
}

export interface Approval {
  organizationId: string;
  date: string;
  version?: string;
  configHash: string;
  installConfigs: InstallConfig[];
  genericConfig?: Record<string, unknown>;
  viaTrust?: string;
}

export interface McpServer {
  serverId: string;
  name: string;
  description: string;
  latestVersion?: string;
  mcpRegistryVerified: boolean;
  approvals: Approval[];
  publisherClaimedBy?: string;
}

export interface SkillInstallConfig {
  tool: string;
  installUrl?: string;
}

export interface SkillApproval {
  organizationId: string;
  date: string;
  configHash: string;
  installConfigs: SkillInstallConfig[];
  viaTrust?: string;
}

export interface Skill {
  skillId: string;
  name: string;
  description: string;
  // pinned says whether ref names a fixed point, a tag or a full commit SHA,
  // rather than a branch. Absent in feeds that don't carry it, which reads as
  // unknown rather than false: a named ref could be either. Same on Plugin and
  // SandboxExtension.
  source: {
    url: string;
    path?: string;
    ref?: string;
    commit?: string;
    pinned?: boolean;
  };
  contentHash: string;
  // What the source ships at this path now: the tip of the ref's own branch
  // for a branch ref, of the default branch otherwise. Equal to source.commit
  // and contentHash unless the ref pins a tag or commit the default branch has
  // moved off, and absent when consolidation couldn't find out. Behind means
  // latestHash !== contentHash, and only when latestHash is present. Never
  // compare the commits. Same on Plugin and SandboxExtension.
  latestCommit?: string;
  latestHash?: string;
  approvals: SkillApproval[];
}

export interface PluginInstallConfig {
  tool: string;
  installUrl?: string;
  config?: Record<string, unknown>;
  instructions?: string;
}

export interface PluginApproval {
  organizationId: string;
  date: string;
  configHash: string;
  installConfigs: PluginInstallConfig[];
  viaTrust?: string;
  sourcedFrom?: { marketplaceUrl: string; format: string };
}

export interface ContainedSkill {
  name: string;
  description: string;
  path: string;
}

export interface ContainedMcpServer {
  name: string;
  transport: string;
}

export interface Plugin {
  pluginId: string;
  name: string;
  description: string;
  version?: string;
  author?: string;
  homepage?: string;
  keywords?: string[];
  // see Skill
  source: {
    url: string;
    path?: string;
    ref?: string;
    commit?: string;
    pinned?: boolean;
  };
  contentHash: string;
  // see Skill
  latestCommit?: string;
  latestHash?: string;
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

export interface AgentApproval {
  organizationId: string;
  date: string;
  configHash: string;
  installConfigs: AgentInstallConfig[];
  viaTrust?: string;
}

export interface Agent {
  agentId: string;
  name: string;
  description: string;
  source: { url: string };
  contentHash: string;
  approvals: AgentApproval[];
}

export type SandboxKind = "sandbox" | "mixin";

// No installConfigs, unlike every other approval type: nothing about
// installing a sandbox extension is tool-specific, so an approval is the
// organization, the date, and the hash.
export interface SandboxExtensionApproval {
  organizationId: string;
  date: string;
  configHash: string;
  viaTrust?: string;
}

export interface SandboxExtension {
  sandboxExtensionId: string;
  kind: SandboxKind;
  // display title: the spec's displayName, falling back to its name
  name: string;
  // the spec's own name — what `enclave add --name` matches on
  extensionName: string;
  description: string;
  // see Skill
  source: {
    url: string;
    path: string;
    ref?: string;
    commit?: string;
    pinned?: boolean;
  };
  contentHash: string;
  // see Skill
  latestCommit?: string;
  latestHash?: string;
  approvals: SandboxExtensionApproval[];
}

export interface RegistryData {
  // When the consolidation run that wrote the data started. Every file
  // carries it (consolidate.ts stamps it in writeOutput, so it isn't part of
  // ConsolidatedOutput there), and it dates latestCommit/latestHash.
  generatedAt: string;
  organizations: Organization[];
  tools: Tool[];
  mcp: McpServer[];
  skills: Skill[];
  plugins: Plugin[];
  agents: Agent[];
  sandboxTools: SandboxExtension[];
  sandboxFeatures: SandboxExtension[];
}
