---
name: create-plugin-approval
description: >
  Generate Agent Plugin approval files for the AI Registry.
  Use this when a user wants to add a plugin approval to their vendor repository.
argument-hint: "<source-url> [path] — the git repo URL and optional path to the plugin folder"
---

# AI Registry — Plugin Approval Generator

You are helping the user create an Agent Plugin approval file for the AI Registry.

## What is the AI Registry?

The AI Registry is a vendor-neutral, federated trust registry for AI artifacts.
Vendors maintain their own repositories with approval files for MCP servers, Agent Skills, and Agent Plugins they endorse.

## What is an Agent Plugin?

An Agent Plugin is a directory following the [agent-plugins.org](https://agent-plugins.org) open standard: a `plugin.json` manifest, plus optional `skills/<name>/SKILL.md` folders and an `mcp.json` file declaring MCP servers. It's a portable bundle of the same Agent Skills and MCP server component types the registry already tracks, packaged together under one identity.

## Your Workflow

1. **Identify the plugin source** — The user provides a git repository URL and optionally a path within it (e.g., `https://github.com/gemini-cli-extensions/bigquery-data-analytics.git` with no path, since `plugin.json` sits at the repo root).
2. **Verify the plugin exists** — Clone or fetch the source and confirm `plugin.json` exists at the given location. Read it to extract the plugin's `name`, `description`, `version`, `author`, `homepage`, and `keywords`. Also check for a `skills/` directory and an `mcp.json` file to see what the plugin contains — this isn't required for the approval file itself, but helps you sanity-check the source.
3. **Determine the pluginId** — Construct a reverse-domain identifier from the source. For GitHub repos, follow the pattern: `io.github.<owner>/<plugin-name>`. For example, a plugin at `github.com/gemini-cli-extensions/bigquery-data-analytics` becomes `io.github.gemini-cli-extensions/bigquery-data-analytics`.
4. **Read the vendor's organization.json** — Find `organization.json` in the repo root to determine the vendor ID and available tools.
5. **Read the approval schema** — Fetch the schema from `https://ai.open-vsx.org/schemas/plugin-approval.schema.json` to ensure you follow the current contract.
6. **Read tool-specific install docs** — Check `ai-docs/` in the repo. If it exists, read it to understand how this vendor's tools expect plugin installation to be configured.
7. **Read an existing approval as reference** — Look for existing files in the `plugins/` directory. If none exist, use the example below.
8. **Generate the approval file** — Create a JSON file in the `plugins/` directory following the schema and the naming convention below.
9. **Validate** — Run `npm run validate` to check the file.

## Naming Convention

The approval file must be named `<pluginId>.json` with all `/` characters replaced by `--`.

Example: Plugin ID `io.github.gemini-cli-extensions/bigquery-data-analytics` becomes filename `io.github.gemini-cli-extensions--bigquery-data-analytics.json`.

## Key Rules

- **pluginId** (required): Reverse-domain identifier for the plugin (e.g., `io.github.gemini-cli-extensions/bigquery-data-analytics`).
- **date** (required): Today's date in ISO format (YYYY-MM-DD).
- **source** (required): Object with `url` (git repo URL) and optionally `path` — the directory within the repo containing `plugin.json`. Omit `path` if the plugin is at the repository root. Unlike skill approvals, this does not support globs or arrays — one approval targets exactly one plugin directory.
- **installConfigs** (optional): Tool-specific installation configurations. Include one entry per tool declared in organization.json. Omit entirely if the organization has no tools.
  - **tool**: Tool ID this config targets (must match a tool in organization.json).
  - **installUrl**: Deep-link URL for one-click install (optional).
  - **config**: Free-form tool-specific configuration object (e.g. a Docker image/tag/port/env for container-delivered plugins).
  - **instructions**: Human-readable setup instructions.

## Example: Plugin at Repository Root

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

## Example: Plugin in a Subdirectory, with a Tool-Specific Config

```json
{
  "pluginId": "eu.example-org/data-tools",
  "date": "2026-08-07",
  "source": {
    "url": "https://github.com/example-org/plugins-monorepo.git",
    "path": "plugins/data-tools"
  },
  "installConfigs": [
    {
      "tool": "your-tool",
      "config": {
        "image": "registry.example.org/example-org/data-tools",
        "tag": "latest"
      },
      "instructions": "Run via your-tool's plugin runtime; pull the image and mount as a plugin."
    }
  ]
}
```

## What Consolidation Does With This

During consolidation, the whole plugin directory (not just `plugin.json`) is fetched via sparse git checkout so that `skills/**` and `mcp.json` are materialized alongside the manifest. From this, the registry derives:

- `name`, `description`, `version`, `author`, `homepage`, `keywords` — from `plugin.json`.
- `containedSkills` — discovered from `skills/*/SKILL.md`, each with `name`, `description`, and `path`.
- `containedMcpServers` — discovered from `mcp.json`'s `mcpServers` map, each with `name` and `transport`.
- `contentHash` — a hash covering the whole plugin directory, so it changes whenever any contained file changes.

You do not need to enumerate any of this in the approval file — it's populated automatically from the source.
