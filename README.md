# AI Registry

> **Preview** — This registry is currently in preview. Data, APIs, and the website may change as we iterate on the concept.

A vendor-neutral, federated trust registry for AI artifacts, hosted at the Eclipse Foundation. Supports [Model Context Protocol](https://modelcontextprotocol.io) (MCP) servers and [Agent Skills](https://agentskills.io).

## How It Works

The registry follows a federated model: **vendors** maintain their own repositories with approval files for AI artifacts (MCP servers and Agent Skills) they endorse. A **central repository** consolidates all vendor data into a single JSON file that tools can consume.

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

**The central repo** provides:

- JSON schemas that define the contract for all participants
- A consolidation pipeline that pulls, validates, and merges vendor data
- Metadata enrichment from the Anthropic MCP registry (server names, descriptions, verification status)
- Metadata enrichment from skill source repos (name, description, content hash)
- A static website deployed to GitHub Pages for browsing the registry
- Claude Code skills for generating [MCP](skills/create-mcp-approval/SKILL.md) and [skill](skills/create-skill-approval/SKILL.md) approval files

## Repositories

| Repository                                                                       | Purpose                                                                                        |
| :------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------- |
| [ai-registry-core](https://github.com/eclipsefdn-ai-registry/ai-registry-core)   | Central repo — schemas, consolidation, website, AI skill ([development guide](DEVELOPMENT.md)) |
| [ai-registry-theia](https://github.com/eclipsefdn-ai-registry/ai-registry-theia) | Theia IDE vendor repo — serves as the reference implementation for vendor repositories         |

## Data Flow

1. A vendor creates approval files (manually or using the Claude Code skills for [MCP](skills/create-mcp-approval/SKILL.md) or [skills](skills/create-skill-approval/SKILL.md))
2. Vendor commits and pushes — CI validates against the central schemas
3. On successful push to main, the vendor CI triggers the central consolidation workflow
4. Consolidation pulls all registered vendor repos, validates, enriches with MCP registry metadata and skill source metadata
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

### Validation

Validation runs in CI by checking out the central repo and running its CLI against your vendor repo.

To validate locally from the vendor repo:

```bash
npm run validate           # standalone — clones core repo automatically
npm run validate:local     # fast — requires core repo checked out as sibling
```

See the [Theia vendor repo](https://github.com/eclipsefdn-ai-registry/ai-registry-theia) for a complete reference implementation including the CI workflow.

### Becoming a vendor

1. Create a new repository following the structure above
2. Add your `organization.json` and approval files in `mcp/` and/or `skills/`
3. Set up CI using the [validate workflow](https://github.com/eclipsefdn-ai-registry/ai-registry-theia/blob/main/.github/workflows/validate.yml) from the Theia repo as a template
4. Request registration by opening a PR on this repo that adds your entry to `vendors.json`

## API

The registry is served as static JSON files from the registry website. Base URL:

```
https://ai.open-vsx.org/api/v1/
```

| Endpoint                                                                  | Description                                                                                              |
| :------------------------------------------------------------------------ | :------------------------------------------------------------------------------------------------------- |
| [`all.json`](https://ai.open-vsx.org/api/v1/all.json)                     | Full registry — organizations, tools, MCP servers, and skills with merged approvals                      |
| [`organizations.json`](https://ai.open-vsx.org/api/v1/organizations.json) | All organizations and their tools                                                                        |
| `tools/<tool-id>.json`                                                    | Per-tool view — servers and skills approved for that tool, with install configs for other tools stripped |

Schemas are also available at `/schemas/` (e.g., [`mcp-approval.schema.json`](https://ai.open-vsx.org/schemas/mcp-approval.schema.json), [`skill-approval.schema.json`](https://ai.open-vsx.org/schemas/skill-approval.schema.json)).

A tool integration typically fetches `organizations.json` + its own `tools/<tool-id>.json`.

## Reliability

The consolidation pipeline follows a build-or-nothing approach:

1. **Collect** — Clone all vendor repos and validate their data. Any failure (repo unreachable, invalid data) fails the build.
2. **Enrich MCP** — Look up each server in the Anthropic MCP registry. Registry errors (down, rate-limited, etc.) fail the build. A server not found in the registry is fine — it's included with `mcpRegistryVerified: false`.
3. **Enrich Skills** — Fetch each skill's source via sparse git checkout to extract metadata and compute a content hash. Unreachable sources are skipped with a warning — the skill is omitted from the output until its source is reachable again.
4. **Write & Deploy** — Only reached if the previous steps succeed.

If collection or MCP enrichment fails, the build stops and the previous deployment stays live.

## Links

- [Development guide](DEVELOPMENT.md) — scripts, local development, GitHub Actions
- [Theia vendor repo](https://github.com/eclipsefdn-ai-registry/ai-registry-theia) — reference vendor implementation
- [MCP approval skill](skills/create-mcp-approval/SKILL.md) — AI agent skill for generating MCP approval files
- [Skill approval skill](skills/create-skill-approval/SKILL.md) — AI agent skill for generating skill approval files
- [JSON schemas](schemas/) — organization and approval file schemas
