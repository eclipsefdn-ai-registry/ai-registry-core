export type BrowserTab =
  | "servers"
  | "skills"
  | "plugins"
  | "agents"
  | "sandbox-tools"
  | "sandbox-features"
  | "tools"
  | "organizations";

export interface BrowserTabMeta {
  label: string;
  count: number;
}

/**
 * Single source of truth for the registry browser's navigation: which entries
 * exist, and which group each belongs to. Kept out of `BrowserTabsRow.tsx` so
 * that file exports only its component, which is what the react-refresh rule wants
 * — the same split `docsNav.ts` makes for the docs sidebar.
 */
export const TAB_GROUPS: { label: string; tabs: BrowserTab[] }[] = [
  {
    label: "AI Artifacts",
    tabs: ["servers", "skills", "plugins", "agents"],
  },
  { label: "Sandbox Artifacts", tabs: ["sandbox-tools", "sandbox-features"] },
  { label: "Participants", tabs: ["tools", "organizations"] },
];
