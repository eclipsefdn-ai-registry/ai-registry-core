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

// Mirrors GenericMcpConfig only as far as the website reads it: the
// connection fields are printed as JSON and nothing more, notes is shown as
// text, and serverKey names the key a client stores the server under.
export type GenericConfig = Record<string, unknown> & {
  notes?: string;
  serverKey?: string;
};

export interface Approval {
  organizationId: string;
  date: string;
  // Informational: the MCP registry version the organization reviewed, and
  // only when the approval file gave one. What runs is set by the configs.
  version?: string;
  configHash: string;
  installConfigs: InstallConfig[];
  genericConfig?: GenericConfig;
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
  // rather than a branch, and is false with no ref. Absent in feeds that
  // predate it and when consolidation couldn't list the source's branches,
  // which reads as unknown rather than false: a named ref could be either.
  // It describes the ref above, which is one organization's when approvals
  // name different sources. Same on Plugin and SandboxExtension.
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
  // Set when the server's config references `${PLUGIN_DATA}`, which not every
  // tool expands. Absent otherwise, and in feeds that predate it.
  usesPluginData?: true;
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
  // Whether the plugin conforms to the Agent Plugins specification
  // (agent-plugins.org), and if not, one readable message per failed check.
  // agentPluginIssues is omitted for an Agent Plugin. Both are absent in feeds
  // that predate them, which reads as unknown, never as "not an Agent Plugin".
  isAgentPlugin?: boolean;
  agentPluginIssues?: string[];
  // The per-organization marketplaces the registry publishes that list this
  // plugin, one record each, read off the files themselves so none names an
  // entry that was left out. Empty when none does; absent in feeds that
  // predate it, which reads as unknown.
  publishedMarketplaces?: PublishedMarketplace[];
  // One record per known marketplace file present in the plugin's repository
  // at source.commit. entryName is set only when the file has a local or
  // relative-path entry for this plugin's path; marketplaceName is absent when
  // the file can't be parsed. Facts about files, not tools: which tool reads
  // which file, and in what order, lives in installCommand.ts. Absent in feeds
  // that predate it, which reads as unknown.
  marketplaceFiles?: RepositoryMarketplaceFile[];
  // Which of `.mcp.json`, and `.claude-plugin/plugin.json` when it declares
  // mcpServers, the plugin directory has at source.commit, relative to the
  // plugin. Facts about files, not tools: that Claude Code reads MCP servers
  // only from these lives in installCommand.ts. Absent in feeds that predate
  // it, which reads as unknown.
  mcpConfigFiles?: string[];
  approvals: PluginApproval[];
}

// A marketplace file in a plugin's repository, as consolidation read it.
export interface RepositoryMarketplaceFile {
  path: string;
  marketplaceName?: string;
  entryName?: string;
}

// Where a plugin is listed in an organization's published marketplace, which
// together make `claude plugin install <entryName>@<marketplaceName>`.
export interface PublishedMarketplace {
  orgId: string;
  marketplaceName: string;
  entryName: string;
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
  // Only orgs/<id>.json carries it: whether orgs/<id>/marketplace.json was
  // written. An organization can list plugins and still have none, when every
  // entry was left out of it (see src/marketplace-output.ts).
  hasMarketplace?: boolean;
}
