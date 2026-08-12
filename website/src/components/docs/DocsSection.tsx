import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { findSectionLabel } from "./docsNav";

/**
 * A docs `h2` whose title comes from {@link DOCS_NAV}, so the sidebar entry and
 * the heading it scrolls to can never disagree. Falls back to the raw id if the
 * section is missing from the nav, which makes the omission visible on the page.
 */
export function DocsSection({
  id,
  children,
}: {
  id: string;
  children: ReactNode;
}) {
  const { pathname } = useLocation();
  const label = findSectionLabel(pathname, id) ?? id;
  return (
    <section className="mb-8">
      <h2
        id={id}
        className="text-xl font-semibold mt-8 mb-3 scroll-mt-24 first:mt-0"
      >
        {label}
      </h2>
      {children}
    </section>
  );
}
