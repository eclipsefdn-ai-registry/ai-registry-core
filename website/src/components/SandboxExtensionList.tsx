import type { SandboxExtension, Organization } from "../types";
import { ArtifactList } from "./ArtifactList";

export function SandboxExtensionList({
  extensions,
  emptyLabel,
  getOrg,
  onSelect,
}: {
  extensions: SandboxExtension[];
  emptyLabel: string;
  getOrg: (id: string) => Organization | undefined;
  onSelect: (id: string) => void;
}) {
  return (
    <ArtifactList
      items={extensions}
      getId={(extension) => extension.sandboxExtensionId}
      getOrg={getOrg}
      onSelect={onSelect}
      emptyLabel={emptyLabel}
      approvedTitle={(org) => `Approved by ${org.name}`}
      renderBadge={(extension) =>
        extension.source.ref ? (
          <span
            className="text-xs px-2 py-0.5 rounded-full border border-border bg-muted/30 text-muted-foreground"
            title={`Approved at ${extension.source.ref} rather than the default branch`}
          >
            {extension.source.ref}
          </span>
        ) : null
      }
    />
  );
}
