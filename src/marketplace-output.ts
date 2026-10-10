import type { PluginEntry } from "./consolidate.js";

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

export interface MarketplaceEntryApproval {
  organizationId: string;
  date: string;
  viaTrust?: string;
  sourcedFrom?: { marketplaceUrl: string; format: string };
}

export interface MarketplaceEntryMetadata {
  pluginId: string;
  registryUrl: string;
  contentHash?: string;
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

export interface BuildMarketplaceOptions {
  // Absent builds the aggregate of every approved plugin. Present filters to
  // one organization's approvals, which is the form an enterprise subscribes
  // to: trust here is per organization, and a merged catalog would flatten it.
  orgId?: string;
  orgName?: string;
}

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

function assertIdentifier(value: string, what: string): string {
  if (!IDENTIFIER_RE.test(value) || value.includes("..")) {
    throw new Error(
      `${what} "${value}" is not a valid marketplace identifier: letters, digits, ".", "_" and "-" only, starting with a letter or digit, and no ".."`,
    );
  }
  return value;
}

/**
 * The entry name users type as `<name>@<marketplace>`, derived from the plugin
 * id by replacing its "/" separator.
 *
 * It is the plugin id rather than the plugin's own name because consolidation
 * is a stateless rebuild: it cannot emit the `renames` map that would repair
 * installs if a name ever moved. A name derived from the id can't move when
 * another plugin is approved. The plugin's own name goes to `displayName`,
 * which is what the UI shows.
 */
export function marketplaceEntryName(pluginId: string): string {
  return assertIdentifier(pluginId.replace(/\//g, "."), "Plugin entry name");
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

function entryApprovals(
  plugin: PluginEntry,
  orgId: string | undefined,
): MarketplaceEntryApproval[] {
  return plugin.approvals
    .filter((a) => !orgId || a.organizationId === orgId)
    .map(({ organizationId, date, viaTrust, sourcedFrom }) => {
      const approval: MarketplaceEntryApproval = { organizationId, date };
      if (viaTrust) approval.viaTrust = viaTrust;
      if (sourcedFrom) approval.sourcedFrom = sourcedFrom;
      return approval;
    });
}

function buildEntry(
  plugin: PluginEntry,
  orgId: string | undefined,
): MarketplaceEntry {
  const metadata: MarketplaceEntryMetadata = {
    pluginId: plugin.pluginId,
    registryUrl: `${SITE_URL}?plugin=${encodeURIComponent(plugin.pluginId)}`,
    ...(plugin.contentHash ? { contentHash: plugin.contentHash } : {}),
    approvals: entryApprovals(plugin, orgId),
  };

  const entry: MarketplaceEntry = {
    name: marketplaceEntryName(plugin.pluginId),
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
  options: BuildMarketplaceOptions = {},
): MarketplaceFile {
  const { orgId, orgName } = options;

  const name = assertIdentifier(
    orgId ? `ai-registry-${orgId}` : "ai-registry",
    "Marketplace name",
  );

  const entries = plugins
    .filter(
      (p) => !orgId || p.approvals.some((a) => a.organizationId === orgId),
    )
    .map((p) => buildEntry(p, orgId))
    // Sorted by code unit rather than locale, so two runs on different machines
    // produce the same file.
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  // Two plugin ids can in principle derive one entry name ("a/b.c" and
  // "a.b/c"). Claude Code rejects a marketplace with a duplicate name, and a
  // silently dropped entry would be worse than a failed build.
  const seen = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.name)) {
      throw new Error(
        `Two plugin ids derive the same marketplace entry name "${entry.name}"`,
      );
    }
    seen.add(entry.name);
  }

  // forceRemoveDeletedPlugins is deliberately unset. Setting it would uninstall
  // a dropped plugin from users' machines, which is real revocation reach and
  // the most dangerous switch here: a consolidation bug that drops entries
  // would uninstall working plugins everywhere.
  return {
    $schema: SCHEMA_URL,
    name,
    description: orgId
      ? `Agent Plugins approved by ${orgName ?? orgId} in the Eclipse AI Registry.`
      : "Agent Plugins approved in the Eclipse AI Registry.",
    owner: OWNER,
    plugins: entries,
  };
}
