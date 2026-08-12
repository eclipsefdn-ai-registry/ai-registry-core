import { NavLink, Outlet, useLocation } from "react-router-dom";
import { DOCS_NAV } from "./docsNav";

/**
 * Two-level docs shell: pages from {@link DOCS_NAV} in the sidebar, with the
 * active page's sections nested underneath. Section links are plain anchors so
 * the browser does the scrolling; only the page is marked active, since a
 * section highlight would need scroll tracking and one that lags or lands on
 * the wrong heading reads as a broken page.
 *
 * The sidebar sticks alongside the content from `md` up and stacks above it
 * below that; the site has no drawer pattern and one docs surface is not reason
 * enough to introduce one.
 */
export function DocsLayout() {
  const { pathname } = useLocation();

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 flex flex-col md:flex-row md:gap-10">
      <nav
        aria-label="Documentation"
        className="mb-8 md:mb-0 md:w-56 md:flex-shrink-0 md:sticky md:top-24 md:self-start"
      >
        <ul className="space-y-4 text-sm">
          {DOCS_NAV.map((page) => {
            const active = pathname === page.path;
            return (
              <li key={page.path}>
                <NavLink
                  to={page.path}
                  className={
                    active
                      ? "font-semibold text-foreground"
                      : "font-medium text-muted-foreground hover:text-foreground transition-colors"
                  }
                >
                  {page.label}
                </NavLink>
                {active && (
                  <ul className="mt-2 space-y-1 border-l border-border">
                    {page.sections.map((section) => (
                      <li key={section.id}>
                        <a
                          href={`#${section.id}`}
                          className="block pl-3 py-0.5 text-muted-foreground hover:text-foreground transition-colors"
                        >
                          {section.label}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="min-w-0 flex-1 max-w-3xl">
        <Outlet />
      </div>
    </div>
  );
}
