---
name: create-skill-approval
description: >
  Generate Agent Skill approval files for the AI Registry.
  Use this when a user wants to add a skill approval to their vendor repository.
argument-hint: "<source-url> [path] — the git repo URL and optional path to the skill folder"
---

# AI Registry — Skill Approval Generator

You are helping the user create an Agent Skill approval file for the AI Registry.

## What is the AI Registry?

The AI Registry is a vendor-neutral, federated trust registry for AI artifacts.
Vendors maintain their own repositories with approval files for MCP servers and Agent Skills they endorse.

## What is an Agent Skill?

An Agent Skill is a folder containing a `SKILL.md` file with instructions that AI agents follow to perform specific tasks. Skills follow the [Agent Skills open standard](https://agentskills.io). The folder may also contain scripts, references, and assets.

## Your Workflow

1. **Identify the skill source** — The user provides a git repository URL and optionally a path within it (e.g., `https://github.com/anthropics/skills.git` with path `skills/code-review`).
2. **Verify the skill exists** — Clone or fetch the source and confirm `SKILL.md` exists at the given location. Read the `SKILL.md` to extract the skill's `name` and `description` from its YAML frontmatter.
3. **Determine the skillId** — Construct a reverse-domain identifier from the source. For GitHub repos, follow the pattern: `io.github.<owner>/<skill-name>`. For example, a skill at `github.com/anthropics/skills` in folder `skills/code-review` becomes `io.github.anthropics/code-review`.
4. **Read the vendor's organization.json** — Find `organization.json` in the repo root to determine the vendor ID and available tools.
5. **Read the approval schema** — Fetch the schema from `https://eclipsefdn-ai-registry.github.io/ai-registry-core/schemas/skill-approval.schema.json` to ensure you follow the current contract.
6. **Read tool-specific install docs** — Check `ai-docs/skill-approval.md` in the repo. If it exists, read it to understand how to construct the `installUrl` for this vendor's tools.
7. **Read an existing approval as reference** — Look for existing files in the `skills/` directory. If none exist, use the example below.
8. **Generate the approval file** — Create a JSON file in the `skills/` directory following the schema and the naming convention below.
9. **Validate** — Run `npm run validate` to check the file.

## Naming Convention

The approval file must be named `<skillId>.json` with all `/` characters replaced by `--`.

Example: Skill ID `io.github.anthropics/code-review` becomes filename `io.github.anthropics--code-review.json`.

## Key Rules

- **skillId** (required): Reverse-domain identifier for the skill (e.g., `io.github.anthropics/code-review`).
- **date** (required): Today's date in ISO format (YYYY-MM-DD).
- **source** (required): Object with `url` (git repo URL) and optionally `path` (folder within the repo). Omit `path` if the skill is at the repository root.
- **installConfigs** (optional): Tool-specific installation configurations. Include one entry per tool declared in organization.json. Omit entirely if the organization has no tools.
  - **tool**: Tool ID this config targets (must match a tool in organization.json).
  - **installUrl**: Deep-link URL for one-click install (optional, tool-specific protocol).

## Example Approval File

```json
{
  "skillId": "io.github.anthropics/code-review",
  "date": "2026-06-01",
  "source": {
    "url": "https://github.com/anthropics/skills.git",
    "path": "skills/code-review"
  },
  "installConfigs": [
    {
      "tool": "theia-ide",
      "installUrl": "theia://install-skill?id=io.github.anthropics/code-review"
    },
    {
      "tool": "theia-ide-next",
      "installUrl": "theia-next://install-skill?id=io.github.anthropics/code-review"
    }
  ]
}
```

## installUrl Pattern

If the vendor's tools support deep-link installation, construct the URL using the skill's `skillId`:

```
<scheme>://install-skill?id=<skillId>
```

The scheme and exact URL format depend on the vendor's tools. Check `ai-docs/` for documentation. If no skill-specific docs exist, adapt the MCP install URL pattern (replacing `install-mcp` with `install-skill`).
