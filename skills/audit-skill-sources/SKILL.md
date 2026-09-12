---
name: audit-skill-sources
description: >
  Weekly discovery sweep across every AI Registry vendor for newly published Agent Skills
  (agentskills.io SKILL.md folders) that aren't approved yet, verified as genuinely
  vendor-published, staged as a local feature branch per vendor repo (never pushed). Use when
  running the recurring skill audit, or when asked to check registry vendors for new skills to
  approve.
---

# AI Registry — Agent Skill Source Audit

Recurring (intended: weekly) research pass over every vendor already in the registry, looking for
Agent Skills the vendor has published since the last run. This is discovery, not onboarding — it
only touches vendors already listed in `vendors.json`; use `create-inferred-vendor` to add a
brand-new vendor.

This is a genuine internet research pass per vendor (WebSearch/WebFetch, plus GitHub code search
where it applies) — not a search confined to a repo you already know about. Bounded effort is the
point, though: this runs weekly, so a missed finding this week is caught next week.

**REQUIRED BACKGROUND:** Read `skills/vendor-audit-conventions.md` in this repo first — it covers
repo hygiene, branching/commit/validate, the cache file shape, the verification checklist, the
self-update rule, and the non-GitHub-host gap, shared across all three vendor-audit skills. This
file only covers what's specific to skills. Also read `create-skill-approval` for the approval
file format this skill produces.

## Workflow

1. **Load the cache** — read `known-vendor-sources.json` in this skill's directory. For each
   vendor: known GitHub orgs to search, sources already approved (skip these), and previously
   rejected candidates (skip re-verifying unless `lastChecked` is more than ~90 days old).
2. **For each vendor in `vendors.json`** (parallelizable — dispatch one subagent per vendor for
   the research step, since vendors are fully independent; keep branch/commit work in the
   dispatching thread so git state stays predictable), do the following:
   - **Get a clean local repo and read current state** — per `vendor-audit-conventions.md`. Read
     `organization.json` and every `skills/*.json`. A skill approval's `source.path` can be a
     single string, a glob (`"skills/*"`), or an array mixing both — to know what's "already
     covered," you have to actually resolve those against the source repo's current folder
     listing (or a recent clone of it), not just string-compare paths. A candidate that already
     falls under an approved glob/array is covered even though no approval file names it
     literally.
   - **Determine search targets** — per `vendor-audit-conventions.md`'s "Determining GitHub
     search targets" section.
   - **Search the internet, bounded** (aim for ≤6 queries/vendor total across all of the below —
     enough to be thorough, not to crawl every corner of the web):
     - WebSearch for the vendor name plus `SKILL.md agent skill`, and separately plus Agent
       Skills site:github.com — catches announcements, docs pages, and repos this vendor never
       mentioned in an org you already knew about.
     - Check the vendor's own developer blog/docs for a skills announcement — vendors often
       announce a skills repo before or instead of a discoverable code-search hit.
     - `gh api search/code -f q='filename:SKILL.md org:<org>'` per known GitHub org — a precise
       supplement to the web search above, not a replacement for it. Only reaches github.com; see
       `vendor-audit-conventions.md`'s non-GitHub gap note for other hosts.
     - A candidate found this way that names a GitHub org you didn't have cached yet is itself a
       result — add it to `githubOrgs` in the cache-update step below so next week's code-search
       pass starts from it directly.
   - **Drop anything already approved** (per the glob/array resolution above) or already in the
     cache's `rejected` list.
   - **Filter false-positive hits before verifying anything.** `filename:SKILL.md` over-matches:
     - Skip any `SKILL.md` that lives under a repo/path already approved (or approvable) as an
       Agent Plugin's `skills/*/SKILL.md` — per `AGENTS.md`, a plugin's contained skills are
       surfaced as read-only `containedSkills` metadata through the plugin approval, not as
       separate standalone skill entries. Approving them again here would be a duplicate, not a
       new finding. Cross-check against this vendor's `plugins/*.json` (and any fanned-out
       marketplace entries) before treating a plugin-embedded skill as a candidate.
     - Reject by path alone: anything under `test/`, `fixtures/`, or `examples/` — these are
       rarely a real, user-facing skill.
     - For everything else, open the `SKILL.md` and confirm it has real YAML frontmatter with
       `name`/`description` — a stray file that merely happens to be named `SKILL.md` isn't one.
   - **Verify every remaining candidate** against `vendor-audit-conventions.md`'s checklist. Note:
     SKILL.md frontmatter rarely carries an explicit author/vendor field the way a `plugin.json`
     does, so lean more heavily on repo ownership and GitHub org verification for skills than on
     manifest self-attribution. Anything that doesn't clearly clear the bar goes to the reject
     pile with a one-line reason; it does not become an approval, and does not get asked about.
   - **Stage genuine findings** — group multiple newly-found skill folders in the _same_ repo into
     one approval using a glob or an explicit path array (per `create-skill-approval`'s multi-skill
     examples), rather than one file per skill folder. One file per _distinct source repo_, same as
     `create-inferred-vendor`'s rule. `mkdir -p skills/` first if the vendor repo has no prior skill
     approvals. Branch, commit, and validate per `vendor-audit-conventions.md`.
   - **Update the vendor's cache entry** — confirmed `githubOrgs`, `lastChecked` = today, newly
     approved sources appended to `knownSources.skills` (one entry per resolved path, even when
     grouped into a single approval file), new rejections appended with reason and date.
3. **Write back `known-vendor-sources.json`** with all vendor updates from the previous step.
4. **Report a summary**: per vendor — branch created (if any) and files added, candidates
   rejected and why, or "skipped: dirty working tree" / "nothing new". This is a staged proposal;
   pushing and opening PRs is a separate, human decision.
5. **Self-update** — per `vendor-audit-conventions.md`'s rule, every run, no exceptions.
