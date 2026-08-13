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
  source: { url: string; path?: string };
  contentHash: string;
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

export interface RegistryData {
  organizations: Organization[];
  tools: Tool[];
  mcp: McpServer[];
  skills: Skill[];
  plugins: Plugin[];
  agents: Agent[];
}
