// Mirrors approvedTarget and displayRef in website/src/approvedTarget.ts by
// hand: keep them in sync. The reasoning behind the three kinds lives there.

// Only a full SHA is a commit, a short one is a name.
const COMMIT_SHA = /^[0-9a-f]{40}$/i;

export interface ApprovedVsCurrent {
  source: { ref?: string; pinned?: boolean };
  contentHash: string;
  latestHash?: string;
}

// unknown is a missing latestHash: consolidation couldn't find out what the
// source ships now.
export type SourceChange = "same" | "changed" | "unknown";

export type ApprovedTarget =
  | { kind: "tracks"; branch?: string }
  | { kind: "pinned"; ref: string; change: SourceChange }
  | { kind: "ref"; ref: string; change: Exclude<SourceChange, "changed"> };

export function approvedTarget(entry: ApprovedVsCurrent): ApprovedTarget {
  const { ref, pinned } = entry.source;
  if (ref === undefined) return { kind: "tracks" };
  if (pinned === false) return { kind: "tracks", branch: ref };

  const change: SourceChange = !entry.latestHash
    ? "unknown"
    : entry.latestHash === entry.contentHash
      ? "same"
      : "changed";
  if (pinned === true || COMMIT_SHA.test(ref) || change === "changed") {
    return { kind: "pinned", ref, change };
  }
  return { kind: "ref", ref, change };
}

/** A full commit SHA shortened to the 7 characters git shows; any name as is. */
export function displayRef(ref: string): string {
  return COMMIT_SHA.test(ref) ? ref.slice(0, 7) : ref;
}

/**
 * The visible text of approvedTargetText in website/src/approvedTarget.ts,
 * without the tooltip. Nothing here calls a pin the source has moved past
 * outdated: it is still an approval someone reviewed.
 */
export function approvedTargetText(
  target: ApprovedTarget,
  generatedAt?: string,
): string {
  // Consolidation writes generatedAt with toISOString(), so its first ten
  // characters are the date of the run the latest fields come from.
  const date = generatedAt?.slice(0, 10);
  switch (target.kind) {
    case "tracks":
      return `Tracks ${target.branch ?? "the default branch"}`;
    case "pinned": {
      const text = `Pinned to ${displayRef(target.ref)}`;
      return target.change === "changed"
        ? `${text}, the source has changed since${date ? ` (checked ${date})` : ""}`
        : text;
    }
    case "ref":
      return `Ref: ${displayRef(target.ref)}`;
  }
}
