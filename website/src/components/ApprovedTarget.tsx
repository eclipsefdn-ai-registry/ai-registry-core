import { GitBranch, Pin } from "lucide-react";
import {
  approvedTarget,
  approvedTargetText,
  type ApprovedVsCurrent,
} from "../approvedTarget";

/**
 * What an approval targets in its source, and whether the source has changed
 * at that path since, as one statement:
 *  - tracks: "Tracks the default branch" or "Tracks release-1.x".
 *  - pinned: "Pinned to v1.2.0", plus ", the source has changed since" when
 *    the entry's own path differs on the default branch now.
 *  - ref: "Ref: v1.2.0", for a named ref the feed doesn't classify.
 *
 * The states and their wording live in approvedTarget.ts, where they can be
 * tested; this only picks the icon. `generatedAt` dates the change claim,
 * since a stored "latest" is only as current as the run that stored it.
 *
 * Muted on purpose rather than a warning: a pinned approval the source has
 * moved past is still a valid approval someone reviewed.
 */
export function ApprovedTarget({
  entry,
  generatedAt,
}: {
  entry: ApprovedVsCurrent;
  generatedAt?: string;
}) {
  const target = approvedTarget(entry);
  const { text, title } = approvedTargetText(target, generatedAt);
  // No icon for a ref the feed doesn't classify: a branch icon or a pin would
  // each claim one of the two things it might be.
  const Icon =
    target.kind === "tracks"
      ? GitBranch
      : target.kind === "pinned"
        ? Pin
        : undefined;

  return (
    <span
      className="inline-flex items-center gap-1 text-muted-foreground text-xs cursor-help"
      title={title}
    >
      {Icon && <Icon className="h-3 w-3 shrink-0" />}
      {text}
    </span>
  );
}
