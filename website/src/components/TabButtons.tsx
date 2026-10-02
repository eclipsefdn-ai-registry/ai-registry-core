export interface TabButtonSpec<K extends string> {
  key: K;
  label: string;
  count: number;
}

/**
 * A row of tab buttons with their counts, wrapping rather than clipping.
 *
 * Shared by the home page browser (once per group, inside `BrowserTabsRow`)
 * and the per-organization page, so a row that outgrows its container behaves
 * the same on both — adding an artifact type adds a tab to each, and neither
 * has room to spare.
 *
 * `className` is where a caller turns wrapping off at a breakpoint where it
 * knows the row fits.
 */
export function TabButtons<K extends string>({
  tabs,
  active,
  onSelect,
  className = "",
}: {
  tabs: readonly TabButtonSpec<K>[];
  active: K;
  onSelect: (key: K) => void;
  className?: string;
}) {
  return (
    <div className={`flex items-end flex-wrap ${className}`}>
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onSelect(t.key)}
          aria-current={active === t.key ? "page" : undefined}
          className={`h-11 px-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
            active === t.key
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          {t.label} ({t.count})
        </button>
      ))}
    </div>
  );
}
