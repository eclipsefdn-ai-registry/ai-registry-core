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

// Keeps the entries an organization approved, the same test
// buildOrgEntryView in src/consolidate.ts applies to write orgs/<id>.json, so
// filtering the home page by an organization shows what its page lists. An
// approval held via trust counts too: its organizationId is the trusting org.
// No orgId means no filter.
export function filterByOrg<
  T extends { approvals: { organizationId: string }[] },
>(items: T[], orgId: string | undefined): T[] {
  if (!orgId) return items;
  return items.filter((item) =>
    item.approvals.some((a) => a.organizationId === orgId),
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
