import {
  TAB_GROUPS,
  type BrowserTab,
  type BrowserTabMeta,
} from "../browserTabs";

/**
 * The registry browser's navigation: one row of tabs, divided into labelled
 * groups by a vertical rule between them.
 *
 * A two-level nav (pick a group, then a tab) would cost a click to reach
 * anything and add a "which group was I in" state to restore. The tab isn't in
 * the URL, so neither shape affects the `?server=`/`?skill=` deep links.
 *
 * Eight tabs need roughly 1070px, so the row only holds together from `xl` up.
 * Below that each group becomes its own row — label, then its tabs — and the
 * dividers turn off, since a vertical rule between stacked rows would separate
 * nothing. Within a group the tabs wrap, so the narrowest screens break "MCP
 * Servers / Skills / Plugins / Agents" across two lines rather than clipping
 * it. That's why the group divider and the row direction switch together at
 * the same breakpoint.
 */
export function BrowserTabsRow({
  tabs,
  active,
  onSelect,
}: {
  tabs: Record<BrowserTab, BrowserTabMeta>;
  active: BrowserTab;
  onSelect: (tab: BrowserTab) => void;
}) {
  return (
    <div className="flex flex-col xl:flex-row xl:items-end gap-y-2 xl:gap-y-0 mb-8 border-b border-border overflow-x-auto">
      {TAB_GROUPS.map((group, groupIndex) => (
        <div
          key={group.label}
          className={`flex flex-col ${
            groupIndex > 0 ? "xl:ml-4 xl:pl-4 xl:border-l xl:border-border" : ""
          }`}
        >
          <span className="px-2 pb-1 text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground/70 whitespace-nowrap">
            {group.label}
          </span>
          <div className="flex items-end flex-wrap xl:flex-nowrap">
            {group.tabs.map((key) => (
              <button
                key={key}
                onClick={() => onSelect(key)}
                aria-current={active === key ? "page" : undefined}
                className={`h-11 px-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                  active === key
                    ? "border-primary text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {tabs[key].label} ({tabs[key].count})
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
