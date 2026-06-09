---
name: create-mcp-approval
description: >
  Generate MCP server approval files for the AI Registry.
  Use this when a user wants to add an MCP server approval to their vendor repository.
argument-hint: "<serverId> — the MCP server identifier (e.g., io.github.ChromeDevTools/chrome-devtools-mcp)"
---

# AI Registry — Approval Generator

You are helping the user create an MCP server approval file for the AI Registry.

## What is the AI Registry?

The AI Registry is a vendor-neutral, federated trust registry for Model Context Protocol (MCP) servers.
Vendors maintain their own repositories with approval files for MCP servers they endorse.

## Your Workflow

1. **Identify the MCP server** — The user provides a server ID (e.g., `io.github.ChromeDevTools/chrome-devtools-mcp`).
2. **Verify the server exists** — Fetch `https://registry.modelcontextprotocol.io/v0.1/servers/<serverId>/versions` (URL-encode the serverId). If the server is not found (404), warn the user but allow them to proceed.
3. **Read the vendor's organization.json** — Find `organization.json` in the repo root to determine the vendor ID and available tools.
4. **Read the approval schema** — Fetch the schema from `https://eclipsefdn-ai-registry.github.io/ai-registry-core/schemas/mcp-approval.schema.json` to ensure you follow the current contract.
5. **Read tool-specific config docs** — Check `ai-docs/mcp-approval.md` in the repo. If it exists, read it to understand how to construct the `config` and `installUrl` for this vendor's tools.
6. **Read an existing approval as reference** — Look for existing files in the `mcp/` directory. If none exist, fetch the example from `https://raw.githubusercontent.com/eclipsefdn-ai-registry/ai-registry-theia/main/mcp/io.github.ChromeDevTools--chrome-devtools-mcp.json`.
7. **Generate the approval file** — Create a JSON file in the `mcp/` directory following the schema, the tool-specific docs, and the naming convention below.
8. **Validate** — Run `npm run validate` to check the file.

## Naming Convention

The approval file must be named `<serverId>.json` with all `/` characters replaced by `--`.

Example: Server ID `io.github.ChromeDevTools/chrome-devtools-mcp` becomes filename `io.github.ChromeDevTools--chrome-devtools-mcp.json`.

## Key Rules

- **serverId** (required): Must match a server in the Anthropic MCP registry.
- **date** (required): Today's date in ISO format (YYYY-MM-DD).
- **version** (optional): Pinned server version (e.g., `1.0.1`). Omit to use the latest version from the MCP registry. Only set this when the vendor explicitly needs to pin a specific version (e.g., a newer version has a known issue). When a version is pinned, the install config (e.g., `args` in the config object) should reference that same version instead of `@latest`.
- **installConfigs** (optional): Tool-specific installation configurations. Include one entry per tool declared in organization.json. Omit entirely if the organization has no tools (approval-only without install configuration).
  - **tool**: Tool ID this config targets (must match a tool in organization.json).
  - **config**: Tool-specific configuration object (e.g., MCP server settings for stdio).
  - **instructions**: Human-readable setup instructions.
  - **installUrl**: Deep-link URL for one-click install (optional).
  - **openVsxUrl**: Link to an Open VSX extension (optional).

## Version Behavior

During consolidation, the registry enriches each approval with version information:

- **No `version` field** (default): The latest version is fetched from the Anthropic MCP registry and set on the approval. The install config should use `@latest` in package references.
- **`version` set** (pinned): The vendor has pinned a specific version, typically because the install config references that exact version. The consolidation step preserves the pinned version and does not overwrite it with the registry's latest. This lets consumers see the actual version that will be installed.
