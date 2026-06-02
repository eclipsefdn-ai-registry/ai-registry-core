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
}

export interface McpServer {
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

export interface SkillApproval {
  organizationId: string;
  date: string;
  configHash: string;
  installConfigs: SkillInstallConfig[];
}

export interface Skill {
  skillId: string;
  name: string;
  description: string;
  source: { url: string; path?: string };
  contentHash: string;
  approvals: SkillApproval[];
}

export interface RegistryData {
  organizations: Organization[];
  tools: Tool[];
  mcp: McpServer[];
  skills: Skill[];
}
