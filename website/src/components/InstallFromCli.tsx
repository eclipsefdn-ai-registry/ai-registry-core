import { useState } from "react";

/**
 * Copyable install command at the foot of a skill or plugin detail view.
 *
 * Deliberately quieter than the sections above it: a muted label rather than a
 * heading, because the approvals are what the registry asserts and this is a
 * convenience derived from metadata it happens to hold. The header row and copy
 * affordance mirror `CollapsibleJson` so both copy boxes on the site behave the
 * same.
 */
export function InstallFromCli({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(command).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-muted-foreground">
          Install from CLI
        </span>
        <button
          className="text-xs px-2 py-0.5 border border-border rounded hover:border-primary hover:text-primary transition-colors text-muted-foreground"
          onClick={handleCopy}
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <pre className="mt-2 bg-background border border-border p-3 rounded-md overflow-x-auto text-xs leading-relaxed">
        {command}
      </pre>
    </div>
  );
}
