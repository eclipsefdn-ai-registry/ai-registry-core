export function filterByNameDescId<
  T extends { name: string; description: string },
>(items: T[], search: string, getId: (item: T) => string): T[] {
  const q = search.toLowerCase();
  return items
    .filter(
      (item) =>
        item.name.toLowerCase().includes(q) ||
        item.description.toLowerCase().includes(q) ||
        getId(item).toLowerCase().includes(q),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Whether an organization passes the organization filter. Selecting none
// means no filter, so then every organization does.
export function passesOrgFilter(
  orgIds: readonly string[],
  orgId: string,
): boolean {
  return orgIds.length === 0 || orgIds.includes(orgId);
}

// Keeps the entries any of the organizations approved, the same test
// buildOrgEntryView in src/consolidate.ts applies to write orgs/<id>.json, so
// filtering the home page by one organization shows what its page lists, and
// by several, what their pages list between them. An approval held via trust
// counts too: its organizationId is the trusting org. No orgIds means no
// filter.
export function filterByOrgs<
  T extends { approvals: { organizationId: string }[] },
>(items: T[], orgIds: readonly string[]): T[] {
  if (orgIds.length === 0) return items;
  return items.filter((item) =>
    item.approvals.some((a) => orgIds.includes(a.organizationId)),
  );
}

// Keeps the entries with an approval that installs into the tool, the same
// test buildToolEntryView in src/consolidate.ts applies to write
// tools/<id>.json. Sandbox extensions don't fit the type: their approvals
// have no installConfigs, so no tool's page lists them.
export function filterByTool<
  T extends { approvals: { installConfigs: { tool: string }[] }[] },
>(items: T[], toolId: string): T[] {
  return items.filter((item) =>
    item.approvals.some((a) =>
      a.installConfigs.some((ic) => ic.tool === toolId),
    ),
  );
}
