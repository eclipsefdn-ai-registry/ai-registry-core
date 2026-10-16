import type {
  Organization,
  PluginApproval,
  PluginEntry,
} from "./consolidate.js";

// Builds the marketplace files the registry publishes, as opposed to the vendor
// marketplace files it consumes (see marketplace-source.ts). A client adds one
// with `claude plugin marketplace add <url>` and installs approved plugins from
// it directly.
//
// The format is Claude Code's `.claude-plugin/marketplace.json`. There is no
// vendor-neutral one to target: the Agent Plugins specification scopes
// distribution and discovery out, and of the dialects that exist, only Claude
// Code's can be added from a plain HTTPS URL. Codex and Copilot read a
// marketplace out of a git repository, which a static API cannot be. Publishing
// their dialects means publishing a generated repository, which this does not
// do.
//
// This is the one place where a tool-specific rendering lives outside the
// website. installCommand.ts and enclaveCommand.ts produce a string for a human
// to copy; this produces a file that has to exist at a URL.

// --- Types ---

export interface MarketplaceEntrySource {
  // `git-subdir` checks out one directory of a repository, `url` the whole
  // repository. Both take ref and sha. Claude Code's own `url` *plugin* source
  // is a git repository — unrelated to the `url` *marketplace* source, which is
  // the hosted file these are written into.
  source: "git-subdir" | "url";
  url: string;
  path?: string;
  ref?: string;
  sha?: string;
}

// The approval as a client of the marketplace sees it: who approved, when, and
// how they arrived at it. configHash and installConfigs are left behind — the
// first is an update-detection device for registry clients, and the second has
// no meaning once the plugin is installed from here.
export type MarketplaceEntryApproval = Pick<
  PluginApproval,
  "organizationId" | "date" | "viaTrust" | "sourcedFrom"
>;

export interface MarketplaceEntryMetadata {
  pluginId: string;
  registryUrl: string;
  // Always present: enrichment drops a plugin whose directory it couldn't hash,
  // so an entry that reaches here has one.
  contentHash: string;
  approvals: MarketplaceEntryApproval[];
}

export interface MarketplaceEntry {
  name: string;
  displayName: string;
  description?: string;
  version?: string;
  author?: { name: string };
  homepage?: string;
  keywords?: string[];
  source: MarketplaceEntrySource;
  // Free-form and ignored by Claude Code at load time, which is what makes it
  // safe to carry the approval record into users' hands: it travels with the
  // plugin without affecting how it installs.
  metadata: MarketplaceEntryMetadata;
}

export interface MarketplaceFile {
  $schema: string;
  name: string;
  description: string;
  owner: { name: string; url: string };
  plugins: MarketplaceEntry[];
}

// Absent builds the aggregate of every approved plugin. Present filters to one
// organization's approvals, which is the form an enterprise subscribes to:
// trust here is per organization, and a merged catalog would flatten it.
export type MarketplaceOrg = Pick<Organization, "id" | "name">;

// --- Constants ---

const SCHEMA_URL = "https://anthropic.com/claude-code/marketplace.schema.json";

const SITE_URL = "https://ai.open-vsx.org/";

const OWNER = { name: "Eclipse Foundation", url: SITE_URL };

// Claude Code's rule for a marketplace name and a plugin entry name alike:
// letters, digits, ".", "_" and "-", starting with a letter or digit, and no
// "..". A name that breaks it can't be installed from, and the ".." part also
// keeps a derived name from reaching out of the directory it is written into.
const IDENTIFIER_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

// Claude Code accepts a full 40-character lowercase commit SHA and nothing
// shorter.
const FULL_SHA_RE = /^[0-9a-f]{40}$/;

// --- Field derivation ---

function isIdentifier(value: string): boolean {
  return IDENTIFIER_RE.test(value) && !value.includes("..");
}

/**
 * The entry name users type as `<name>@<marketplace>`, derived from the plugin
 * id by replacing its "/" separator, or undefined when the id can't produce a
 * usable one.
 *
 * It is the plugin id rather than the plugin's own name because consolidation
 * is a stateless rebuild: it cannot emit the `renames` map that would repair
 * installs if a name ever moved. A name derived from the id can't move when
 * another plugin is approved. The plugin's own name goes to `displayName`,
 * which is what the UI shows.
 *
 * The plugin id schema rejects an id that lands here unusable, but only for a
 * hand-authored approval: an id derived from a vendor's marketplace file
 * (marketplace-source.ts) never passes through schema validation, so this still
 * has to answer for one.
 */
export function marketplaceEntryName(pluginId: string): string | undefined {
  const name = pluginId.replace(/\//g, ".");
  return isIdentifier(name) ? name : undefined;
}

// Claude Code refuses to load a plugin whose homepage doesn't parse as a URL,
// so a malformed one from a vendor's plugin.json is dropped rather than passed
// on.
function httpUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const { protocol } = new URL(value);
    return protocol === "https:" || protocol === "http:" ? value : undefined;
  } catch {
    return undefined;
  }
}

function entrySource(source: PluginEntry["source"]): MarketplaceEntrySource {
  const entry: MarketplaceEntrySource = source.path
    ? { source: "git-subdir", url: source.url, path: source.path }
    : { source: "url", url: source.url };

  if (source.ref) entry.ref = source.ref;
  // The commit contentHash was computed at, so an install is what the registry
  // verified rather than whatever the branch holds now. Sent alongside ref
  // rather than instead of it: Claude Code checks out the sha, and keeping the
  // ref means the install still works once the branch or tag is deleted.
  if (source.commit && FULL_SHA_RE.test(source.commit)) {
    entry.sha = source.commit;
  }
  return entry;
}

// The approvals this file may show for a plugin: the ones belonging to its
// organization, minus any that approved a different revision.
//
// Several organizations approving one plugin share a single entry, and the
// first source collected wins it, so an approval that named a different
// revision is attached to a commit its organization never saw. Publishing it
// as data was already wrong; publishing it in that organization's marketplace
// would make it an instruction to install what they didn't approve. Their own
// revision can't take its place either — only the winning one was fetched and
// hashed.
function entryApprovals(
  plugin: PluginEntry,
  orgId: string | undefined,
  sourceMismatches: ReadonlySet<string>,
): MarketplaceEntryApproval[] {
  return plugin.approvals
    .filter((a) => !orgId || a.organizationId === orgId)
    .filter(
      (a) => !sourceMismatches.has(`${plugin.pluginId}::${a.organizationId}`),
    )
    .map(({ organizationId, date, viaTrust, sourcedFrom }) => {
      const approval: MarketplaceEntryApproval = { organizationId, date };
      if (viaTrust) approval.viaTrust = viaTrust;
      if (sourcedFrom) approval.sourcedFrom = sourcedFrom;
      return approval;
    });
}

function buildEntry(
  plugin: PluginEntry,
  name: string,
  approvals: MarketplaceEntryApproval[],
): MarketplaceEntry {
  const metadata: MarketplaceEntryMetadata = {
    pluginId: plugin.pluginId,
    registryUrl: `${SITE_URL}?plugin=${encodeURIComponent(plugin.pluginId)}`,
    contentHash: plugin.contentHash,
    approvals,
  };

  const entry: MarketplaceEntry = {
    name,
    displayName: plugin.name,
    source: entrySource(plugin.source),
    metadata,
  };

  if (plugin.description) entry.description = plugin.description;
  if (plugin.version) entry.version = plugin.version;
  // plugin.json's author is an object with a required name; ours is the string
  // consolidation flattened it to.
  if (plugin.author) entry.author = { name: plugin.author };
  const homepage = httpUrl(plugin.homepage);
  if (homepage) entry.homepage = homepage;
  if (plugin.keywords?.length) entry.keywords = plugin.keywords;

  return entry;
}

// --- Marketplace file ---

export function buildMarketplace(
  plugins: PluginEntry[],
  org?: MarketplaceOrg,
  sourceMismatches: ReadonlySet<string> = new Set(),
): MarketplaceFile {
  const orgId = org?.id;

  // Unchecked: the organization schema already restricts an id to
  // ^[a-z0-9-]+$, fatally, before consolidation runs, so this is always a
  // usable marketplace name. A plugin id carries no such pattern once it is
  // derived rather than authored, which is why the entry names below are
  // checked and this isn't.
  const name = orgId ? `ai-registry-${orgId}` : "ai-registry";

  // An entry that can't be published is left out with a warning rather than
  // throwing. Both causes are vendor-controlled — an id no schema constrains,
  // or two ids that collide — and this runs inside writeOutput, after most of
  // the API has been written, so throwing would abort the build and leave the
  // whole registry un-deployed over one bad approval. Matches how the
  // enrichment steps skip an entry they can't read.
  const entries: MarketplaceEntry[] = [];
  const takenBy = new Map<string, string>();

  // Iterated in pluginId order so the entry that wins a collision is the same
  // one on every run, whatever order the caller collected them in.
  for (const plugin of [...plugins].sort((a, b) =>
    a.pluginId < b.pluginId ? -1 : a.pluginId > b.pluginId ? 1 : 0,
  )) {
    // Also the organization filter: nothing left to show means either another
    // organization approved this plugin, or this one approved a different
    // revision of it.
    const approvals = entryApprovals(plugin, orgId, sourceMismatches);
    if (approvals.length === 0) continue;

    const entryName = marketplaceEntryName(plugin.pluginId);
    if (!entryName) {
      console.warn(
        `  WARNING: plugin "${plugin.pluginId}" has no usable marketplace entry name — left out of "${name}"`,
      );
      continue;
    }

    // Two plugin ids can derive one entry name ("a/b.c" and "a.b/c"), and
    // Claude Code rejects a marketplace that repeats one.
    const taken = takenBy.get(entryName);
    if (taken !== undefined) {
      console.warn(
        `  WARNING: plugin "${plugin.pluginId}" derives the same marketplace entry name as "${taken}" — left out of "${name}"`,
      );
      continue;
    }
    takenBy.set(entryName, plugin.pluginId);

    entries.push(buildEntry(plugin, entryName, approvals));
  }

  // Sorted by code unit rather than locale, so two runs on different machines
  // produce the same file.
  entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  // forceRemoveDeletedPlugins is deliberately unset. Setting it would uninstall
  // a dropped plugin from users' machines, which is real revocation reach and
  // the most dangerous switch here: a consolidation bug that drops entries
  // would uninstall working plugins everywhere.
  return {
    $schema: SCHEMA_URL,
    name,
    description: org
      ? `Agent Plugins approved by ${org.name} in the Eclipse AI Registry.`
      : "Agent Plugins approved in the Eclipse AI Registry.",
    owner: OWNER,
    plugins: entries,
  };
}
