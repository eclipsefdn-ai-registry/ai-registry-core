# AI Registry

> **Preview** — This registry is currently in preview. Data, APIs, and the website may change as we iterate on the concept.

A vendor-neutral, federated trust registry for AI artifacts, hosted at the Eclipse Foundation. Currently focused on [Model Context Protocol](https://modelcontextprotocol.io) (MCP) servers, with plans to support additional artifact types such as skills in the future.

## How It Works

The registry follows a federated model: **vendors** maintain their own repositories with approval files for AI artifacts (currently MCP servers) they endorse. A **central repository** consolidates all vendor data into a single JSON file that tools can consume.

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

- `organization.json` — vendor identity and tools
- `mcp/*.json` — one approval file per endorsed MCP server, with tool-specific install configurations

**The central repo** provides:

- JSON schemas that define the contract for all participants
- A consolidation pipeline that pulls, validates, and merges vendor data
- Metadata enrichment from the Anthropic MCP registry (server names, descriptions, verification status)
- A static website deployed to GitHub Pages for browsing the registry
- A Claude Code skill for generating approval files

## Repositories

| Repository                                                                       | Purpose                                                                                        |
| :------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------------------- |
| [ai-registry-core](https://github.com/eclipsefdn-ai-registry/ai-registry-core)   | Central repo — schemas, consolidation, website, AI skill ([development guide](DEVELOPMENT.md)) |
| [ai-registry-theia](https://github.com/eclipsefdn-ai-registry/ai-registry-theia) | Theia IDE vendor repo — serves as the reference implementation for vendor repositories         |

## Data Flow

1. A vendor creates approval files (manually or using the [Claude Code skill](skills/create-mcp-approval/SKILL.md))
2. Vendor commits and pushes — CI validates against the central schemas
3. On successful push to main, the vendor CI triggers the central consolidation workflow
4. Consolidation pulls all registered vendor repos, validates, and enriches with Anthropic MCP registry metadata
5. The website and consolidated JSON are built and deployed to GitHub Pages
6. Tools (e.g., Theia IDE) consume the consolidated JSON at a stable URL

## Vendor Guide

### Repository structure

A vendor repo is a pure data repository — no dependencies, no build steps. It contains:

```
organization.json          # vendor identity and tools
mcp/
  <server-id>.json         # one file per approved MCP server
.github/workflows/
  validate.yml             # CI that runs the central validation
```

### organization.json

Declares your organization and the tools you provide. See the [organization schema](schemas/organization.schema.json) for the full field reference.

```json
{
  "id": "your-org",
  "name": "Your Organization",
  "description": "Short description",
  "website": "https://example.com",
  "color": "#1a1f71",
  "tools": [{ "id": "your-tool", "name": "Your Tool" }]
}
```

### Approval files

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

The `serverId` must reference a server in the [Anthropic MCP registry](https://registry.modelcontextprotocol.io). Server metadata (name, description) is retrieved automatically during consolidation — you only supply the ID and install configuration.

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
2. Add your `organization.json` and approval files in `mcp/`
3. Set up CI using the [validate workflow](https://github.com/eclipsefdn-ai-registry/ai-registry-theia/blob/main/.github/workflows/validate.yml) from the Theia repo as a template
4. Request registration by opening a PR on this repo that adds your entry to `vendors.json`

## API

The registry is served as static JSON files from GitHub Pages. Base URL:

```
https://eclipsefdn-ai-registry.github.io/ai-registry-core/api/v1/
```

| Endpoint                                                                                                    | Description                                                                                        |
| :---------------------------------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------- |
| [`all.json`](https://eclipsefdn-ai-registry.github.io/ai-registry-core/api/v1/all.json)                     | Full registry — organizations, tools, and all MCP servers with merged approvals                    |
| [`organizations.json`](https://eclipsefdn-ai-registry.github.io/ai-registry-core/api/v1/organizations.json) | All organizations and their tools                                                                  |
| `<tool-id>.json`                                                                                            | Per-tool view — only servers approved for that tool, with install configs for other tools stripped |

Schemas are also available at `/schemas/` (e.g., [`mcp-approval.schema.json`](https://eclipsefdn-ai-registry.github.io/ai-registry-core/schemas/mcp-approval.schema.json)).

A tool integration typically fetches `organizations.json` + its own `<tool-id>.json`.

Additional artifact types (e.g., skills) will be added in future versions.

## Reliability

The consolidation pipeline follows a build-or-nothing approach:

1. **Collect** — Clone all vendor repos and validate their data. Any failure (repo unreachable, invalid data) fails the build.
2. **Enrich** — Look up each server in the Anthropic MCP registry. Registry errors (down, rate-limited, etc.) fail the build. A server not found in the registry is fine — it's included with `mcpRegistryVerified: false`.
3. **Write & Deploy** — Only reached if both previous steps fully succeed.

If any step fails, the build stops and the previous deployment stays live. The registry never publishes partial or degraded data.

## Links

- [Development guide](DEVELOPMENT.md) — scripts, local development, GitHub Actions
- [Theia vendor repo](https://github.com/eclipsefdn-ai-registry/ai-registry-theia) — reference vendor implementation
- [Claude Code skill](skills/create-mcp-approval/SKILL.md) — AI agent skill for generating approval files
- [JSON schemas](schemas/) — organization and approval file schemas
