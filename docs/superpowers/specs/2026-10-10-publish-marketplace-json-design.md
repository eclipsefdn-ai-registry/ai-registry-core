# Publishing marketplace.json from the registry API

Date: 2026-10-10

## Why

The registry already consumes marketplace files: a `marketplaces/*.json` approval
trusts a vendor-published marketplace and fans its entries out into plugin
entries. This design covers the opposite direction — the registry publishing a
marketplace file of its own, so an agent tool can install approved plugins
straight from it.

### What marketplace.json is today

There is no vendor-neutral standard. The Agent Plugins 1.0 specification scopes
distribution, discovery and registries out, and defines only the package format.
What exists instead is convergence on a near-identical shape across three
dialects:

| Tool            | Path                               | Plugin source types                                                  |
| --------------- | ---------------------------------- | -------------------------------------------------------------------- |
| Claude Code     | `.claude-plugin/marketplace.json`  | relative, `github`, `url`, `git-subdir`, `npm`, `archive`, `command` |
| Codex / ChatGPT | `.agents/plugins/marketplace.json` | `local`, `git-subdir`, `npm`                                         |
| Copilot         | `.github/plugin/marketplace.json`  | —                                                                    |

All three are `{name, owner, plugins: [{name, source}]}`. Codex also reads the
Claude dialect, and chose `.agents/` as a deliberately vendor-neutral path.

Two facts decide the design:

1. **Claude Code adds a marketplace from a plain HTTPS URL.** The static API can
   be a marketplace with no new infrastructure. Codex accepts only git sources
   (GitHub shorthand, git URL, SSH, local directory), so a hosted file is
   unreachable to it, and per-org Codex coverage would need one generated repo
   per organization.
2. **A URL-added marketplace can't resolve relative plugin paths**, so every
   entry needs an object source. Plugin entries already carry
   `{url, path, ref, commit}`, which maps onto `git-subdir` and `url` exactly.

## Scope

Publish Claude-dialect marketplace files over HTTPS. Codex, Copilot and a
generated git repository are out of scope; the upstream ask is for Codex to
support `url` marketplace sources.

Skills are out of scope. A skill directory is not a loadable plugin, and
wrapping 954 of them would mean hosting content the registry only hashes today.

## Files

```
dist/api/v1/marketplace.json              aggregate — every approved plugin that can be listed
dist/api/v1/orgs/<id>/marketplace.json    one per organization with ≥1 plugin to list
```

An organization with nothing to list gets no file. An empty `plugins` array is a
`claude plugin validate` warning and a dead end for the user who added it. That
is decided on the built marketplace, not the approvals, so an organization whose
every entry was skipped gets none either. `orgs/<id>.json` records the outcome
as `hasMarketplace`, which the organization page reads instead of guessing from
its plugin list. `orgs/<id>.json` and `orgs/<id>/marketplace.json` coexist on a
static host.

Per-organization is the primary form. Trust in this registry is per
organization, so a single merged catalog would flatten the distinction the
registry exists to publish. An enterprise adds the marketplaces of the
organizations it trusts, and that composition is the governance model. The
aggregate exists for discovery and demonstration.

### Marketplace-level fields

| Field         | Value                                                           |
| ------------- | --------------------------------------------------------------- |
| `name`        | `ai-registry`, or `ai-registry-<orgId>`                         |
| `description` | names the approving organization, where there is one            |
| `owner`       | `{name: "Eclipse Foundation", url: "https://ai.open-vsx.org/"}` |
| `$schema`     | `https://anthropic.com/claude-code/marketplace.schema.json`     |
| `plugins`     | entries, sorted by `name`                                       |

Neither name collides with Anthropic's reserved marketplace names, and both
satisfy the `[A-Za-z0-9._-]` identifier rule. `buildMarketplace` doesn't check
the organization's: the organization schema already restricts an id to
`^[a-z0-9-]+$`, fatally, before consolidation runs.

`forceRemoveDeletedPlugins` is left unset. Setting it would uninstall a dropped
plugin from users' machines — real revocation reach, and the most dangerous
switch available, since a consolidation bug that drops entries would uninstall
working plugins everywhere. Revisit once the pipeline has a track record.

**These files carry no `generatedAt`**, departing from the rule that every
published file is timestamped. The schema is Anthropic's, an unknown top-level
key is a validation warning, and extending someone else's contract to satisfy
ours is the wrong trade. AGENTS.md records the exception.

## Entries

```json
{
  "name": "io.github.gemini-cli-extensions.looker",
  "displayName": "looker",
  "description": "...",
  "version": "0.3.10",
  "author": { "name": "..." },
  "homepage": "...",
  "keywords": ["..."],
  "source": {
    "source": "git-subdir",
    "url": "https://github.com/google/skills.git",
    "path": "plugins/looker",
    "ref": "0.3.10",
    "sha": "<source.commit>"
  },
  "metadata": {
    "pluginId": "io.github.gemini-cli-extensions/looker",
    "registryUrl": "https://ai.open-vsx.org/?plugin=io.github.gemini-cli-extensions%2Flooker",
    "contentHash": "...",
    "approvals": [{ "organizationId": "google", "date": "2026-09-11" }]
  }
}
```

**Name.** The `pluginId` with `/` replaced by `.`. Claude Code entry names allow
only `[A-Za-z0-9._-]`, and a user types `<name>@<marketplace>` to install, so the
name has to be both legal and stable. Consolidation is a stateless rebuild and
cannot emit a `renames` map, so a scheme where adding one plugin renames another
would break installed plugins with no way to repair them. Deriving from the
pluginId removes that class of failure entirely. `displayName` carries the
plugin's own name for the `/plugin` UI.

Two distinct pluginIds could in principle derive the same entry name
(`a/b.c` and `a.b/c`), and an id can also be unusable outright — the plugin id
schema rejects one that is, but only for a hand-authored approval, since an id
derived from a vendor's marketplace file never passes through validation. Both
cases leave the entry out with a warning. Throwing would abort consolidation
from inside the write step, so one bad approval would leave the whole registry
un-deployed.

**Source.** `git-subdir` when the approval has a `path`, `url` when it does not.
Both carry `ref` when the approval names one.

**Pinning.** Every entry carries `sha` = `source.commit`, the commit the entry's
`contentHash` was computed at, so an install is exactly what the registry
verified. That is the reason to add this marketplace rather than the vendor's
own. `ref` goes alongside it where the approval names one: Claude Code checks
out the `sha` and the extra `ref` keeps the install working if the branch is
later deleted. Updates land on the next consolidation run. A `sha` upstream has
force-pushed away fails the install rather than silently installing something
else, which is the correct failure for a trust registry. `sha` is emitted only
when `source.commit` is a full 40-character hex SHA, which is what Claude Code
accepts.

**Provenance.** Entry `metadata` is free-form and ignored by Claude Code at load
time, so it carries the approval record into users' hands without affecting
installation: the registry's own `pluginId`, a link back to the entry on the
site, the `contentHash`, and the approvals themselves. A per-organization file
lists only that organization's approvals; the aggregate lists all of them.
`viaTrust` and `sourcedFrom` come along where present, since both say something
about how the approval was arrived at.

An approval is left off the entry when its organization approved a different
revision. Organizations approving one plugin share a single entry and the first
source collected wins it, so the losing approval is attached to a commit its
organization never saw — publishing that as an install instruction in their own
marketplace would be wrong, and their revision can't take its place because only
the winning one was fetched and hashed. `addPluginApproval` records the loser
where it already warns, and that record is threaded through the build rather
than published. An approval copied through trust is checked against the
organization it was copied from, since it vouches for that organization's
revision.

## Code

`src/marketplace-output.ts` exports `buildMarketplace(plugins, org?,
sourceMismatches?)` and `buildOrgMarketplace(plugins, org, sourceMismatches?)`, which
returns undefined when an organization would get an empty file. Both are pure
functions with no I/O, called from consolidation's write step. It imports
`PluginEntry` as a type only, so nothing is added to the runtime import graph.

This is a deliberate exception to the convention that tool-specific rendering
lives only in the website. `installCommand.ts` produces a string for a human to
copy; this produces a file that has to exist at a URL in the API surface.
AGENTS.md records the distinction.

Tests are pure-function tests in `src/marketplace-output.test.ts`: name
derivation, the `git-subdir`/`url` split, ref and sha emission, the full-SHA
guard, per-organization filtering of both entries and their approvals, dropping
an approval that named another revision (directly or through trust), sort
order, the two skip rules with their warnings, and `buildOrgMarketplace` having no
file for an organization with nothing to list.

## Website and docs

- Each organization page that has a marketplace shows the
  `claude plugin marketplace add <url>` command, reusing `InstallFromCli`.
- `/docs/api` documents both endpoints and states the Claude-only limitation.

Nothing in the website reads these files back. `website/src/types.ts` gains
only `hasMarketplace`, read from `orgs/<id>.json`.

## Known limits

- Claude Code and Claude Desktop only, until Codex supports `url` marketplace
  sources.
- 24 plugin entries today. The catalog is thin until the question of indexing
  tool-specific plugin formats is settled.
- No skills.
- Claude Code reads a plugin's MCP servers from `.mcp.json`, while the portable
  Agent Plugins layout puts them in `mcp.json`, so a published entry whose value
  is an MCP server installs and loads nothing. 5 of the 24 are MCP-only. Skills
  use the same `skills/` convention in both and do load — verified by installing
  one. Translating the contents would mean publishing something other than what
  the vendor did, so this is left as it is.
