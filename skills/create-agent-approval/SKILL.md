---
name: create-agent-approval
description: >
  Generate A2A agent approval files for the AI Registry.
  Use this when a user wants to add an agent approval to their vendor repository.
argument-hint: "<agent-card-url> — the direct, fetchable URL to the agent's agent_card.json"
---

# AI Registry — Agent Approval Generator

You are helping the user create an A2A agent approval file for the AI Registry.

## What is the AI Registry?

The AI Registry is a vendor-neutral, federated trust registry for AI artifacts.
Vendors maintain their own repositories with approval files for MCP servers, Agent Skills, Agent Plugins, and A2A agents they endorse.

## What is an A2A Agent?

An A2A agent is an agent implementing the [Agent2Agent (A2A) protocol](https://a2a-protocol.org), identified by a standard **Agent Card** JSON document (conventionally at `/.well-known/agent-card.json` or committed alongside the agent's source) describing its `name`, `description`, capabilities, and skills.

## Your Workflow

1. **Identify the agent card's URL** — The user provides the direct, fetchable URL to the agent's `agent_card.json` (e.g., `https://gitlab.eclipse.org/eclipse-research-labs/mosaico-project/mosaico-ip-agent/-/raw/main/src/mosaico_ip_agent/agent_card.json`).
2. **Verify the agent card exists** — Fetch the URL and confirm it returns valid JSON with `name` and `description` fields.
3. **Determine the agentId** — Construct a reverse-domain identifier from the agent's home domain. For example, an agent hosted under `mosaico-project.eu` becomes `eu.mosaico-project/<agent-name>`.
4. **Read the vendor's organization.json** — Find `organization.json` in the repo root to determine the vendor ID and available tools.
5. **Read the approval schema** — Fetch the schema from `https://ai.open-vsx.org/schemas/agent-approval.schema.json` to ensure you follow the current contract.
6. **Read tool-specific install docs** — Check `ai-docs/` in the repo. If it exists, read it to understand how this vendor's tools expect agent installation to be configured.
7. **Read an existing approval as reference** — Look for existing files in the `agents/` directory. If none exist, use the examples below.
8. **Generate the approval file** — Create a JSON file in the `agents/` directory following the schema and the naming convention below.
9. **Validate** — Run `npm run validate` to check the file.

## Naming Convention

The approval file must be named `<agentId>.json` with all `/` characters replaced by `--`.

Example: Agent ID `eu.mosaico-project/ip-solution-agent` becomes filename `eu.mosaico-project--ip-solution-agent.json`.

## Key Rules

- **agentId** (required): Reverse-domain identifier for the agent (e.g., `eu.mosaico-project/ip-solution-agent`).
- **date** (required): Today's date in ISO format (YYYY-MM-DD).
- **source** (required): Object with `url` only — the direct, fetchable URL to the agent's `agent_card.json`. Unlike plugins and skills, **there is no `path` field for agents**: the URL must point directly at the JSON file itself, not at a repo or directory. No git clone, no glob, no multi-entry support.
- **installConfigs** (optional): Tool-specific installation configurations. Include one entry per tool declared in organization.json. Omit entirely if the organization has no tools.
  - **tool**: Tool ID this config targets (must match a tool in organization.json).
  - **installUrl**: Deep-link URL for one-click install (optional). **Omit if the tool declares `agentInstallUrlPrefix` in `organization.json`** — consolidation generates it automatically as `prefix + agentId`. Set it explicitly only when the tool has no prefix or you need a non-standard URL.
  - **config**: Free-form tool-specific configuration object (e.g. a Docker image/tag/port for container-delivered agents).
  - **instructions**: Human-readable setup instructions.

## Example: Agent Approval

```json
{
  "agentId": "eu.mosaico-project/ip-solution-agent",
  "date": "2026-08-11",
  "source": {
    "url": "https://gitlab.eclipse.org/eclipse-research-labs/mosaico-project/mosaico-ip-agent/-/raw/main/src/mosaico_ip_agent/agent_card.json"
  }
}
```

## Example: Agent Approval with Docker installConfigs

```json
{
  "agentId": "eu.mosaico-project/ip-solution-agent",
  "date": "2026-08-11",
  "source": {
    "url": "https://gitlab.eclipse.org/eclipse-research-labs/mosaico-project/mosaico-ip-agent/-/raw/main/src/mosaico_ip_agent/agent_card.json"
  },
  "installConfigs": [
    {
      "tool": "your-tool",
      "config": {
        "image": "registry.eclipse.org/mosaico-project/ip-solution-agent",
        "tag": "latest",
        "port": 8080
      },
      "instructions": "Run via your-tool's agent runtime; pull the image and expose the A2A port."
    }
  ]
}
```

`name`, `description`, and a `contentHash` are derived automatically from the fetched agent card during consolidation, so the vendor doesn't need to supply them.

## installUrl Pattern

Check whether the tool declares `agentInstallUrlPrefix` in `organization.json`. If it does, omit `installUrl` from the approval file — consolidation will generate it as `prefix + agentId`.

If no prefix is configured, construct the URL manually using the agent's `agentId`:

```
<scheme>://install-agent?id=<agentId>
```

The scheme and exact URL format depend on the vendor's tools. Check `ai-docs/` for documentation. If no agent-specific docs exist, adapt the MCP/skill/plugin install URL pattern (replacing `install-mcp`/`install-skill`/`install-plugin` with `install-agent`).
