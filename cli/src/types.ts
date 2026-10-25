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
