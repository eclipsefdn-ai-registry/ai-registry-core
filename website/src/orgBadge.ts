import type { Organization } from "./types";

/**
 * Disclaimer shown for organizations that were pre-seeded from an official
 * public source rather than participating directly in the registry.
 */
export const INFERRED_DISCLAIMER =
  "Based on an official public source. This does not indicate direct participation by the organisation in the AI Registry.";

export interface OrgBadge {
  inferred: boolean;
  title: string;
  text: string;
}

/**
 * Compute the tooltip and visible text for an organization approval badge.
 * Both inferred and direct organizations show just the organization name; they
 * are distinguished visually (callers render a dashed border for inferred ones)
 * with the full explanation carried in the tooltip — the disclaimer for
 * inferred organizations, the supplied "Approved by …" text otherwise.
 */
export function orgBadge(
  org: Organization | undefined,
  opts: { fallbackId: string; approvedTitle: string },
): OrgBadge {
  const inferred = org?.inferred === true;
  return {
    inferred,
    title: inferred ? INFERRED_DISCLAIMER : opts.approvedTitle,
    text: org ? org.name : opts.fallbackId,
  };
}
