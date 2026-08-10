import type { ReactNode } from "react";
import type { Organization } from "../types";
import { safeCssColor } from "../sanitize";
import { orgBadge } from "../orgBadge";

interface ArtifactApproval {
  organizationId: string;
}

interface Artifact {
  name: string;
  description: string;
  approvals: ArtifactApproval[];
}

// Shared by ServerList, SkillList, and PluginList — all three were the same
// card grid (title, id, description, approval badges, "View Details") with
// only the artifact word swapped. renderBadge/renderExtra are the two real
// differences: ServerList adds a verification badge next to the title,
// PluginList adds a contained-skills/servers summary line before the
// approval badges.
export function ArtifactList<T extends Artifact>({
  items,
  getId,
  getOrg,
  onSelect,
  emptyLabel,
  approvedTitle,
  renderBadge,
  renderExtra,
}: {
  items: T[];
  getId: (item: T) => string;
  getOrg: (id: string) => Organization | undefined;
  onSelect: (id: string) => void;
  emptyLabel: string;
  approvedTitle: (org: Organization) => string;
  renderBadge?: (item: T) => ReactNode;
  renderExtra?: (item: T) => ReactNode;
}) {
  if (items.length === 0) {
    return (
      <div className="py-12 text-center text-muted-foreground border border-dashed border-border rounded-xl">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {items.map((item) => {
        const id = getId(item);
        return (
          <div
            key={id}
            className="group bg-card border border-border rounded-xl p-5 hover:border-primary/50 transition-all shadow-sm flex flex-col cursor-pointer"
            onClick={() => onSelect(id)}
          >
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <h3 className="text-base font-semibold text-foreground">
                  {item.name}
                </h3>
                {renderBadge?.(item)}
              </div>
              <div className="font-mono text-xs text-muted-foreground mb-3">
                {id}
              </div>
              <p
                className={`text-sm text-foreground line-clamp-3 break-words ${
                  renderExtra ? "mb-2" : "mb-4"
                }`}
              >
                {item.description}
              </p>
              {renderExtra?.(item)}
              <div className="flex gap-2 mb-4 flex-wrap">
                {item.approvals.map((a) => {
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
              </div>
            </div>
            <button className="w-full py-2 text-sm font-medium border border-border rounded-lg hover:bg-muted/50 transition-colors mt-auto text-foreground">
              View Details
            </button>
          </div>
        );
      })}
    </div>
  );
}
