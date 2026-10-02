---
name: audit-vendor-sources
description: >
  Weekly discovery sweep across every AI Registry vendor for newly published Agent Plugins,
  marketplaces, Agent Skills, and MCP servers — one subagent per vendor, one feature branch with
  one commit per vendor covering everything found (never pushed). Runs all three artifact types by
  default; pass an argument ("plugins", "skills", or "mcp") to scope a run to just one type. Use as
  the single trigger for vendor source discovery, whether running the full weekly sweep or a
  narrower one-off check.
---

# AI Registry — Vendor Source Audit

Recurring (intended: weekly) research pass over every vendor already in the registry, looking for
Agent Plugins, marketplaces, Agent Skills, and MCP servers each vendor has published since the last
run. This is discovery, not onboarding — it only touches vendors already listed in `vendors.json`;
use `create-inferred-vendor` to add a brand-new vendor.

All file paths below (`references/...`, `cache/...`) are relative to this skill's own root
directory, not the invoking repo — this skill is self-contained and portable on its own. The one
exception is subagent dispatch prompts (workflow step 3), which necessarily use full paths relative
to the `ai-registry-core` repo root, since a dispatched subagent operates directly on that repo's
files, not through this skill's own loading mechanism.

## Scope

Reads an optional argument to decide which artifact type(s) to cover this run:

- No argument (or `"all"`): run all three research passes below, for every vendor, in one pass per
  vendor (see "Why fan out per vendor" below).
- `"plugins"`: only the plugin/marketplace research pass (`references/plugin-audit.md`).
- `"skills"`: only the skill research pass (`references/skill-audit.md`).
- `"mcp"`: only the MCP server research pass (`references/mcp-audit.md`).

Always read `references/conventions.md` first, regardless of scope — it covers repo hygiene,
branching/commit/validate, the cache file shape, the verification checklist, the self-update rule,
and the non-GitHub-host gap, shared across all three research passes. Each `references/*.md` file
covers only what's specific to its own artifact type.

## Why fan out per vendor, not per artifact type

Git branch/commit operations on one clone can't be parallelized safely. Fanning out per
artifact-type instead would mean up to three agents racing to write to (or needing to merge into)
the same vendor branch. Fanning out per vendor avoids that entirely — each vendor's subagent owns
that vendor's clone exclusively for the run, and the requested artifact type(s) just become one to
three research passes inside one subagent instead of separate ones. This holds even when scoped to
a single type: still dispatch one subagent per vendor, not one shared agent looping over vendors.

## Workflow

1. **Preflight (main thread, not delegated).** For every vendor in `vendors.json`, check
   `git status`/current branch. Report dirty/non-main vendors as their own message, before
   dispatching anything — per `references/conventions.md`'s preflight rule. Exclude those vendors
   from dispatch this run.
2. **Load the relevant cache(s) (main thread).** Read `cache/plugin-sources.json`,
   `cache/skill-sources.json`, and/or `cache/mcp-sources.json` — whichever the requested scope
   covers. Pass each clean vendor's relevant slice into that vendor's dispatch prompt, so the
   subagent starts from what's already known instead of rediscovering it.
3. **Dispatch one subagent per clean vendor**, batched in parallel (multiple `Agent` calls in a
   single message). Each subagent's prompt must be self-contained and instruct it to:
   - Re-confirm the repo is still clean right before touching it (state may have changed between
     the preflight and dispatch) — skip and report if not.
   - Read `skills/audit-vendor-sources/references/conventions.md`, plus whichever of
     `skills/audit-vendor-sources/references/plugin-audit.md`,
     `skills/audit-vendor-sources/references/skill-audit.md`, and
     `skills/audit-vendor-sources/references/mcp-audit.md` the requested scope covers (paths
     relative to the `ai-registry-core` repo root, since the subagent reads them directly off
     disk).
   - Run the research pass(es) for the requested scope — in any order when more than one applies;
     these are independent reads, safe to interleave or run sequentially within the subagent.
   - Verify every candidate against `references/conventions.md`'s checklist (same bar across all
     three types, including the same-org-family rule and the conservative-by-default rule).
   - Write every surviving finding to disk (`plugins/*.json`, `skills/*.json`, `mcp/*.json` as
     applicable) without committing yet.
   - Run `npm run validate-vendor -- ../ai-registry-<id>` **once**, covering everything written.
     Drop any file that produces an ERROR (not a WARNING) and note why; keep the rest.
   - If anything survived: create **one** branch `vendor-audit-<YYYY-MM-DD>`, **one** commit
     listing everything added (plain, factual message, no AI attribution, matching that repo's
     existing history, and justifying each artifact per `references/conventions.md`'s commit rule),
     **never push**.
   - **Not** edit any cache file or reference/SKILL.md itself. Instead, return as structured data in
     its final report: per-type cache deltas (`githubOrgs` learned, `knownSources` additions,
     `rejected` entries with reasons) and any process-level learning it thinks a specific reference
     file should encode. Applying these centrally after all subagents finish avoids parallel
     writers racing on the same handful of shared files.
4. **Aggregate (main thread), after every subagent returns.** Apply each vendor's returned cache
   deltas to the relevant `cache/*.json` file(s), one at a time, in the main thread. Then, per
   `references/conventions.md`'s self-update rule, decide whether any returned process-level
   learning generalizes enough to fold into the relevant `references/*.md` file (or
   `references/conventions.md` if it's generic across scopes) — do this centrally; subagents never
   touch these files directly, which is exactly what avoids the race.
5. **Report a single consolidated summary**: the preflight result, then per vendor — branch +
   commit summary (counts per covered type), or "skipped: dirty" / "nothing new" — and which
   reference file(s) got a self-update this run, or that nothing generalized.

## Branch and commit convention

- Branch name: `vendor-audit-<YYYY-MM-DD>` for an all-types run; when scoped to a single type, the
  distinct `plugin-audit-<date>`/`skill-audit-<date>`/`mcp-audit-<date>` prefixes from
  `references/conventions.md` still apply, so a scoped run doesn't collide with a full run's branch
  name in the same vendor repo the same week.
- One commit per vendor, message summarizing everything added across the covered type(s), e.g.
  "Add 2 plugin, 1 skill, and 3 MCP server approvals from weekly audit" — justified per
  `references/conventions.md`'s commit rule.
- Never push.

## Rules

Same as `references/conventions.md`, plus: bounded effort scales with how many types are covered in
one pass — aim for ≤15 queries/vendor total when covering all three (roughly the sum of each type's
own budget, documented in its own reference file), not three separate full budgets stacked on top
of each other; when scoped to a single type, that type's own budget from its reference file applies
unstacked.
