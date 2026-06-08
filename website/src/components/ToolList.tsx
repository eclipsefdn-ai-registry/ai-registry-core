import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import type { Tool, Organization } from "../types";
import { safeCssColor } from "../sanitize";

export function ToolList({
  tools,
  getOrg,
}: {
  tools: Tool[];
  getOrg: (id: string) => Organization | undefined;
}) {
  if (tools.length === 0) {
    return (
      <div className="py-12 text-center text-muted-foreground border border-dashed border-border rounded-xl">
        No tools found.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {tools.map((tool) => {
        const org = getOrg(tool.organizationId);
        return (
          <Link
            key={tool.id}
            to={`/tools/${tool.id}`}
            className="group bg-card border border-border rounded-xl p-5 hover:border-primary/50 transition-all shadow-sm flex flex-col no-underline"
          >
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                {org?.color && (
                  <span
                    className="w-3 h-3 rounded-full shrink-0"
                    style={{ backgroundColor: safeCssColor(org.color) }}
                  />
                )}
                <h3 className="text-base font-semibold text-foreground">
                  {tool.name}
                </h3>
              </div>
              {org && (
                <p className="text-sm text-muted-foreground mb-4">
                  by {org.name}
                </p>
              )}
            </div>
            <span className="inline-flex items-center text-sm font-medium text-primary mt-auto">
              View approved servers
              <ChevronRight className="h-4 w-4 ml-1" />
            </span>
          </Link>
        );
      })}
    </div>
  );
}
