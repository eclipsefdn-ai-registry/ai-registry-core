/**
 * What an approval targets in its source, and whether the source has changed
 * at that path since. The skill, plugin and sandbox extension detail views
 * make this one statement instead of printing a raw ref beside a raw hash and
 * leaving the reader to work out how they relate.
 *
 * A branch, a tag and a commit are three different promises, and one label
 * covering all of them would read as stronger than a branch is, so there are
 * three kinds:
 *  - tracks: no ref, which is the default branch, or a branch ref. The entry
 *    follows the branch, so its latest fields equal what it resolved to by
 *    construction and there is never a change to report.
 *  - pinned: a tag or a full commit SHA. The default branch can move past it,
 *    and latestHash differs once the entry's own path changed there.
 *  - ref: a named ref the feed doesn't classify. Printed as given, since it
 *    could be either of the other two.
 *
 * source.pinned classifies a ref. Without it two cases are still certain: a
 * full commit SHA is a fixed point by definition, and a latestHash that
 * differs means consolidation hashed the default branch a second time, which
 * it only does for a pin.
 *
 * Only the hashes say whether the source changed, never the commits. A
 * repository holding twenty skills moves its branch whenever any of them
 * changes, while the other nineteen folders stay exactly as approved.
 */

// The same pattern consolidation's checkout uses (COMMIT_SHA_PATTERN in
// src/git-source.ts): only a full SHA is a commit, a short one is a name.
const COMMIT_SHA = /^[0-9a-f]{40}$/i;

// Structural, so a Skill, Plugin or SandboxExtension can be passed as is.
export interface ApprovedVsCurrent {
  source: { ref?: string; pinned?: boolean };
  contentHash: string;
  latestHash?: string;
}

// unknown is a missing latestHash: consolidation couldn't find out what the
// source ships now, which is neither the same nor changed.
export type SourceChange = "same" | "changed" | "unknown";

export type ApprovedTarget =
  | { kind: "tracks"; branch?: string }
  | { kind: "pinned"; ref: string; change: SourceChange }
  // A change would have made it a pin, so a ref is only ever same or unknown.
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
 * The date of the consolidation run the latest fields come from, since a
 * stored "latest" is only as current as the run that stored it. Undefined when
 * the feed carries no usable generatedAt.
 */
export function checkedOn(generatedAt: string | undefined): string | undefined {
  if (!generatedAt) return undefined;
  const time = Date.parse(generatedAt);
  return Number.isNaN(time)
    ? undefined
    : new Date(time).toISOString().slice(0, 10);
}

export interface ApprovedTargetText {
  text: string;
  title: string;
}

/**
 * The visible text and the tooltip for an approved target. A pinned approval
 * the source has moved past is still a valid approval someone reviewed; it is
 * the newer content that hasn't been, so nothing here calls the approval
 * outdated, and nothing gives the difference a direction.
 */
export function approvedTargetText(
  target: ApprovedTarget,
  generatedAt?: string,
): ApprovedTargetText {
  const date = checkedOn(generatedAt);
  const theDefaultBranch = date
    ? `As of ${date}, the default branch`
    : "The default branch";

  switch (target.kind) {
    case "tracks":
      return target.branch === undefined
        ? {
            text: "Tracks the default branch",
            title:
              "Approved at the repository's default branch, which it follows: every consolidation run hashes what the branch ships then.",
          }
        : {
            text: `Tracks ${target.branch}`,
            title: `Approved at the branch ${target.branch}, which it follows: every consolidation run hashes what the branch ships then.`,
          };

    case "pinned": {
      const text = `Pinned to ${displayRef(target.ref)}`;
      const fixed = `Approved at ${target.ref}, a tag or commit that stays fixed.`;
      if (target.change === "changed") {
        return {
          text: `${text}, the source has changed since${date ? ` (checked ${date})` : ""}`,
          title: `${fixed} ${theDefaultBranch} ships different content at this path, which hasn't been approved.`,
        };
      }
      if (target.change === "unknown") {
        return {
          text,
          title: `${fixed} Consolidation couldn't find out what the default branch ships at this path now.`,
        };
      }
      return {
        text,
        title: `${fixed} ${theDefaultBranch} ships the same content at this path.`,
      };
    }

    // Deliberately no claim about the default branch when the change is
    // "same": a branch ref is its own latest, so same says nothing here.
    case "ref": {
      const asGiven = `Approved at ${target.ref}. The feed doesn't say whether that's a branch, which moves, or a tag, which stays fixed.`;
      return {
        text: `Ref: ${displayRef(target.ref)}`,
        title:
          target.change === "unknown"
            ? `${asGiven} Consolidation couldn't find out what the source ships at this path now.`
            : asGiven,
      };
    }
  }
}

/** The tooltip for a source link built by sourceTreeUrl. */
export function sourceLinkTitle(
  commit: string | undefined,
): string | undefined {
  return commit
    ? `The source at ${displayRef(commit)}, the commit this entry's hash was computed at`
    : undefined;
}
