/**
 * The link text at the foot of the organization and tool tiles. The count is
 * what the linked page lists, so the tile states it once, in the link, rather
 * than in a badge and again in the link. Kept out of the tile components so
 * both word it the same way and those files export only components.
 *
 * An inferred organization approved nothing itself, so its tile says listed,
 * matching "listed for" on its own page.
 */
export function approvedArtifactsLabel(
  count: number,
  { inferred = false }: { inferred?: boolean } = {},
): string {
  const verb = inferred ? "listed" : "approved";
  return `View ${count} ${verb} artifact${count === 1 ? "" : "s"}`;
}
