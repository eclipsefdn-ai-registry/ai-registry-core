import { useEffect, useId, useRef, useState } from "react";
import { CircleQuestionMark } from "lucide-react";

/**
 * A `?` button that opens a short explanation beside a label.
 *
 * Opens on click rather than hover, so it works on a touch screen and from the
 * keyboard. A click outside or Escape closes it, the way `BrowserSearch`
 * closes its panel, and Escape hands focus back to the button.
 */
export function HelpPopover({
  label,
  children,
}: {
  // Names the button for screen readers, since it shows only an icon.
  label: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLSpanElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <span ref={rootRef} className="relative inline-flex">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={label}
        title={label}
        className={`inline-flex items-center rounded-full transition-colors ${
          open ? "text-primary" : "text-muted-foreground hover:text-primary"
        }`}
      >
        <CircleQuestionMark className="h-4 w-4" />
      </button>
      <div
        id={panelId}
        role="dialog"
        aria-label={label}
        hidden={!open}
        className="absolute left-0 top-full mt-2 z-20 w-72 max-w-[calc(100vw-3rem)] p-3 text-xs font-normal leading-relaxed text-card-foreground bg-card border border-border rounded-lg shadow-xl"
      >
        {children}
      </div>
    </span>
  );
}
