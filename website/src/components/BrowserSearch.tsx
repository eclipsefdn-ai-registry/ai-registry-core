import { useEffect, useId, useRef, useState } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import type { Organization } from "../types";
import { MultiSelect } from "./MultiSelect";

/**
 * The home page's search box, with its filters behind an icon at the box's
 * right end, the way Gmail keeps its search options. The icon opens a panel
 * under the box with one labelled row per filter. Organizations is the only
 * row so far; another filter becomes another row rather than another control
 * beside the box.
 *
 * Organizations are a multi-select dropdown, which stays compact however many
 * organizations join, and with several picked the browser lists what any of
 * them approved. The panel applies each change as it's made, so it has no
 * submit button, only Clear and Done.
 *
 * With the panel closed, nothing in the box says the lists are narrowed, so
 * the selected organizations are repeated as chips under the box, each with
 * its own remove button.
 */
export function BrowserSearch({
  search,
  onSearchChange,
  placeholder,
  organizations,
  selectedOrgIds,
  onSelectedOrgIdsChange,
}: {
  search: string;
  onSearchChange: (search: string) => void;
  placeholder: string;
  organizations: Organization[];
  selectedOrgIds: readonly string[];
  onSelectedOrgIdsChange: (orgIds: readonly string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const orgLabelId = useId();

  // A click outside or Escape closes the panel, as it would a menu. Escape
  // returns focus to the icon, since the focused element may be in the panel
  // that just disappeared.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      setOpen(false);
      toggleRef.current?.focus();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const sortedOrgs = [...organizations].sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  const orgOptions = sortedOrgs.map((o) => ({ value: o.id, label: o.name }));
  const selectedOrgs = sortedOrgs.filter((o) => selectedOrgIds.includes(o.id));
  const activeCount = selectedOrgIds.length;

  const toggleOrg = (orgId: string) =>
    onSelectedOrgIdsChange(
      selectedOrgIds.includes(orgId)
        ? selectedOrgIds.filter((id) => id !== orgId)
        : [...selectedOrgIds, orgId],
    );

  return (
    <div ref={rootRef} className="w-full max-w-3xl mb-3">
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
        <input
          type="search"
          placeholder={placeholder}
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full pl-12 pr-14 h-14 text-base bg-card border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-ring/50 placeholder:text-muted-foreground"
        />
        <button
          ref={toggleRef}
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={
            activeCount > 0 ? `Filters (${activeCount} active)` : "Filters"
          }
          title="Filters"
          className={`absolute right-2 top-1/2 -translate-y-1/2 h-10 w-10 flex items-center justify-center rounded-lg transition-colors hover:bg-muted ${
            open || activeCount > 0
              ? "text-primary"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <SlidersHorizontal className="h-5 w-5" />
          {activeCount > 0 && (
            <span className="absolute top-0.5 right-0.5 min-w-4 h-4 px-1 rounded-full bg-primary text-primary-foreground text-[0.65rem] font-semibold leading-4">
              {activeCount}
            </span>
          )}
        </button>

        <div
          id={panelId}
          role="dialog"
          aria-label="Search filters"
          hidden={!open}
          className="absolute top-full inset-x-0 mt-2 z-20 p-5 text-left bg-card border border-border rounded-xl shadow-xl"
        >
          <div className="grid grid-cols-1 sm:grid-cols-[8rem_1fr] sm:items-center gap-x-4 gap-y-2">
            <span
              id={orgLabelId}
              className="text-sm font-medium text-muted-foreground"
            >
              Organizations
            </span>
            <MultiSelect
              labelId={orgLabelId}
              options={orgOptions}
              selected={selectedOrgIds}
              onChange={onSelectedOrgIdsChange}
              placeholder="All organizations"
              searchLabel="Search organizations"
            />
          </div>
          <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-border">
            <button
              type="button"
              onClick={() => onSelectedOrgIdsChange([])}
              disabled={activeCount === 0}
              className="px-3 py-1.5 text-sm font-medium rounded-lg text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:pointer-events-none transition-colors"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                toggleRef.current?.focus();
              }}
              className="px-3 py-1.5 text-sm font-medium rounded-lg border border-primary/20 bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
            >
              Done
            </button>
          </div>
        </div>
      </div>

      {selectedOrgs.length > 0 && (
        <ul
          aria-label="Active filters"
          className="flex flex-wrap justify-center gap-2 mt-3"
        >
          {selectedOrgs.map((o) => (
            <li
              key={o.id}
              className="inline-flex items-center gap-1 pl-3 pr-1 py-1 text-xs font-medium rounded-full border border-primary/20 bg-primary/10 text-primary"
            >
              {o.name}
              <button
                type="button"
                onClick={() => toggleOrg(o.id)}
                aria-label={`Remove organization filter: ${o.name}`}
                className="p-0.5 rounded-full hover:bg-primary/20 transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
