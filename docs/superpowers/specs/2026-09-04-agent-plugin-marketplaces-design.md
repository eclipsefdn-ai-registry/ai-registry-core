# Agent Plugin marketplace sources — fan a vendor's marketplace file into many plugin approvals

## Problem

Today, one `plugins/*.json` approval file covers exactly one plugin — `pluginId` + a git
`source.url`/`source.path` pointing at a single directory containing `plugin.json`. This mirrors
skill approvals' single-path form, but plugins have no equivalent of the skill glob
(`"skills/*"`) that lets one approval expand into many entries and pick up new ones
automatically on the next consolidation.

Meanwhile, some vendors already publish their own curated index of plugins as a
**marketplace file** — a client-proprietary discovery format (OpenAI Codex/ChatGPT's
`.agents/plugins/marketplace.json` is the one we have confirmed evidence of) that lists plugin
entries by name with a resolvable source, purely so that client's UI can show them together under
one storefront. Google publishes exactly this at `google/skills`' `.agents/plugins/marketplace.json`
— 17 entries, all independently verified as genuine agent-plugins.org-conformant plugins
(`$schema: https://agent-plugins.org/schemas/1.0.0/plugin.schema.json`), spanning three different
GitHub orgs (`gemini-cli-extensions`, `GoogleCloudPlatform`, and `google/skills` itself).

Approving each of those 17 by hand, one `plugins/*.json` file at a time, works but throws away
the fact that Google already did the curation work and already keeps this list current. We want
to let a vendor repo point at a marketplace file they publish and have every entry in it become a
registry plugin approval, re-resolved on every consolidation run — the same value proposition as
skill globs, for a different underlying discovery mechanism.

## Non-goals

- **Not adopting Codex's spec as the registry's own.** The vendor-neutral standard this registry
  cares about remains `plugin.json`/agent-plugins.org. A marketplace file is only ever a
  discovery index of _pointers_ to that standard — every resolved entry still needs its own
  genuine `plugin.json` fetched and enriched exactly as today.
- **Not crawling a bare repo for artifacts with no index file.** A materially different,
  heuristic feature; not designed here.
- **Not supporting every marketplace format that exists.** Only the one we have real vendor
  evidence for (Codex's). The design leaves room to add others later without a breaking change,
  but no second parser ships as part of this work.
- **Not filtering which entries from a marketplace get included.** All-or-nothing: a vendor
  either trusts the whole marketplace file or approves individual plugins by hand instead.
- **Not validating `plugin.json`'s `$schema` conformance.** A real, related gap — tracked
  separately in `FEATURE_REQUEST_plugin_schema_validation.md` — but intentionally out of scope
  here so this spec stays focused on the discovery mechanism, not manifest validation.
- **Not adding git ref/tag pinning to skill approvals.** Skills have the same "always clone HEAD"
  limitation, but it's already tracked in
  [issue #82](https://github.com/eclipsefdn-ai-registry/ai-registry-core/issues/82). This spec
  only adds `ref` support to plugins, where it's directly motivated by marketplace entries
  pinning one.

## Why trust a vendor's marketplace listing at all

A vendor publishing and maintaining a marketplace file in their own repo, naming specific
external plugins by resolvable source, is an affirmative editorial act — the same
"vendor-published attribution table is gold" reasoning `create-inferred-vendor` already applies
to skill collections and README tables. It's materially different from incidental proximity
(e.g. two repos merely sharing a GitHub org): the vendor chose to list that entry, by name, in a
file they curate. The one thing that would undercut this is a marketplace file that documents
itself as open-submission/unreviewed (the way `github/awesome-copilot` is a community
marketplace) — that reads as an aggregator, not an endorsement, and shouldn't be approved this
way. This is a judgment call at approval-authoring time, not something the schema enforces.

## Design

### 1. New approval type: `marketplaces/*.json`

A new, independent directory and schema (`marketplace-approval.schema.json`), decoupled from
`pluginId` entirely — deliberately not nested inside the plugin schema, so that if some future
marketplace format ever lists skills too, the same approval mechanism can fan out `SkillEntry`s
without redesigning the approval type. The artifact-type coupling lives in the per-format parser,
not in the approval shape.

```json
{
  "date": "2026-09-04",
  "source": {
    "url": "https://github.com/google/skills.git",
    "format": "codex"
  }
}
```

- **`date`** (required) — ISO date, same as every other approval type.
- **`source.url`** (required) — git repo URL hosting the marketplace file.
- **`source.format`** (required, enum) — which parser to use. Only `"codex"` is valid today. An
  explicit field rather than path-based auto-detection: an approval file is a trust statement,
  and guessing invites ambiguity if a repo ever hosts more than one marketplace format at once.
- **`source.path`** (optional) — override for a non-standard marketplace file location. Defaults
  to the format's conventional path (`.agents/plugins/marketplace.json` for `"codex"`).

No `pluginId`, no `installConfigs`. ID derivation is fully automatic (§2); a uniform
`installConfigs` block copied across N unrelated plugins doesn't fit the same way it does for
skill globs (plugins often need per-entry config, e.g. a Docker image/tag) — a vendor needing a
custom install config for one specific marketplace-derived plugin should approve that one
individually instead.

### 2. Resolving Codex-format entries and deriving IDs

`.agents/plugins/marketplace.json`'s `plugins[]` array entries resolve to a concrete
`{url, path?, ref?}` per this table:

| Codex `source.source`             | Resolves to                                                                                    |
| --------------------------------- | ---------------------------------------------------------------------------------------------- |
| `"local"` (or a bare string path) | `{url: <marketplace repo's own url>, path: <relative path>}`                                   |
| `"url"`                           | `{url, path: undefined, ref}`                                                                  |
| `"git-subdir"`                    | `{url, path, ref}`                                                                             |
| `"npm"`                           | **Unsupported** — skip with a warning (no package-registry fetch mechanism exists for plugins) |

`pluginId` for each resolved entry is derived **the same way `create-plugin-approval` derives it
by hand today**: reverse-domain of the actual resolved repo's owner/name, never the marketplace
entry's own display `name`. Example: Google's marketplace names one entry `"bigquery"`, but it
resolves to `gemini-cli-extensions/bigquery-data-analytics`, so the derived ID is
`io.github.gemini-cli-extensions/bigquery-data-analytics` — identical to the ID a human would
produce by hand, and identical to the already-approved hand-written entry for the same plugin (no
duplicate/conflicting ID for something approved both ways). For `"local"` entries, the owner is
the marketplace repo's own owner (e.g. `io.github.google/google-cloud-developer`).

### 3. `source.ref` — general, optional git ref pinning for plugins

Every Codex marketplace entry we've seen pins a `ref` (or `sha`) — e.g. `alloydb` pins
`"ref": "0.2.0"`. Today's plugin fetch (`clonePluginRepo` in `plugin-source.ts`) always shallow-
clones the default branch HEAD, with no way to honor that. Ignoring the pin would mean enriching
from a different (possibly newer, possibly breaking) revision than the one the vendor's
marketplace actually vouches for.

Add `source.ref` as a new, general, **optional** field on `plugin-approval.schema.json` — a git
ref (tag, branch, or commit sha) to check out instead of HEAD. `clonePluginRepo` gains a
`--branch <ref>` clone (or fetch+checkout for a sha). This is available to hand-authored
`plugins/*.json` approvals too, not just marketplace fan-out — but for marketplace-derived
entries specifically, it's always populated automatically from the Codex entry's `ref`/`sha`.

### 4. Provenance

A fanned-out `PluginApproval` gets a new optional field, `sourcedFrom: { marketplaceUrl, format }`,
recording which marketplace approval produced it. It lives on `PluginApproval`, not `PluginEntry`,
because a single plugin can be approved by one organization directly (hand-authored) and by
another organization via a marketplace — provenance is a property of one organization's approval,
not of the plugin entry as a whole. Hand-authored approvals omit it entirely (`undefined`,
consistent with how other optional plugin metadata already works). This is data-
model only for v1 — no website badge or special UI treatment is designed here — but it means
provenance isn't silently lost, and a future audit or website change can surface it without a
data migration.

### 5. Pipeline integration

- **New `marketplace-source.ts` module**, mirroring the shape of `skill-source.ts`/
  `plugin-source.ts`: parses a marketplace file per its declared `format`, resolves each entry per
  §2, and produces fanned-out `PluginEntry[]`. It does **not** duplicate manifest-fetching logic —
  every resolved entry is enriched via the existing, unchanged `fetchPluginManifest`.
- **`cli-validate.ts`** gains a phase that resolves a vendor's `marketplaces/*.json`, expands each
  into its constituent entries, and reports PASS/WARNING per fanned entry — mirroring the existing
  skill-glob validation output shape (one line per discovered path, warnings for anything
  unresolvable).
- **`consolidate.ts`** collects `marketplaces/*.json` alongside the existing four approval
  directories (`mcp/`, `skills/`, `plugins/`, `agents/`), expands each during the plugin
  enrichment phase, and merges the results into the same `plugins[]` output. A fanned entry is a
  normal `PluginEntry` in every other respect — same warn-skip-on-failure rules as any other
  plugin source, just carrying `sourcedFrom`.
- Any entry that fails to resolve for any reason (unsupported `npm` source, clone failure, missing
  `plugin.json`) is skipped with a warning; it never fails the whole marketplace expansion, same
  convention as unreachable skill/plugin/agent sources today.
- **`website/src/types.ts`** mirrors the new optional `sourcedFrom` field on `PluginApproval`, per
  this repo's existing "mirror but don't import" convention between `src/consolidate.ts` and the
  website types.

## Scope summary

**In scope:** `marketplaces/*.json` approval type (schema, validation, consolidation) for the
`"codex"` format only; general `source.ref` support on the plugin schema/fetch mechanism;
`sourcedFrom` provenance field on fanned-out plugin entries; website type mirroring for the new
field.

**Explicitly out of scope (see Non-goals):** other marketplace formats; include/exclude
filtering; `$schema` conformance validation (tracked separately); bare-repo crawling; skill ref
pinning (tracked separately, issue #82); any marketplace format listing non-plugin artifact
types; UI/badge treatment of provenance.
