import type { ConsolidatedOutput } from "./consolidate.js";

/**
 * Which approvals a consolidated feed shows behind their source, for
 * cli-check-updates.ts to report. Pure: everything it needs was computed
 * during consolidation, so it uses the same definition of behind as the
 * website and every client (see AGENTS.md, "Latest").
 */

/** The parts of a consolidated feed that can be behind. */
export type Feed = Pick<
  ConsolidatedOutput,
  "skills" | "plugins" | "sandboxTools" | "sandboxFeatures"
>;

export type ArtifactType =
  | "skill"
  | "plugin"
  | "sandboxTool"
  | "sandboxFeature";

/** One approval whose entry's source has changed since it was approved. */
export interface BehindApproval {
  organizationId: string;
  type: ArtifactType;
  id: string;
  ref?: string;
  commit?: string;
  latestCommit?: string;
}

/**
 * Behind is latestHash !== contentHash, and only when latestHash is present:
 * a missing one means consolidation couldn't find out. Commits are never
 * compared, since a repository's commit moves whenever any path in it does.
 */
function isBehind(entry: {
  contentHash: string;
  latestHash?: string;
}): boolean {
  return (
    entry.latestHash !== undefined && entry.latestHash !== entry.contentHash
  );
}

// What every artifact type that can be behind has in common.
interface Checkable {
  source: { ref?: string; commit?: string; pinned?: boolean };
  contentHash: string;
  latestCommit?: string;
  latestHash?: string;
  approvals: {
    organizationId: string;
    viaTrust?: string;
    sourcedFrom?: unknown;
  }[];
}

function behindApprovals<E extends Checkable>(
  type: ArtifactType,
  entries: E[],
  idOf: (entry: E) => string,
): BehindApproval[] {
  const found: BehindApproval[] = [];
  for (const entry of entries) {
    if (!isBehind(entry)) continue;
    // Only a direct approval has an approval file that a PR can change. A
    // trust-derived one is the trusted organization's, listed through its
    // own approval, and a marketplace-derived one names the marketplace.
    for (const approval of entry.approvals) {
      if (approval.viaTrust || approval.sourcedFrom) continue;
      found.push({
        organizationId: approval.organizationId,
        type,
        id: idOf(entry),
        ref: entry.source.ref,
        commit: entry.source.commit,
        latestCommit: entry.latestCommit,
      });
    }
  }
  return found;
}

/**
 * Every direct approval of a skill, plugin or sandbox extension whose entry is
 * behind. MCP servers have no pin to fall behind (an approval's version is
 * informational) and agents record nothing about what was approved.
 *
 * Behind is a property of the entry, whose source is the first collected
 * organization's when approvals name different sources, so another
 * organization's approval on a behind entry is listed even if it tracks a
 * branch. That goes away once a source is published per approval.
 */
export function findBehindApprovals(feed: Feed): BehindApproval[] {
  return [
    ...behindApprovals("skill", feed.skills, (e) => e.skillId),
    ...behindApprovals("plugin", feed.plugins, (e) => e.pluginId),
    ...behindApprovals(
      "sandboxTool",
      feed.sandboxTools,
      (e) => e.sandboxExtensionId,
    ),
    ...behindApprovals(
      "sandboxFeature",
      feed.sandboxFeatures,
      (e) => e.sandboxExtensionId,
    ),
  ];
}

// The same pattern consolidation's checkout uses (COMMIT_SHA_PATTERN in
// git-source.ts): only a full SHA is a commit, a short one is a name.
const COMMIT_SHA = /^[0-9a-f]{40}$/i;

/**
 * Whether an entry is pinned, as far as the feed says: source.pinned, or for
 * a feed from before it, a full commit SHA, which is fixed by its form alone.
 * A named ref without source.pinned could be a branch, so it doesn't count.
 */
function isPinned(entry: Checkable): boolean {
  if (entry.source.pinned !== undefined) return entry.source.pinned;
  return entry.source.ref !== undefined && COMMIT_SHA.test(entry.source.ref);
}

/** How many entries the feed shows behind, and how many pins it couldn't check. */
export interface Summary {
  behind: number;
  unchecked: number;
}

export function summarize(feed: Feed): Summary {
  const entries = [
    ...feed.skills,
    ...feed.plugins,
    ...feed.sandboxTools,
    ...feed.sandboxFeatures,
  ];
  return {
    behind: entries.filter(isBehind).length,
    unchecked: entries.filter((e) => e.latestHash === undefined && isPinned(e))
      .length,
  };
}

/** A vendor registered in vendors.json: the organization id and its repo. */
export interface Vendor {
  id: string;
  repo: string;
}

const TYPE_LABELS: Record<ArtifactType, string> = {
  skill: "skill",
  plugin: "plugin",
  sandboxTool: "sandbox tool",
  sandboxFeature: "sandbox feature",
};

/** A full commit SHA shortened to the 7 characters git shows. */
function short(commit: string): string {
  return commit.slice(0, 7);
}

/**
 * The report cli-check-updates.ts prints. Says the source has changed and
 * where the default branch is now, never that anything is outdated or newer:
 * a pinned approval is still valid, it's the new content nobody approved.
 */
export function formatReport(
  found: BehindApproval[],
  vendors: Vendor[],
  generatedAt: string,
  summary: Summary,
): string {
  const lines = [
    `Approvals whose source has changed, from the feed generated ${generatedAt}`,
  ];

  // Grouped by the organization that would act on it, in its vendor repo.
  const byOrganization = new Map<string, BehindApproval[]>();
  for (const approval of found) {
    const group = byOrganization.get(approval.organizationId) ?? [];
    group.push(approval);
    byOrganization.set(approval.organizationId, group);
  }

  for (const organizationId of [...byOrganization.keys()].sort()) {
    const vendor = vendors.find((v) => v.id === organizationId);
    lines.push(
      "",
      `${organizationId}  ${vendor?.repo ?? "(no vendor repo registered)"}`,
    );
    for (const approval of byOrganization.get(organizationId)!) {
      const at = approval.commit ? ` (${short(approval.commit)})` : "";
      const latest = approval.latestCommit
        ? `; the default branch is at ${short(approval.latestCommit)}`
        : "";
      lines.push(
        `  ${TYPE_LABELS[approval.type]}  ${approval.id}  pinned to ${approval.ref}${at}, the source has changed since${latest}`,
      );
    }
  }
  // Last, and whatever was listed: an empty listing alone can't tell "every
  // pin is current" from "nobody could check".
  const behind =
    summary.behind === 1
      ? "1 entry behind its source"
      : `${summary.behind} entries behind their source`;
  const unchecked =
    summary.unchecked === 1
      ? "1 pinned entry couldn't be checked"
      : `${summary.unchecked} pinned entries couldn't be checked`;
  lines.push("", `${behind} · ${unchecked}`);

  return lines.join("\n");
}
