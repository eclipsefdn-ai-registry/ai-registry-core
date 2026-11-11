# AI Registry — Agent Guide

Vendor-neutral, federated trust registry for MCP servers, Agent Skills, Plugins, A2A agents, and sandbox extensions, hosted at the Eclipse Foundation. This is the core repo — it contains schemas, validation, consolidation, and the website. Approval files live in separate organization-specific vendor repos (e.g., `ai-registry-theia`).

## Architecture

Five artifact types, same approval model:

- **MCP servers** — referenced by `serverId` in the Anthropic MCP registry. Metadata (name, description, latestVersion) enriched during consolidation. An approval's own `version` is informational and published only as written, since the config, not the version, decides what runs.
- **Agent Skills** — referenced by `skillId` pointing to a git repo + path. `source.path` can be a single string, an array of paths, or a glob pattern (`"skills/*"`) for batch approvals — consolidation expands these into individual entries, each carrying the same `source.ref` as the approval it came from. `source.ref` (optional, a tag, branch, or full commit SHA) pins consolidation to that revision instead of the repository's default branch; a glob expands against the folders that exist at that revision. Metadata (name, description) extracted from SKILL.md frontmatter; content hash computed via sparse checkout during consolidation.
- **Plugins** — referenced by `pluginId` pointing to a git repo + path (single directory, no glob/array). Consolidation fetches the whole plugin directory via sparse checkout to read `plugin.json` (name, description, version, author, homepage, keywords) and enumerate contents: skills under `skills/*/SKILL.md` and MCP servers in `mcp.json`, surfaced as read-only `containedSkills`/`containedMcpServers` metadata — not as separate standalone entries. A contained MCP server whose config references `${PLUGIN_DATA}` carries `usesPluginData: true`, a fact about the config, not about any tool. A Plugin that conforms to the [agent-plugins.org](https://agent-plugins.org) specification is an **Agent Plugin**: consolidation publishes the verdict as `isAgentPlugin`, and the reasons as `agentPluginIssues` when it is false. Conformance is decided by one pure function, `agentPluginIssues` in `src/agent-plugin-conformance.ts`, against the specification versions bundled verbatim under `schemas/agent-plugins/`; a version not bundled there is unknown, and the `$schema` URL is never fetched. A non-conforming Plugin stays in the registry, unbadged. Consolidation also reads the known marketplace files (`KNOWN_MARKETPLACE_FILE_PATHS` in `src/plugin-source.ts`) from the Plugin's repository at the approved commit, out of the same clone, and publishes them as `marketplaceFiles`: one `{ path, marketplaceName?, entryName? }` per file present (no names for one that can't be parsed), `entryName` only for a `local` or relative-path entry resolving to the Plugin's path. These are facts about files, not tools, so a tool changing which file it reads costs a website change, not a schema change and re-consolidation; vendor validation and the default-branch fetch behind `latestHash` don't read them. Likewise `mcpConfigFiles`: which of `.mcp.json`, and `.claude-plugin/plugin.json` when it declares `mcpServers`, the plugin directory has at the approved commit (the files Claude Code reads MCP servers from, never `mcp.json`), read from the same checkout at no extra network cost.
- **A2A agents** — referenced by `agentId` pointing directly at a fetchable `agent_card.json` URL (no repo, no path — a single JSON file). Metadata (name, description) and a content hash are extracted from the fetched card during consolidation.
- **Sandbox extensions** ([Eclipse Enclave](https://enclave.eclipse.dev/)) — referenced by `sandboxExtensionId` pointing at a git repo, with an optional `source.ref` (tag, branch, or full commit SHA) and **no path**. One approval covers the whole repository: consolidation reads `tools/*/spec.yaml` and `features/*/spec.yaml` and publishes each extension separately, into `sandboxTools` (spec `kind: sandbox`) or `sandboxFeatures` (spec `kind: mixin`). Approvals carry no `installConfigs` — nothing about installing one is tool-specific — so they appear in `orgs/<id>.json` but not `tools/<id>.json`, and the `enclave` install command is built in the website only. The two prefixes are a registry convention, stricter than Enclave's own repo-wide scan; extensions elsewhere, or whose `kind`/`name` contradicts their directory, are skipped with a warning.

**Marketplace sources** are not a sixth artifact type — a `marketplaces/*.json` approval trusts a vendor-published marketplace file (e.g. OpenAI Codex/ChatGPT's `.agents/plugins/marketplace.json`) instead of a single plugin, and every entry it lists is resolved and fanned out into an ordinary Plugin entry at consolidation time, tagged with a `sourcedFrom` provenance field. It's re-resolved on every run, so new entries the vendor adds to their marketplace file are picked up automatically. See `docs/superpowers/specs/2026-09-04-agent-plugin-marketplaces-design.md` for the full design.

Organizations can provide tools (with `installConfigs`) or just approve artifacts without tool-specific configuration. All but sandbox extensions use the same approval file format — `installConfigs` is optional there and absent from the sandbox extension schema entirely.

**Latest.** Skill, plugin, and sandbox extension entries publish `source.commit` and `contentHash`, which say what was approved. Next to them go `latestCommit` and `latestHash`, which say what the source ships at the entry's path now: the tip of the ref's own branch for a branch ref, of the default branch otherwise.

- Only an approval whose `source.ref` pins a tag or commit can differ, and only once the default branch moves off it.
- One `git ls-remote` per repository decides. Only when the branch has moved is the path fetched and hashed again, with no ref.
- `source.pinned` records which kind the ref is, decided by that same `ls-remote`: `true` for a tag or full commit SHA, `false` for a branch or no ref. MCP approvals carry none, since their `version` is informational.
- Behind is `latestHash !== contentHash`. Every consumer derives it, it is never stored, and it is never a commit comparison.
- Every published file carries a `generatedAt` timestamp, except the marketplace files (below), whose schema is not ours.

## Published marketplaces

The registry also publishes its approved plugins back out as Claude Code plugin marketplaces: `marketplace.json` (the aggregate) and `orgs/<id>/marketplace.json` (one per organization with at least one plugin to list, and none for the others, which `orgs/<id>.json` records as `hasMarketplace`). Not every approved plugin is listed: one whose id makes no valid entry name, or the same one as another plugin's, is skipped with a warning, and an approval that named a different revision from the one fetched, directly or through trust, is left off. A client adds one with `claude plugin marketplace add <url>` instead of reading the registry. Per-organization is the form to subscribe to, since trust here is held by an organization and a merged catalog flattens it.

This is the opposite direction from `marketplaces/*.json` approvals, which consume a vendor's marketplace file — `src/marketplace-output.ts` writes, `src/marketplace-source.ts` reads.

- Entry `name` is the `pluginId` with `/` replaced by `.`, and the plugin's own name goes to `displayName`. Consolidation is a stateless rebuild and so can't emit the `renames` map that repairs installs after a name moves; a name derived from the id can never move.
- Entries pin `sha` to `source.commit`, alongside `ref` where the approval names one, so an install is what `contentHash` covers. Claude Code wants a full 40-character SHA and anything shorter is dropped.
- Approval provenance goes in each entry's free-form `metadata`, which Claude Code ignores at load.
- Each Plugin entry publishes `publishedMarketplaces`, one `{ orgId, marketplaceName, entryName }` per organization file that lists it, read off the built files by `buildOrgMarketplaces` before anything is written, so entries and files can't disagree. Empty means listed nowhere; absent (an older feed) means unknown.
- Claude Code only. It is the only client that adds a marketplace from a URL; Codex and Copilot read one out of a git repository, which a static API isn't. Publishing their dialects means publishing a generated repository.

## Data flow

```
Vendor repos → validate → collect → enrich (MCP registry + skill sources + plugin sources + agent card fetches + sandbox extension repos) → write static JSON → deploy website
```

Unreachable MCP servers get `mcpRegistryVerified: false`. Unreachable skill and plugin sources are skipped with a warning. Unreachable agent card URLs are skipped with a warning. An unreachable sandbox extension repository is skipped whole; a single extension failing its spec checks is skipped on its own. Failing to find out what the default branch ships now costs an entry only its `latestCommit`/`latestHash`, plus `source.pinned` for a named ref, never the entry.

## Key conventions

- **IDs**: Reverse-domain notation with `/` separator (e.g., `io.github.anthropics/code-review`)
- **Filenames**: ID with `/` replaced by `--` + `.json` (e.g., `io.github.anthropics--code-review.json`)
- **Directories**: `mcp/` for server approvals, `skills/` for skill approvals, `plugins/` for plugin approvals, `agents/` for agent approvals, `marketplaces/` for marketplace approvals (fan out into plugin approvals at consolidation time), `sandbox-extensions/` for sandbox extension approvals (fan out into per-extension entries at consolidation time)
- **Schemas**: `schemas/*.schema.json` — source of truth for all approval formats
- **Pure functions**: Core validation and consolidation logic has no I/O for testability. I/O wrappers are thin layers on top.

## Project layout

```
schemas/                    JSON Schema definitions (agent-plugins/: bundled Agent Plugins spec schemas, verbatim)
src/
  validate.ts               Validation (schema + cross-checks)
  consolidate.ts            Consolidation pipeline (collect, enrich, write)
  skill-source.ts           Skill enrichment (sparse checkout, frontmatter, hashing)
  plugin-source.ts          Plugin enrichment (sparse checkout, manifest + contents, Agent Plugin verdict)
  agent-plugin-conformance.ts  Agent Plugin conformance (pure, over plugin.json, mcp.json and SKILL.md contents)
  agent-source.ts           Agent enrichment (HTTP fetch, parse, hash)
  marketplace-source.ts     Marketplace expansion (parse marketplace file, resolve + derive plugin IDs)
  marketplace-output.ts     Marketplace files the registry publishes (Claude Code format, aggregate + per org)
  sandbox-source.ts         Sandbox extension enrichment (clone, discover tools/* and features/*, parse spec, hash)
  git-source.ts             Shared git helpers (clone at a ref, list remote branches, decide whether latest needs a second fetch and record it)
  server-key.ts             Server keys (deriving one from a generic config, reading a config's key, grouping collisions)
  anthropic-registry.ts     MCP server metadata lookup
  cli-validate.ts           CLI entry: validate a vendor repo
  cli-consolidate.ts        CLI entry: consolidate all vendors
  check-updates.ts          Approvals behind their source, read from a consolidated feed
  cli-check-updates.ts      CLI entry: report approvals behind their source
website/                    React + Vite static website
skills/                     Claude Code skills for generating approvals
vendors.json                Registered vendor repos
```

## Commands

```bash
npm run check               # typecheck + lint + format check + tests
npm test                    # tests only (Node.js built-in test runner via tsx)
npm run validate-vendor -- <path>   # validate a vendor repo
npm run consolidate         # consolidate all vendors to dist/api/v1/
npm run check-updates -- [path|url]   # report approvals behind their source, from dist/api/v1/all.json by default
npm run dev                 # consolidate + start website dev server
npm run format              # auto-format with Prettier
```

## Testing

Tests use Node.js built-in `node:test` with `assert/strict`. Pure function tests — no mocking, no external dependencies. Run with `npm test`.

## Before committing

**MANDATORY: run `npm run format` before every commit.** Do not skip this, even for small or "obviously fine" changes — unformatted code must never be committed. After formatting, run `npm run check` (typecheck, lint, format verification, and tests) and confirm it passes before committing.

## When editing

- Schemas are the contract — change schemas first, then update validation and consolidation to match.
- `installConfigs` and `tools` are optional. Handle missing values with `?? []`.
- Validation is split: Phase 1 (schema), Phase 2 (MCP registry verification), Phase 3 (skill source verification), Phase 4 (plugin manifest verification, including Agent Plugin conformance issues as warnings), Phase 5 (agent card verification), Phase 6 (marketplace expansion verification), Phase 7 (sandbox extension source verification). Phases 2-7 warn on failure, don't block.
- Consolidation is split: collect (no network) → enrich MCP (network, retried, then fatal on error) → enrich skills (network, skip on error) → expand marketplace approvals into plugin approvals (network, skip on error per marketplace) → enrich plugins (network, skip on error; decides `isAgentPlugin`, keeps non-conforming Plugins; reads the repository's marketplace files at the approved commit, recording a malformed one without `entryName` and a warning) → enrich agents (network, skip on error) → expand sandbox extension repos into per-extension entries (network, skip on error) → write.
- The skill, plugin, and sandbox extension steps record latest only when given a `RemoteBranchesLookup` (`src/git-source.ts`). Consolidation passes one shared lookup. Vendor validation passes none, so it does no extra network work.
- The second fetch that computes `latestHash` must go through the same function that produced `contentHash`, or the two stop being comparable.
- Website types in `website/src/types.ts` mirror but don't import from `src/consolidate.ts` — keep them in sync manually.
- Guidance for implementing clients exists twice on purpose: `skills/implement-registry-client/` for agents, `/docs/clients` (`website/src/pages/docs/ClientsPage.tsx`) for people. Each is complete and neither links to the other, so a rule that changes needs both edited. Drift here is accepted, not a bug to fix by merging them.
- `src/marketplace-output.ts` is the one tool-specific rendering outside the website, deliberately: `installCommand.ts` and `enclaveCommand.ts` produce a string for a human to copy, while a marketplace file has to exist at a URL in the API surface. The command that adds one is still website-only, in `website/src/marketplaceCommand.ts`.
- The sandbox extension install command (`enclave tools|features add ...`) lives only in `website/src/enclaveCommand.ts` and is never written into the consolidated JSON, matching how the skill and plugin commands live only in `website/src/installCommand.ts`. It returns undefined for non-GitHub sources, since Enclave's `owner/repo` shorthand assumes github.com. The skill and Enclave commands carry `source.ref` (as `#<ref>` and `--ref <ref>`), or `source.commit` in its place when `approvedTarget` says pinned, since a tag can be moved and the commit is what was hashed. The plugin command is offered only for a Plugin that isn't an Agent Plugin, and is replaced by a note whenever the approval names a ref, branch included, because the plugins CLI can't target one; that suppression goes away once it can. The `npx plugins` command carries a warning that it installs every plugin in the repository, since the CLI takes a repository and can't select one. Plugins also get a Claude Code entry per `publishedMarketplaces` record (add the organization's published marketplace, then install `<entryName>@<marketplaceName>`), Agent Plugin or not and ref or not, since the published entry pins `sha`; none without the field or `source.commit`. Each warns, naming the servers, when `containedMcpServers` isn't empty and `mcpConfigFiles` is (empty, not missing): Claude Code would install the plugin without them. And a Kiro entry: the `sourceTreeUrl` that Kiro's "Import power from GitHub" takes, pinned to `source.commit` and shown only for an Agent Plugin on github.com with a commit, ref or not. And a Codex entry for an Agent Plugin with a commit whose first-found Codex marketplace file in `marketplaceFiles` (order in `CODEX_MARKETPLACE_FILES`) has an `entryName`: `codex plugin marketplace add <owner/repo or git URL> --ref <commit>`, then `codex plugin add <entryName>@<marketplaceName>`, ref or not, since `--ref` pins the `local` entry with the file. And a VS Code (GitHub Copilot) entry on github.com only, Agent Plugin or not: when the first-found VS Code marketplace file (order in `VS_CODE_MARKETPLACE_FILES`) has an `entryName`, **Chat: Add Marketplace** with `owner/repo#<commit>` then install `<entryName>`, needing a commit, ref or not; when none of those files is present (or `marketplaceFiles` is missing), for a root Plugin with no ref, **Chat: Install Plugin from Source** with `owner/repo`, never with `#<sha>`, which VS Code ignores but still displays. Both forms warn, naming the servers, when a `containedMcpServers` item has `usesPluginData` (its config references `${PLUGIN_DATA}`, which VS Code doesn't expand). A missing `isAgentPlugin` means unknown, so it passes every verdict check; the ref, host, commit, path and marketplace-file checks still apply. Every plugin install rule sits behind one function, `pluginInstallOptions`, which takes the plugin and the site base URL and returns the ordered per-tool instructions (steps, warnings, or why a tool can't install the approved revision) that the plugin detail page renders; a new tool or rule goes there.
- Docs pages live under `/docs` with a sidebar driven by `website/src/components/docs/docsNav.ts`. Section titles come from that file via `DocsSection`, so a section is added by adding it there and rendering `<DocsSection id="...">` on the page.
