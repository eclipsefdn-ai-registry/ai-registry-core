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

export interface Approval {
  organizationId: string;
  date: string;
  versionRange?: string;
  installConfigs: InstallConfig[];
}

export interface McpServer {
  serverId: string;
  name: string;
  description: string;
  mcpRegistryVerified: boolean;
  approvals: Approval[];
}

export interface RegistryData {
  organizations: Organization[];
  tools: Tool[];
  mcp: McpServer[];
}
