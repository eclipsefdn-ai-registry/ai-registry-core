import type { SandboxExtension } from "./types";
import { cliSource } from "./cliSource";

// Enclave's `owner/repo` shorthand: exactly two segments, and no scheme or
// host left in it. cliSource strips the github.com prefix and normalizes the
// suffix, so anything still failing this is a host it can't address —
// a GitLab URL keeps its scheme, and a nested group keeps a third segment.
const OWNER_REPO = /^[^/:]+\/[^/:]+$/;

/**
 * Builds the `enclave` command that installs one sandbox extension.
 *
 * Like the skill and plugin install boxes, this exists only here: the
 * consolidated JSON carries no command, because a command is a convenience
 * derived from metadata the registry happens to hold rather than something a
 * vendor approved.
 *
 * Returns undefined when no correct command can be built. Enclave's
 * `owner/repo` shorthand assumes `https://github.com` and is exactly two
 * segments, so a GitLab or self-hosted source has no shorthand form — and
 * printing one anyway would name a GitHub repository that may not exist.
 */
export function enclaveCommand(
  extension: SandboxExtension,
): string | undefined {
  // Reuses the same normalization the skills and plugins install boxes use, so
  // a fix there — an SSH form, a new .git edge case — reaches this too.
  const shorthand = cliSource(extension.source.url);
  if (!OWNER_REPO.test(shorthand)) return undefined;

  // The verb carries the kind — `enclave tools add` looks only for
  // kind: sandbox, `enclave features add` only for kind: mixin.
  const verb = extension.kind === "sandbox" ? "tools" : "features";
  // --name matches the spec's own name, which consolidation publishes as
  // extensionName. It is also the extension's directory name, since an
  // extension whose spec name disagrees with its directory is never published.
  const ref = extension.source.ref ? ` --ref ${extension.source.ref}` : "";

  return `enclave ${verb} add ${shorthand} --name ${extension.extensionName}${ref}`;
}
