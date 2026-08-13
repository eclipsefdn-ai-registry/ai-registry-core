export interface DocsSectionEntry {
  id: string;
  label: string;
}

export interface DocsPageEntry {
  path: string;
  label: string;
  sections: DocsSectionEntry[];
}

/**
 * Single source of truth for the docs sidebar and for the `h2` headings on the
 * docs pages — `DocsSection` looks its own title up here by route and id, so a
 * section renamed in this list is renamed on the page too.
 */
export const DOCS_NAV: DocsPageEntry[] = [
  {
    path: "/docs/api",
    label: "API",
    sections: [
      { id: "endpoints", label: "Endpoints" },
      { id: "response-shapes", label: "Response shapes" },
      { id: "schemas", label: "Schemas" },
      { id: "stability", label: "Stability" },
    ],
  },
  {
    path: "/docs/clients",
    label: "Clients",
    sections: [
      { id: "what-it-vouches-for", label: "What the registry vouches for" },
      { id: "the-data", label: "The data" },
      { id: "core", label: "Core" },
      { id: "mcp-servers", label: "MCP servers" },
      { id: "agent-skills", label: "Agent Skills" },
      { id: "agent-plugins", label: "Agent Plugins" },
      { id: "a2a-agents", label: "A2A Agents" },
      { id: "disappearing-entries", label: "Disappearing entries" },
      { id: "staying-current", label: "Staying current" },
      { id: "detecting-tampering", label: "Detecting tampering" },
      { id: "content-hash", label: "Content hash" },
      { id: "deep-links", label: "Deep links" },
      { id: "yours-to-decide", label: "Yours to decide" },
      { id: "checklist", label: "Checklist" },
    ],
  },
];

export function findSectionLabel(
  pathname: string,
  id: string,
): string | undefined {
  return DOCS_NAV.find((page) => page.path === pathname)?.sections.find(
    (section) => section.id === id,
  )?.label;
}
