import type { Organization } from "../types";
import { safeCssColor } from "../sanitize";
import { orgBadge } from "../orgBadge";

interface ApprovalLike {
  organizationId: string;
}

// The org-approval-badge span (dashed border if inferred, color dot, badge
// text) was duplicated across every card/list component that shows which
// orgs approved an artifact. approvedTitle lets each caller keep its own
// tooltip wording (e.g. ServerList's longer MCP-specific text).
export function OrgBadges<A extends ApprovalLike>({
  approvals,
  getOrg,
  approvedTitle,
}: {
  approvals: A[];
  getOrg: (id: string) => Organization | undefined;
  approvedTitle: (org: Organization) => string;
}) {
  return (
    <>
      {approvals.map((a) => {
        const org = getOrg(a.organizationId);
        if (!org) return undefined;
        const badge = orgBadge(org, {
          fallbackId: a.organizationId,
          approvedTitle: approvedTitle(org),
        });
        return (
          <span
            key={a.organizationId}
            className={`inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full border border-border bg-background cursor-help hover:opacity-80 transition-opacity ${
              badge.inferred ? "border-dashed" : ""
            }`}
            title={badge.title}
          >
            {org.color && (
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: safeCssColor(org.color) }}
              />
            )}
            {badge.text}
          </span>
        );
      })}
    </>
  );
}
