// The parts of the published feed this CLI reads. Mirrors the website's
// website/src/types.ts by hand rather than importing it, so the CLI sees only
// what any third-party client sees: the JSON under /api/v1/.

export interface Organization {
  id: string;
  name: string;
}

export interface SkillApproval {
  organizationId: string;
  date: string;
  // the id of the organization that filed the approval, on a trust-derived
  // approval only
  viaTrust?: string;
}

export interface Skill {
  skillId: string;
  name: string;
  // pinned says whether ref names a tag or full commit SHA rather than a
  // branch; absent reads as unknown, not false
  source: {
    url: string;
    path?: string;
    ref?: string;
    commit?: string;
    pinned?: boolean;
  };
  contentHash: string;
  // What the source ships at this path now. Behind means latestHash !==
  // contentHash, and only when latestHash is present.
  latestHash?: string;
  approvals: SkillApproval[];
}

export interface SkillsFeed {
  generatedAt?: string;
  skills: Skill[];
}

export interface OrganizationsFeed {
  generatedAt?: string;
  organizations: Organization[];
}

export interface PluginApproval {
  organizationId: string;
  date: string;
  // see SkillApproval
  viaTrust?: string;
}

export interface ContainedMcpServer {
  name: string;
  // Set when the server's config references `${PLUGIN_DATA}`, which not every
  // tool expands. Absent otherwise, and in feeds that predate it.
  usesPluginData?: true;
}

// Where a plugin is listed in an organization's published marketplace, which
// together make `claude plugin install <entryName>@<marketplaceName>`.
export interface PublishedMarketplace {
  orgId: string;
  marketplaceName: string;
  entryName: string;
}

// A marketplace file in a plugin's repository at source.commit, as
// consolidation read it. entryName is set only when the file lists this
// plugin from a path in the repository; marketplaceName is absent when the
// file can't be parsed.
export interface RepositoryMarketplaceFile {
  path: string;
  marketplaceName?: string;
  pluginRoot?: string;
  entryName?: string;
}

// The fields of a plugin that are absent in older feeds read as unknown, never
// as false or empty: see website/src/types.ts.
export interface Plugin {
  pluginId: string;
  name: string;
  // see Skill
  source: {
    url: string;
    path?: string;
    ref?: string;
    commit?: string;
    pinned?: boolean;
  };
  containedMcpServers: ContainedMcpServer[];
  isAgentPlugin?: boolean;
  publishedMarketplaces?: PublishedMarketplace[];
  marketplaceFiles?: RepositoryMarketplaceFile[];
  mcpConfigFiles?: string[];
  approvals: PluginApproval[];
}

export interface PluginsFeed {
  generatedAt?: string;
  plugins: Plugin[];
}
