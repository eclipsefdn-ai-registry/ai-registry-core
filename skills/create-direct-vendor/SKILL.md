---
name: create-direct-vendor
description: >
  Scaffold a brand-new vendor repo for the AI Registry for an organization that is directly
  participating and self-approving its own artifacts (Agent Skills, MCP servers, Agent Plugins,
  A2A agents) — no research or verification phase, since the requester speaks authoritatively for
  the vendor. Use this when onboarding an organization (or the AI Registry project itself) that
  wants to self-declare and self-approve its own content, as opposed to a third party being
  pre-seeded from public research — e.g. "create a vendor repo for Acme Corp", "onboard our own
  project as a vendor", "set up a direct vendor repo for the AI Registry's own skills".
argument-hint: '<org-id> <org-name> — e.g. "ai-registry" "AI Registry"'
---

# AI Registry — Direct Vendor Generator

You are helping the user scaffold a **direct vendor repo**: a repo for an organization that is
itself participating in the registry, self-declaring its own identity and self-approving its own
artifacts. `ai-registry-eclipsesource`, `ai-registry-mosaico`, and `ai-registry-theia` are existing
examples — read one end-to-end before starting if you want a concrete reference.

Unlike `create-inferred-vendor`, there's no research or verification phase here: the organization
(or a project describing itself) is the one telling you what it publishes, so what it says is
authoritative. If instead you're being asked to pre-seed a vendor from public research without
their direct involvement, use `create-inferred-vendor` instead.

## Your Workflow

1. **Gather organization metadata** from the user: `id` (lowercase, alphanumeric, hyphens),
   `name`, `description`, `website`, and optionally `color` and `tools` (only if the organization
   provides an installable tool itself — most don't).
2. **Gather artifact sources** — which Agent Skill/MCP server/Agent Plugin/A2A agent repos (and
   paths within them) to approve. Either the user tells you directly, or you read the
   organization's own repo structure (e.g. a `skills/` directory of `SKILL.md` folders) to find
   them — there's no need to search the wider web the way `create-inferred-vendor` does, since the
   source is already known and self-declared.
3. **Scaffold the repo and generate approval files** — follow `vendor-repo-scaffolding.md` in this
   directory for repo setup, file templates, approval-file conventions, validation, and commit
   steps. For `organization.json`, omit `inferred` and use a plain, factual description of the
   organization/project (no disclaimer). For the README, a plain one-paragraph body is enough — no
   disclaimer, no per-source justification.
4. **Validate and commit locally only** — per `vendor-repo-scaffolding.md`. Do **not** push, and do
   **not** register the vendor in `vendors.json` — see that file's "What NOT to do automatically"
   section.
5. **Wire up trust, if asked** — a direct vendor is exactly the kind of organization other vendors
   delegate trust to (see the `trusts` field in `schemas/organization.schema.json`). If the user
   wants one or more existing vendors to trust this new org's approvals for a given artifact type,
   for each such vendor repo:
   - `git status` first — if it's dirty or not on a clean `main`, skip it and report, don't touch
     it (same rule `vendor-audit-conventions.md` uses for the audit skills).
   - Otherwise `git checkout main && git pull --ff-only`, then create a new feature branch off
     main — don't commit trust changes directly to `main`.
   - Add an entry to that vendor's `organization.json` `trusts` array:
     `{ "org": "<new-vendor-id>", "artifactTypes": { "<type>": {} } }` — if an entry for this org
     already exists, add the missing artifact type to it instead of adding a duplicate entry.
   - If a direct approval file for this org's content already exists in the trusting vendor's own
     `skills/`/`mcp/`/`plugins/`/`agents/` directory (predating the new vendor repo), remove it as
     part of the same commit — the new `trusts` entry supersedes it.
   - Commit locally only, same plain/factual/no-AI-attribution convention as everywhere else. Never
     push someone else's vendor repo without being asked to.
