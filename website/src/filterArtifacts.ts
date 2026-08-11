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
