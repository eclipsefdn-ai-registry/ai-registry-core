---
name: create-marketplace-approval
description: >
  Generate a marketplace approval file for the AI Registry — trusts a vendor-published
  plugin marketplace file so every plugin it lists is fanned out into a registry plugin
  approval automatically. Use this when a user wants to approve a whole marketplace
  file instead of individual plugins.
argument-hint: "<source-url> [--format=codex] [path] — the git repo URL hosting the marketplace file"
---

# AI Registry — Marketplace Approval Generator

You are helping the user create a marketplace approval file for the AI Registry.

## What is the AI Registry?

The AI Registry is a vendor-neutral, federated trust registry for AI artifacts.
Vendors maintain their own repositories with approval files for MCP servers, Agent Skills, Agent Plugins, and A2A agents they endorse.

## What is a marketplace approval?

Some vendors publish a **marketplace file** — a client-proprietary index (not part of the
agent-plugins.org standard itself) that lists plugin entries for a specific client's UI. OpenAI
Codex/ChatGPT's format lives at `.agents/plugins/marketplace.json`. A marketplace approval trusts
that file instead of a single plugin: every entry it lists is resolved into its own genuine
`plugin.json` and published as a normal registry plugin, re-resolved on every consolidation run.
Approving a vendor's marketplace file is treating their curation as an endorsement — the vendor
chose to list that entry, by name, in a file they maintain themselves. Do not approve a
marketplace file that describes itself as open-submission/unreviewed (that's an aggregator, not
an endorsement) — use individual `create-plugin-approval` files for those entries instead.

## Your Workflow

1. **Identify the marketplace source** — the user provides a git repository URL that hosts the
   marketplace file (e.g. `https://github.com/google/skills.git`), and which format it is
   (currently only `"codex"` is supported).
2. **Verify the marketplace file exists and is genuinely curated, not open-submission** — clone
   or fetch the source and confirm the file exists at the format's conventional path
   (`.agents/plugins/marketplace.json` for `"codex"`), or at an explicit `path` if the user gives
   one. Read it and spot-check a few listed entries' own `plugin.json` to sanity-check they're
   real, agent-plugins.org-conformant plugins (this isn't enforced automatically — see
   `FEATURE_REQUEST_plugin_schema_validation.md`).
3. **Read the vendor's organization.json** — find `organization.json` in the repo root to
   determine the vendor ID.
4. **Read the approval schema** — fetch `schemas/marketplace-approval.schema.json` from
   `ai-registry-core` to confirm the current contract.
5. **Generate the approval file** — create a JSON file in the `marketplaces/` directory. There is
   no ID field and no naming convention tied to an ID (unlike every other approval type) — name
   the file descriptively, e.g. after the marketplace's own display name.
6. **Validate** — run `npm run validate` from the vendor repo.

## Key Rules

- **date** (required): Today's date in ISO format (YYYY-MM-DD).
- **source** (required): Object with `url` (git repo URL), `format` (currently only `"codex"`),
  and optionally `path` (override for a non-standard marketplace file location — omit to use the
  format's conventional path).
- No `installConfigs` — a marketplace approval fans out into many unrelated plugins, so a single
  install config block wouldn't sensibly apply to all of them. If one specific fanned-out plugin
  needs a custom install config, approve that one individually with `create-plugin-approval`
  instead.
- No entry filtering — the whole marketplace file is trusted, or it isn't approved at all.

## Example

```json
{
  "date": "2026-09-04",
  "source": {
    "url": "https://github.com/google/skills.git",
    "format": "codex"
  }
}
```

## What Consolidation Does With This

During consolidation, the marketplace file is fetched and parsed per its declared `format`. Every
entry it lists is resolved to a concrete plugin source and published as an ordinary registry
plugin — same `pluginId` derivation rules as `create-plugin-approval` (reverse-domain of the
entry's _actual_ resolved repo, never the marketplace's own display name for that entry), same
enrichment (name, description, version, author, contained skills/MCP servers, content hash), plus
a `sourcedFrom` field recording which marketplace approval produced it. Unsupported or
unresolvable entries are skipped with a warning; the rest of the marketplace still processes
normally.
