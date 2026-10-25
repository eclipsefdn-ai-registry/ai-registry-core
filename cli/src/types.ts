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
  description: string;
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
  viaTrust?: string;
  // set when the organization approved a marketplace file that lists this
  // plugin, rather than this plugin itself
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
  // see Skill
  source: {
    url: string;
    path?: string;
    ref?: string;
    commit?: string;
    pinned?: boolean;
  };
  contentHash: string;
  latestHash?: string;
  containedSkills: ContainedSkill[];
  containedMcpServers: ContainedMcpServer[];
  approvals: PluginApproval[];
}

export interface PluginsFeed {
  generatedAt?: string;
  plugins: Plugin[];
}
