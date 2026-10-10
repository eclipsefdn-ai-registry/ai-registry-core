/**
 * Builds the `claude plugin marketplace add` command for a marketplace the
 * registry publishes: one organization's, or the aggregate when no organization
 * is given.
 *
 * Claude Code is the only client this command exists for. It is also the only
 * one that adds a marketplace from a plain HTTPS URL — Codex and Copilot read
 * one out of a git repository, which the static API isn't — so there is no
 * second command to render here. See src/marketplace-output.ts.
 *
 * Takes the origin rather than hardcoding one, so a preview deployment shows
 * its own URL instead of sending the reader to production.
 */
export function marketplaceCommand(origin: string, orgId?: string): string {
  const path = orgId
    ? `api/v1/orgs/${encodeURIComponent(orgId)}/marketplace.json`
    : "api/v1/marketplace.json";
  return `claude plugin marketplace add ${origin.replace(/\/+$/, "")}/${path}`;
}
