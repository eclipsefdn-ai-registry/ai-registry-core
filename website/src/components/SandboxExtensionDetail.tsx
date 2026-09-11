import { ArrowLeft } from "lucide-react";
import type {
  SandboxExtension,
  SandboxExtensionApproval,
  Organization,
} from "../types";
import { sanitizeUrl } from "../sanitize";
import { orgBadge } from "../orgBadge";
import { enclaveCommand } from "../enclaveCommand";
import { InstallFromCli } from "./InstallFromCli";

// Two vocabularies name the same thing: the spec says kind, Enclave's CLI and
// docs say tools and features. Spell the mapping out once, in the metadata row
// alongside the ref and hash, so a reader arriving from either side can follow
// the install command below.
const KIND_LABEL: Record<SandboxExtension["kind"], string> = {
  sandbox: "tool extension (kind: sandbox)",
  mixin: "feature extension (kind: mixin)",
};

export function SandboxExtensionDetail({
  extension,
  getOrg,
  onBack,
}: {
  extension: SandboxExtension;
  getOrg: (id: string) => Organization | undefined;
  onBack: () => void;
}) {
  const sourceRef = extension.source.ref ?? "HEAD";
  const sourceUrl = `${extension.source.url.replace(/\.git$/, "")}/tree/${sourceRef}/${extension.source.path}`;
  const installCommand = enclaveCommand(extension);

  return (
    <div className="bg-card border border-primary/50 rounded-xl p-6 shadow-md">
      <button
        className="inline-flex items-center gap-1 text-sm text-primary hover:underline mb-4"
        onClick={onBack}
      >
        <ArrowLeft className="h-4 w-4" />
        Back to list
      </button>
      <h2 className="text-xl font-bold mb-1">{extension.name}</h2>
      <p className="text-muted-foreground mb-4">{extension.description}</p>
      <div className="flex gap-3 mb-6 flex-wrap items-center text-sm">
        <span className="text-muted-foreground font-mono text-xs">
          {extension.sandboxExtensionId}
        </span>
        <span className="text-muted-foreground text-xs">
          Sandbox {KIND_LABEL[extension.kind]}
        </span>
        {/* Printed verbatim rather than badged as "pinned": a branch, a tag and
            a commit are three different promises, and one badge covering all
            three would read as stronger than a branch actually is. */}
        <span className="text-muted-foreground text-xs">
          Ref: {extension.source.ref ?? "default branch"}
        </span>
        <span className="text-muted-foreground text-xs">
          Hash: {extension.contentHash}
        </span>
        {sanitizeUrl(sourceUrl) && (
          <a
            href={sanitizeUrl(sourceUrl)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline text-sm"
          >
            Source
          </a>
        )}
      </div>

      <div>
        <h3 className="text-base font-semibold mb-3">
          Approvals ({extension.approvals.length})
        </h3>
        {extension.approvals.map((approval, i) => (
          <SandboxExtensionApprovalCard
            key={i}
            approval={approval}
            org={getOrg(approval.organizationId)}
          />
        ))}
      </div>

      {installCommand && (
        <InstallFromCli
          label="Install in Enclave"
          command={installCommand}
          note={
            extension.source.ref
              ? undefined
              : "Without --ref, Enclave follows the repository's default branch, and later updates follow it too."
          }
        />
      )}
    </div>
  );
}

// Its own card rather than the shared ApprovalCard: with no installConfigs
// there is no tool section to render, so the shared component's whole body
// would be dead weight here.
function SandboxExtensionApprovalCard({
  approval,
  org,
}: {
  approval: SandboxExtensionApproval;
  org: Organization | undefined;
}) {
  const badge = orgBadge(org, {
    fallbackId: approval.organizationId,
    approvedTitle: org
      ? `Approved by ${org.name}`
      : "Approved by this organization",
  });
  return (
    <div className="bg-background border border-border rounded-lg p-4 mb-3">
      <div className="flex items-center gap-2 text-sm flex-wrap">
        <span
          className={`inline-flex text-xs px-2 py-0.5 rounded-full border bg-primary/10 text-primary border-primary/20 cursor-help ${
            badge.inferred ? "border-dashed" : ""
          }`}
          title={badge.title}
        >
          {badge.text}
        </span>
        <span className="text-muted-foreground">Approved: {approval.date}</span>
      </div>
    </div>
  );
}
