# AI Registry — Agent Guide

Vendor-neutral, federated trust registry for MCP servers, Agent Skills, Agent Plugins, A2A agents, and sandbox extensions, hosted at the Eclipse Foundation. This is the core repo — it contains schemas, validation, consolidation, and the website. Approval files live in separate organization-specific vendor repos (e.g., `ai-registry-theia`).

## Architecture

Five artifact types, same approval model:

- **MCP servers** — referenced by `serverId` in the Anthropic MCP registry. Metadata (name, description, version) enriched during consolidation.
- **Agent Skills** — referenced by `skillId` pointing to a git repo + path. `source.path` can be a single string, an array of paths, or a glob pattern (`"skills/*"`) for batch approvals — consolidation expands these into individual entries. Metadata (name, description) extracted from SKILL.md frontmatter; content hash computed via sparse checkout during consolidation.
- **Agent Plugins** ([agent-plugins.org](https://agent-plugins.org)) — referenced by `pluginId` pointing to a git repo + path (single directory, no glob/array). Consolidation fetches the whole plugin directory via sparse checkout to read `plugin.json` (name, description, version, author, homepage, keywords) and enumerate contents: skills under `skills/*/SKILL.md` and MCP servers in `mcp.json`, surfaced as read-only `containedSkills`/`containedMcpServers` metadata — not as separate standalone entries.
- **A2A agents** — referenced by `agentId` pointing directly at a fetchable `agent_card.json` URL (no repo, no path — a single JSON file). Metadata (name, description) and a content hash are extracted from the fetched card during consolidation.
- **Sandbox extensions** ([Eclipse Enclave](https://enclave.eclipse.dev/)) — referenced by `sandboxExtensionId` pointing at a git repo, with an optional `source.ref` (tag or branch) and **no path**. One approval covers the whole repository: consolidation reads `tools/*/spec.yaml` and `features/*/spec.yaml` and publishes each extension separately, into `sandboxTools` (spec `kind: sandbox`) or `sandboxFeatures` (spec `kind: mixin`). Approvals carry no `installConfigs` — nothing about installing one is tool-specific — so they appear in `orgs/<id>.json` but not `tools/<id>.json`, and the `enclave` install command is built in the website only. The two prefixes are a registry convention, stricter than Enclave's own repo-wide scan; extensions elsewhere, or whose `kind`/`name` contradicts their directory, are skipped with a warning.

**Marketplace sources** are not a sixth artifact type — a `marketplaces/*.json` approval trusts a vendor-published marketplace file (e.g. OpenAI Codex/ChatGPT's `.agents/plugins/marketplace.json`) instead of a single plugin, and every entry it lists is resolved and fanned out into an ordinary Agent Plugin entry at consolidation time, tagged with a `sourcedFrom` provenance field. It's re-resolved on every run, so new entries the vendor adds to their marketplace file are picked up automatically. See `docs/superpowers/specs/2026-09-04-agent-plugin-marketplaces-design.md` for the full design.

Organizations can provide tools (with `installConfigs`) or just approve artifacts without tool-specific configuration. All but sandbox extensions use the same approval file format — `installConfigs` is optional there and absent from the sandbox extension schema entirely.

## Data flow

```
Vendor repos → validate → collect → enrich (MCP registry + skill sources + plugin sources + agent card fetches + sandbox extension repos) → write static JSON → deploy website
```

Unreachable MCP servers get `mcpRegistryVerified: false`. Unreachable skill and plugin sources are skipped with a warning. Unreachable agent card URLs are skipped with a warning. An unreachable sandbox extension repository is skipped whole; a single extension failing its spec checks is skipped on its own.

## Key conventions

- **IDs**: Reverse-domain notation with `/` separator (e.g., `io.github.anthropics/code-review`)
- **Filenames**: ID with `/` replaced by `--` + `.json` (e.g., `io.github.anthropics--code-review.json`)
- **Directories**: `mcp/` for server approvals, `skills/` for skill approvals, `plugins/` for plugin approvals, `agents/` for agent approvals, `marketplaces/` for marketplace approvals (fan out into plugin approvals at consolidation time), `sandbox-extensions/` for sandbox extension approvals (fan out into per-extension entries at consolidation time)
- **Schemas**: `schemas/*.schema.json` — source of truth for all approval formats
- **Pure functions**: Core validation and consolidation logic has no I/O for testability. I/O wrappers are thin layers on top.

## Project layout

```
schemas/                    JSON Schema definitions
src/
  validate.ts               Validation (schema + cross-checks)
  consolidate.ts            Consolidation pipeline (collect, enrich, write)
  skill-source.ts           Skill enrichment (sparse checkout, frontmatter, hashing)
  plugin-source.ts          Plugin enrichment (sparse checkout, manifest + contents)
  agent-source.ts           Agent enrichment (HTTP fetch, parse, hash)
  marketplace-source.ts     Marketplace expansion (parse marketplace file, resolve + derive plugin IDs)
  sandbox-source.ts         Sandbox extension enrichment (clone, discover tools/* and features/*, parse spec, hash)
  anthropic-registry.ts     MCP server metadata lookup
  cli-validate.ts           CLI entry: validate a vendor repo
  cli-consolidate.ts        CLI entry: consolidate all vendors
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
- Validation is split: Phase 1 (schema), Phase 2 (MCP registry verification), Phase 3 (skill source verification), Phase 4 (plugin manifest verification), Phase 5 (agent card verification), Phase 6 (marketplace expansion verification), Phase 7 (sandbox extension source verification). Phases 2-7 warn on failure, don't block.
- Consolidation is split: collect (no network) → enrich MCP (network, fatal on error) → enrich skills (network, skip on error) → expand marketplace approvals into plugin approvals (network, skip on error per marketplace) → enrich plugins (network, skip on error) → enrich agents (network, skip on error) → expand sandbox extension repos into per-extension entries (network, skip on error) → write.
- Website types in `website/src/types.ts` mirror but don't import from `src/consolidate.ts` — keep them in sync manually.
- Guidance for implementing clients exists twice on purpose: `skills/implement-registry-client/` for agents, `/docs/clients` (`website/src/pages/docs/ClientsPage.tsx`) for people. Each is complete and neither links to the other, so a rule that changes needs both edited. Drift here is accepted, not a bug to fix by merging them.
- The sandbox extension install command (`enclave tools|features add ...`) lives only in `website/src/enclaveCommand.ts` and is never written into the consolidated JSON, matching how `InstallFromCli` already works for skills and plugins. It returns undefined for non-GitHub sources, since Enclave's `owner/repo` shorthand assumes github.com.
- Docs pages live under `/docs` with a sidebar driven by `website/src/components/docs/docsNav.ts`. Section titles come from that file via `DocsSection`, so a section is added by adding it there and rendering `<DocsSection id="...">` on the page.
