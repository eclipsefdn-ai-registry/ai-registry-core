# AI Registry — Agent Guide

Vendor-neutral, federated trust registry for MCP servers, Agent Skills, Agent Plugins, and A2A agents, hosted at the Eclipse Foundation. This is the core repo — it contains schemas, validation, consolidation, and the website. Approval files live in separate organization-specific vendor repos (e.g., `ai-registry-theia`).

## Architecture

Four artifact types, same approval model:

- **MCP servers** — referenced by `serverId` in the Anthropic MCP registry. Metadata (name, description, version) enriched during consolidation.
- **Agent Skills** — referenced by `skillId` pointing to a git repo + path. `source.path` can be a single string, an array of paths, or a glob pattern (`"skills/*"`) for batch approvals — consolidation expands these into individual entries. Metadata (name, description) extracted from SKILL.md frontmatter; content hash computed via sparse checkout during consolidation.
- **Agent Plugins** ([agent-plugins.org](https://agent-plugins.org)) — referenced by `pluginId` pointing to a git repo + path (single directory, no glob/array). Consolidation fetches the whole plugin directory via sparse checkout to read `plugin.json` (name, description, version, author, homepage, keywords) and enumerate contents: skills under `skills/*/SKILL.md` and MCP servers in `mcp.json`, surfaced as read-only `containedSkills`/`containedMcpServers` metadata — not as separate standalone entries.
- **A2A agents** — referenced by `agentId` pointing directly at a fetchable `agent_card.json` URL (no repo, no path — a single JSON file). Metadata (name, description) and a content hash are extracted from the fetched card during consolidation.

Organizations can provide tools (with `installConfigs`) or just approve artifacts without tool-specific configuration. All four use the same approval file format — `installConfigs` is optional.

## Data flow

```
Vendor repos → validate → collect → enrich (MCP registry + skill sources + plugin sources + agent card fetches) → write static JSON → deploy website
```

Unreachable MCP servers get `mcpRegistryVerified: false`. Unreachable skill and plugin sources are skipped with a warning. Unreachable agent card URLs are skipped with a warning.

## Key conventions

- **IDs**: Reverse-domain notation with `/` separator (e.g., `io.github.anthropics/code-review`)
- **Filenames**: ID with `/` replaced by `--` + `.json` (e.g., `io.github.anthropics--code-review.json`)
- **Directories**: `mcp/` for server approvals, `skills/` for skill approvals, `plugins/` for plugin approvals, `agents/` for agent approvals
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
- Validation is split: Phase 1 (schema), Phase 2 (MCP registry verification), Phase 3 (skill source verification), Phase 4 (plugin manifest verification), Phase 5 (agent card verification). Phases 2-5 warn on failure, don't block.
- Consolidation is split: collect (no network) → enrich MCP (network, fatal on error) → enrich skills (network, skip on error) → enrich plugins (network, skip on error) → enrich agents (network, skip on error) → write.
- Website types in `website/src/types.ts` mirror but don't import from `src/consolidate.ts` — keep them in sync manually.
- Guidance for implementing clients exists twice on purpose: `skills/implement-registry-client/` for agents, `/docs/clients` (`website/src/pages/docs/ClientsPage.tsx`) for people. Each is complete and neither links to the other, so a rule that changes needs both edited. Drift here is accepted, not a bug to fix by merging them.
- Docs pages live under `/docs` with a sidebar driven by `website/src/components/docs/docsNav.ts`. Section titles come from that file via `DocsSection`, so a section is added by adding it there and rendering `<DocsSection id="...">` on the page.
