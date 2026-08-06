import { Info } from "lucide-react";
import type { ReactNode } from "react";

/**
 * Compact inline informational notice. Unlike a full-width banner, this is
 * meant to sit within page content and read as a low-key status note rather
 * than a warning.
 */
export function InfoCallout({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-card-foreground">
      <Info className="h-4 w-4 mt-0.5 flex-shrink-0 text-primary" />
      <p className="leading-relaxed">{children}</p>
    </div>
  );
}
