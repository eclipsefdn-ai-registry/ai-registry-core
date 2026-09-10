import type { SandboxExtension } from "./types";

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
  const match = /^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/.exec(
    extension.source.url,
  );
  if (!match) return undefined;

  // The verb carries the kind — `enclave tools add` looks only for
  // kind: sandbox, `enclave features add` only for kind: mixin.
  const verb = extension.kind === "sandbox" ? "tools" : "features";
  // --name matches the spec's own name, which consolidation publishes as
  // extensionName. It is also the extension's directory name, since an
  // extension whose spec name disagrees with its directory is never published.
  const ref = extension.source.ref ? ` --ref ${extension.source.ref}` : "";

  return `enclave ${verb} add ${match[1]}/${match[2]} --name ${extension.extensionName}${ref}`;
}
