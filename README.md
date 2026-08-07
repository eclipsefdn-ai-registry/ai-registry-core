# AI Registry

> **Preview** — This registry is currently in preview. Data, APIs, and the website may change as we iterate on the concept.

A vendor-neutral, federated trust registry for AI artifacts, hosted at the Eclipse Foundation. Supports [Model Context Protocol](https://modelcontextprotocol.io) (MCP) servers, [Agent Skills](https://agentskills.io), and [Agent Plugins](https://agent-plugins.org).

## How It Works

The registry follows a federated model: **vendors** maintain their own repositories with approval files for AI artifacts (MCP servers, Agent Skills, and Agent Plugins) they endorse. A **central repository** consolidates all vendor data into a single JSON file that tools can consume.

```
Vendor Repos                    Central Repo                    Consumers
┌──────────────┐
│ Theia IDE    │──┐
│ (approvals)  │  │         ┌─────────────────┐          ┌──────────────┐
└──────────────┘  ├──────►  │  Consolidation  │────────► │  all.json    │
┌──────────────┐  │         │  + Validation   │          │  Website     │
│ Vendor B     │──┘         │  + Metadata     │          │  Tools/IDEs  │
│ (approvals)  │            └─────────────────┘          └──────────────┘
└──────────────┘
```

**Vendor repos** contain:

- `organization.json` — organization identity and (optionally) tools
- `mcp/*.json` — one approval file per approved MCP server, with optional tool-specific install configurations
- `skills/*.json` — one approval file per approved Agent Skill, pointing to the skill's source repository
- `plugins/*.json` — one approval file per approved Agent Plugin, pointing to the plugin's source repository

**The central repo** provides:

- JSON schemas that define the contract for all participants
- A consolidation pipeline that pulls, validates, and merges vendor data
- Metadata enrichment from the Anthropic MCP registry (server names, descriptions, verification status)
- Metadata enrichment from skill source repos (name, description, content hash)
- Metadata enrichment from plugin source repos (name, description, version, author, contained skills/MCP servers, content hash)
- A static website deployed to GitHub Pages for browsing the registry
- Claude Code skills for generating [MCP](skills/create-mcp-approval/SKILL.md), [skill](skills/create-skill-approval/SKILL.md), and [plugin](skills/create-plugin-approval/SKILL.md) approval files

## Repositories

| Repository                                                                       | Purpose                                                                                        |
| :------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------- |
| [ai-registry-core](https://github.com/eclipsefdn-ai-registry/ai-registry-core)   | Central repo — schemas, consolidation, website, AI skill ([development guide](DEVELOPMENT.md)) |
| [ai-registry-theia](https://github.com/eclipsefdn-ai-registry/ai-registry-theia) | Theia IDE vendor repo — serves as the reference implementation for vendor repositories         |

## Data Flow

1. A vendor creates approval files (manually or using the Claude Code skills for [MCP](skills/create-mcp-approval/SKILL.md), [skills](skills/create-skill-approval/SKILL.md), or [plugins](skills/create-plugin-approval/SKILL.md))
2. Vendor commits and pushes — CI validates against the central schemas
3. On successful push to main, the vendor CI triggers the central consolidation workflow
4. Consolidation pulls all registered vendor repos, validates, enriches with MCP registry metadata, skill source metadata, and plugin source metadata
5. The website and consolidated JSON are built and deployed to GitHub Pages
6. Tools (e.g., Theia IDE) consume the consolidated JSON at a stable URL

## Vendor Guide

### Repository structure

A vendor repo is a pure data repository — no dependencies, no build steps. It contains:

```
organization.json          # vendor identity and tools
mcp/
  <server-id>.json         # one file per approved MCP server
skills/
  <skill-id>.json          # one file per approved Agent Skill
plugins/
  <plugin-id>.json         # one file per approved Agent Plugin
.github/workflows/
  validate.yml             # CI that runs the central validation
```

### organization.json

Declares your organization and, if applicable, the tools you provide. Organizations that only approve artifacts without providing tools can omit the `tools` field. Set the optional `inferred` field to `true` for organizations pre-seeded from an official public source rather than participating directly in the registry — the website marks them with a distinct "Inferred" badge and a dashed-border treatment, with an explanatory tooltip on hover. See the [organization schema](schemas/organization.schema.json) for the full field reference.

```json
{
  "id": "your-org",
  "name": "Your Organization",
  "description": "Short description",
  "website": "https://example.com",
  "color": "#1a1f71",
  "tools": [
    {
      "id": "your-tool",
      "name": "Your Tool",
      "skillInstallUrlPrefix": "your-tool://install-skill?id=",
      "mcpInstallUrlPrefix": "your-tool://install-mcp?id="
    }
  ]
}
```

When a tool declares `skillInstallUrlPrefix` or `mcpInstallUrlPrefix`, consolidation auto-generates `installUrl` for any approval that targets that tool but omits it — `prefix + artifactId`. Explicit `installUrl` values in approval files always take precedence.

An organization can also delegate to other organizations' judgment instead of filing its own approval per skill, via `trusts`:

```json
{
  "id": "theia",
  "name": "Theia IDE",
  "trusts": [
    { "org": "anthropic", "artifactTypes": { "skills": {} } },
    { "org": "openai", "artifactTypes": { "skills": {} } }
  ]
}
```

Every skill a trusted organization directly approves is automatically treated as approved by the trusting organization too — no separate `skills/*.json` file needed. Trust is single-hop only (no transitive trust) and, today, only covers skills (`artifactTypes.skills`); `artifactTypes.mcp` isn't a recognized key yet. Trust-derived approvals are tagged with `viaTrust` (the trusted org's id) in the consolidated output for API consumers, but render identically to direct approvals on the website.

### MCP approval files

One JSON file per approved MCP server, stored in `mcp/`. The filename must be `<serverId>.json` with `/` replaced by `--`. See the [approval schema](schemas/mcp-approval.schema.json) for the full field reference.

Example: `mcp/io.github.ChromeDevTools--chrome-devtools-mcp.json`

```json
{
  "serverId": "io.github.ChromeDevTools/chrome-devtools-mcp",
  "date": "2026-05-12",
  "installConfigs": [
    {
      "tool": "your-tool",
      "config": {
        "servers": {
          "chrome-devtools": {
            "command": "npx",
            "args": ["-y", "chrome-devtools-mcp@latest"]
          }
        }
      },
      "instructions": "Starts the Chrome DevTools MCP server via npx"
    }
  ]
}
```

The `serverId` must reference a server in the [Anthropic MCP registry](https://registry.modelcontextprotocol.io). Server metadata (name, description) is retrieved automatically during consolidation — you only supply the ID and optionally install configurations. Approvals without `installConfigs` are valid and indicate the organization approves the server without providing tool-specific configuration.

#### Vendor-supplied metadata for servers not in the Anthropic registry

Not every MCP server a vendor wants to approve is registered with Anthropic yet. For these, an approval can optionally include `metadata` and `selfPublished`:

```json
{
  "serverId": "io.github.some-org/not-yet-registered-server",
  "date": "2026-07-01",
  "metadata": {
    "name": "Not Yet Registered Server",
    "description": "Does something useful, pending registration with the Anthropic MCP registry."
  },
  "selfPublished": true
}
```

- **`metadata`** (`{ name, description }`) — a fallback name/description used only while the server is absent from the Anthropic registry. Once the server appears there, registry data always takes precedence and `metadata` is ignored.
- **`selfPublished`** (boolean) — set this only if your organization actually publishes/maintains the server (not merely approves or recommends it). It renders a distinct "Publisher claim" badge on the website, separate from Anthropic-registry verification; the claiming organization's name appears in the badge's tooltip, not the badge text itself.

These two fields are independent: any approving vendor may supply `metadata` as a suggestion without self-attesting, and self-attestation implies stronger trust in that vendor's `metadata` if supplied.

Resolution when a server has no registry entry:

1. If exactly one vendor set `selfPublished: true`, that vendor's `metadata` (if present) wins, and the website shows a "Publisher claim" badge (the claiming vendor's name is in the tooltip). **Two different vendors self-attesting for the same server is a contradiction and fails the shared consolidation build** — a server can only have one publisher.
2. Otherwise, among vendors that supplied plain `metadata`, the earliest-`date` approval wins (organization ID alphabetically as a tie-break on an exact date match). This is a deterministic, non-fatal fallback — vendors can't see each other's data before filing, so disagreement here is expected and only logged as a warning, not a build failure.

### Skill approval files

One JSON file per approved Agent Skill (or group of skills from the same repo), stored in `skills/`. The filename must be `<skillId>.json` with `/` replaced by `--`. See the [skill approval schema](schemas/skill-approval.schema.json) for the full field reference.

**Single skill** — `source.path` is a string pointing to the skill folder:

```json
{
  "skillId": "io.github.anthropics/code-review",
  "date": "2026-06-01",
  "source": {
    "url": "https://github.com/anthropics/skills.git",
    "path": "skills/code-review"
  },
  "installConfigs": [{ "tool": "your-tool" }]
}
```

If `your-tool` declares `skillInstallUrlPrefix` in `organization.json`, the `installUrl` is generated automatically during consolidation. You can also set it explicitly if the tool has no prefix or you need a custom URL.

**Multiple skills** — `source.path` can be an array of paths or a glob pattern (`"skills/*"`) to approve many skills from the same repo in a single file. In this case, `skillId` acts as a prefix — each discovered path's last segment is appended (e.g., `io.github.anthropics` + `skills/pdf` → `io.github.anthropics/pdf`):

```json
{
  "skillId": "io.github.anthropics",
  "date": "2026-06-01",
  "source": {
    "url": "https://github.com/anthropics/skills.git",
    "path": "skills/*"
  }
}
```

Consolidation expands multi-path approvals into individual skill entries — the output format is unchanged. Consumers are not affected.

The `source` points to a git repository containing the skill folder(s). Skill metadata (name, description) and a content hash are extracted automatically during consolidation.

### Plugin approval files

One JSON file per approved [Agent Plugin](https://agent-plugins.org), stored in `plugins/`. The filename must be `<pluginId>.json` with `/` replaced by `--`. See the [plugin approval schema](schemas/plugin-approval.schema.json) for the full field reference.

Example: `plugins/io.github.gemini-cli-extensions--bigquery-data-analytics.json`

```json
{
  "pluginId": "io.github.gemini-cli-extensions/bigquery-data-analytics",
  "date": "2026-08-07",
  "source": {
    "url": "https://github.com/gemini-cli-extensions/bigquery-data-analytics.git"
  },
  "installConfigs": [{ "tool": "your-tool" }]
}
```

`source.path` points to the plugin's directory within the repository (containing `plugin.json`); omit it if the plugin lives at the repository root, as in the example above.

During consolidation, the plugin's directory is fetched to read its `plugin.json` manifest (name, description, version, author, homepage, keywords) and to enumerate its contents: skills under `skills/*/SKILL.md` and MCP servers declared in `mcp.json`. These are surfaced as read-only metadata (`containedSkills`, `containedMcpServers`) on the plugin entry — approving a plugin does not create separate standalone skill or MCP server entries. A content hash covering the whole plugin directory is also computed.

### Validation

Validation runs in CI by checking out the central repo and running its CLI against your vendor repo.

To validate locally from the vendor repo:

```bash
npm run validate           # standalone — clones core repo automatically
npm run validate:local     # fast — requires core repo checked out as sibling
```

See the [Theia vendor repo](https://github.com/eclipsefdn-ai-registry/ai-registry-theia) for a complete reference implementation including the CI workflow.

### Becoming a vendor

1. Request a vendor repository by [opening an issue](https://github.com/eclipsefdn-ai-registry/ai-registry-core/issues) on this repo describing your organization and the artifacts you plan to approve
2. We create a new repository for you from a template, with the structure above and CI (the [validate workflow](https://github.com/eclipsefdn-ai-registry/ai-registry-theia/blob/main/.github/workflows/validate.yml)) already set up — you only need to fill in your `organization.json` and add approval files in `mcp/`, `skills/`, and/or `plugins/`
3. Request registration by opening a PR on this repo that adds your entry to `vendors.json`

## API

The registry is served as static JSON files from the registry website. Base URL:

```
https://ai.open-vsx.org/api/v1/
```

| Endpoint                                                                  | Description                                                                                                        |
| :------------------------------------------------------------------------ | :----------------------------------------------------------------------------------------------------------------- |
| [`all.json`](https://ai.open-vsx.org/api/v1/all.json)                     | Full registry — organizations, tools, MCP servers, skills, and plugins with merged approvals                       |
| [`organizations.json`](https://ai.open-vsx.org/api/v1/organizations.json) | All organizations and their tools                                                                                  |
| `tools/<tool-id>.json`                                                    | Per-tool view — servers, skills, and plugins approved for that tool, with install configs for other tools stripped |

Schemas are also available at `/schemas/` (e.g., [`mcp-approval.schema.json`](https://ai.open-vsx.org/schemas/mcp-approval.schema.json), [`skill-approval.schema.json`](https://ai.open-vsx.org/schemas/skill-approval.schema.json), [`plugin-approval.schema.json`](https://ai.open-vsx.org/schemas/plugin-approval.schema.json)).

A tool integration typically fetches `organizations.json` + its own `tools/<tool-id>.json`.

## Reliability

The consolidation pipeline follows a build-or-nothing approach:

1. **Collect** — Clone all vendor repos and validate their data. Any failure (repo unreachable, invalid data) fails the build.
2. **Enrich MCP** — Look up each server in the Anthropic MCP registry. Registry errors (down, rate-limited, etc.) fail the build. A server not found in the registry is fine — it's included with `mcpRegistryVerified: false`, then falls back to any vendor-supplied `metadata`/`selfPublished` (see [Vendor-supplied metadata](#vendor-supplied-metadata-for-servers-not-in-the-anthropic-registry)). Two different vendors self-attesting as publisher for the same server is treated the same as a registry error — it fails the build.
3. **Enrich Skills** — Fetch each skill's source via sparse git checkout to extract metadata and compute a content hash. Unreachable sources are skipped with a warning — the skill is omitted from the output until its source is reachable again.
4. **Enrich Plugins** — Fetch each plugin's directory via sparse git checkout to read its manifest, enumerate contained skills and MCP servers, and compute a content hash. Unreachable sources are skipped with a warning — the plugin is omitted from the output until its source is reachable again.
5. **Write & Deploy** — Only reached if the previous steps succeed.

If collection or MCP enrichment fails, the build stops and the previous deployment stays live.

## Links

- [Development guide](DEVELOPMENT.md) — scripts, local development, GitHub Actions
- [Theia vendor repo](https://github.com/eclipsefdn-ai-registry/ai-registry-theia) — reference vendor implementation
- [MCP approval skill](skills/create-mcp-approval/SKILL.md) — AI agent skill for generating MCP approval files
- [Skill approval skill](skills/create-skill-approval/SKILL.md) — AI agent skill for generating skill approval files
- [Plugin approval skill](skills/create-plugin-approval/SKILL.md) — AI agent skill for generating plugin approval files
- [JSON schemas](schemas/) — organization and approval file schemas

## License

This project is licensed under the [Eclipse Public License 2.0](LICENSE).
