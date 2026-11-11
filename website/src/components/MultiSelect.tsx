import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";

export interface MultiSelectOption {
  value: string;
  label: string;
}

/**
 * A dropdown that picks any number of options, for the search filters. The
 * options sit in a scrolling list behind a search box rather than all laid
 * out at once, so it holds up with hundreds of them, not just a handful.
 *
 * The button shows the picked options by name, or `placeholder` when none
 * are. Opening it focuses the search box, where the arrow keys move through
 * the matching options and Enter toggles one; a click toggles one too. The
 * list stays open between picks, since picking several is the point, and
 * closes on Escape, the button, or a click or Tab out of it.
 *
 * Escape stops here instead of reaching the filter panel around it, so the
 * first press closes only the list.
 */
export function MultiSelect({
  labelId,
  options,
  selected,
  onChange,
  placeholder,
  searchLabel,
}: {
  labelId: string;
  options: readonly MultiSelectOption[];
  selected: readonly string[];
  onChange: (selected: readonly string[]) => void;
  placeholder: string;
  searchLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const valueId = useId();
  const listboxId = useId();

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const q = query.trim().toLowerCase();
  const matches = options.filter((o) => o.label.toLowerCase().includes(q));
  const selectedLabels = options
    .filter((o) => selected.includes(o.value))
    .map((o) => o.label);
  const summary =
    selectedLabels.length > 0 ? selectedLabels.join(", ") : placeholder;
  const optionId = (index: number) => `${listboxId}-${index}`;

  function openList() {
    setQuery("");
    setActiveIndex(0);
    setOpen(true);
  }

  function closeList() {
    setOpen(false);
    buttonRef.current?.focus();
  }

  function toggle(value: string) {
    onChange(
      selected.includes(value)
        ? selected.filter((v) => v !== value)
        : [...selected, value],
    );
  }

  function onSearchKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (matches.length === 0) return;
      const step = e.key === "ArrowDown" ? 1 : -1;
      const next = (activeIndex + step + matches.length) % matches.length;
      setActiveIndex(next);
      document
        .getElementById(optionId(next))
        ?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") {
      e.preventDefault();
      const option = matches[activeIndex];
      if (option) toggle(option.value);
    } else if (e.key === "Escape") {
      e.stopPropagation();
      closeList();
    }
  }

  return (
    <div
      ref={rootRef}
      className="relative"
      onBlur={(e) => {
        // Tab moving focus out closes the list. A click outside is the
        // pointerdown listener's job: it leaves no element to check here.
        const next = e.relatedTarget;
        if (next && !rootRef.current?.contains(next)) setOpen(false);
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={`${labelId} ${valueId}`}
        onClick={() => (open ? setOpen(false) : openList())}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown" && !open) {
            e.preventDefault();
            openList();
          }
        }}
        className="w-full h-10 flex items-center gap-2 px-3 text-sm text-left bg-background border border-border rounded-lg hover:border-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-ring/50 transition-colors"
      >
        <span
          id={valueId}
          title={summary}
          className={`flex-1 truncate ${
            selectedLabels.length > 0 ? "" : "text-muted-foreground"
          }`}
        >
          {summary}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
            open ? "rotate-180" : ""
          }`}
        />
      </button>

      {open && (
        <div className="absolute top-full inset-x-0 mt-1 z-10 bg-card border border-border rounded-lg shadow-xl overflow-hidden">
          <div className="relative border-b border-border">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input
              type="text"
              role="combobox"
              autoFocus
              aria-label={searchLabel}
              aria-expanded
              aria-controls={listboxId}
              aria-autocomplete="list"
              aria-activedescendant={
                matches[activeIndex] ? optionId(activeIndex) : undefined
              }
              placeholder={`${searchLabel}...`}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActiveIndex(0);
              }}
              onKeyDown={onSearchKeyDown}
              className="w-full h-10 pl-9 pr-3 text-sm bg-transparent focus:outline-none placeholder:text-muted-foreground"
            />
          </div>
          <ul
            id={listboxId}
            role="listbox"
            aria-multiselectable
            aria-labelledby={labelId}
            // Focus stays in the search box, which points at the active
            // option. Without this, Chrome would let Tab stop on the list
            // itself, since it scrolls.
            tabIndex={-1}
            className="max-h-64 overflow-y-auto py-1"
          >
            {matches.map((o, i) => {
              const isSelected = selected.includes(o.value);
              return (
                <li
                  key={o.value}
                  id={optionId(i)}
                  role="option"
                  aria-selected={isSelected}
                  // Keeps focus in the search box, so the keys keep working
                  // after a click.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => toggle(o.value)}
                  onMouseMove={() => setActiveIndex(i)}
                  className={`flex items-center gap-2 px-3 py-2 text-sm cursor-pointer ${
                    i === activeIndex ? "bg-muted" : ""
                  }`}
                >
                  <span
                    className={`h-4 w-4 shrink-0 flex items-center justify-center rounded border ${
                      isSelected
                        ? "bg-primary border-primary text-primary-foreground"
                        : "border-muted-foreground"
                    }`}
                  >
                    {isSelected && (
                      <Check className="h-3 w-3" strokeWidth={3} />
                    )}
                  </span>
                  {o.label}
                </li>
              );
            })}
          </ul>
          {matches.length === 0 && (
            <p className="px-3 py-2 text-sm text-muted-foreground">
              No matches.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
