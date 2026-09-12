---
name: audit-vendor-sources
description: >
  Weekly full discovery sweep across every AI Registry vendor for newly published Agent Plugins,
  marketplaces, Agent Skills, and MCP servers, combined into a single run — one subagent per
  vendor, one feature branch with one commit per vendor covering everything found (never pushed).
  Use as the single weekly trigger instead of running audit-agent-plugin-sources,
  audit-skill-sources, and audit-mcp-server-sources separately.
---

# AI Registry — Full Vendor Source Audit (orchestrator)

Combines the three per-artifact-type discovery audits — `audit-agent-plugin-sources`,
`audit-skill-sources`, `audit-mcp-server-sources` — into one weekly run: one trigger, one subagent
per vendor, one feature branch with one commit per vendor covering everything that audit found for
it that week.

**REQUIRED BACKGROUND:** Read `skills/vendor-audit-conventions.md` and all three type-specific
`SKILL.md` files first. This file only covers the orchestration layer — how the three are combined
per vendor — not the search/verification specifics, which stay exactly as documented in each of
those three.

## Why fan out per vendor, not per artifact type

Git branch/commit operations on one clone can't be parallelized safely. Fanning out per
artifact-type instead would mean three agents racing to write to (or needing to merge into) the
same vendor branch. Fanning out per vendor avoids that entirely — each vendor's subagent owns that
vendor's clone exclusively for the run, and the three artifact types just become three research
passes inside one subagent instead of three separate ones.

## Workflow

1. **Preflight (main thread, not delegated).** For every vendor in `vendors.json`, check
   `git status`/current branch. Report dirty/non-main vendors as their own message, before
   dispatching anything — per `vendor-audit-conventions.md`'s preflight rule. Exclude those
   vendors from dispatch this run.
2. **Load all three caches (main thread).** Read `known-vendor-sources.json` from
   `audit-agent-plugin-sources/`, `audit-skill-sources/`, and `audit-mcp-server-sources/`. Pass
   each clean vendor's relevant slice of all three into that vendor's dispatch prompt, so the
   subagent starts from what's already known instead of rediscovering it.
3. **Dispatch one subagent per clean vendor**, batched in parallel (multiple `Agent` calls in a
   single message). Each subagent's prompt must be self-contained and instruct it to:
   - Re-confirm the repo is still clean right before touching it (state may have changed between
     the preflight and dispatch) — skip and report if not.
   - Run the plugin/marketplace research steps from `audit-agent-plugin-sources/SKILL.md`, the
     skill research steps from `audit-skill-sources/SKILL.md`, and the MCP research steps from
     `audit-mcp-server-sources/SKILL.md`, in any order — these are independent reads, safe to
     interleave or run sequentially within the subagent.
   - Verify every candidate against `vendor-audit-conventions.md`'s checklist (same bar across all
     three types, including the same-org-family rule).
   - Write every surviving finding to disk (`plugins/*.json`, `skills/*.json`, `mcp/*.json` as
     applicable) without committing yet.
   - Run `npm run validate-vendor -- ../ai-registry-<id>` **once**, covering everything written.
     Drop any file that produces an ERROR (not a WARNING) and note why; keep the rest.
   - If anything survived: create **one** branch `vendor-audit-<YYYY-MM-DD>`, **one** commit
     listing everything added across all three types (plain, factual message, no AI attribution,
     matching that repo's existing history), **never push**.
   - **Not** edit any `known-vendor-sources.json` or `SKILL.md` itself. Instead, return as
     structured data in its final report: per-type cache deltas (`githubOrgs` learned,
     `knownSources` additions, `rejected` entries with reasons) and any process-level learning it
     thinks a specific skill file should encode. Applying these centrally after all subagents
     finish avoids 13 parallel writers racing on the same handful of shared files.
4. **Aggregate (main thread), after every subagent returns.** Apply each vendor's returned cache
   deltas to the three `known-vendor-sources.json` files, one at a time, in the main thread. Then,
   per `vendor-audit-conventions.md`'s self-update rule, decide whether any returned process-level
   learning generalizes enough to fold into the relevant `SKILL.md` (or `vendor-audit-conventions.md`
   if it's generic across all three types) — do this centrally; subagents never touch these files
   directly, which is exactly what avoids the race.
5. **Report a single consolidated summary**: the preflight result, then per vendor — branch +
   commit summary (counts per type), or "skipped: dirty" / "nothing new" — and which skill file(s)
   got a self-update this run, or that nothing generalized.

## Branch and commit convention

- Branch name: `vendor-audit-<YYYY-MM-DD>` — distinct from the individual audits'
  `plugin-audit-*`/`skill-audit-*`/`mcp-audit-*` prefixes, since this branch always covers
  whichever of the three types found something, together.
- One commit per vendor, message summarizing everything added across types, e.g. "Add 2 plugin,
  1 skill, and 3 MCP server approvals from weekly audit".
- Never push — same as every other vendor-audit skill.

## Rules

Same as `vendor-audit-conventions.md`, plus: bounded effort scales with covering three types in one
pass — aim for ≤15 queries/vendor total across all three research passes combined (roughly the sum
of each type-specific skill's own budget), not three separate full budgets stacked on top of each
other.
