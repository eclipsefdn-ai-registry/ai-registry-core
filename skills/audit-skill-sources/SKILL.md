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
       marketplace entries) before treating a plugin-embedded skill as a candidate. This applies
       even when the containing plugin itself isn't agent-plugins.org-approvable — a **Claude
       Code-native** plugin bundle (a `.claude-plugin/plugin.json` sibling, e.g. across
       `anthropics/claude-code`, `anthropics/knowledge-work-plugins`) still makes its nested
       `SKILL.md` files tool-packaging detail, not general-purpose published skills, just for a
       different reason (packaging, not duplication) — reject rather than approve.
     - Reject by path alone: anything under `test/`, `fixtures/`, or `examples/` — these are
       rarely a real, user-facing skill.
     - Reject repo-internal maintainer/dev-workflow skill folders — `SKILL.md` files under
       `.codex/skills/`, `.agents/skills/`, or `.claude/skills/` inside a vendor's own
       product/tooling repo that automate *that repo's own* engineering workflow (PR triage,
       release process, dependency bumps, doc-site content migration, internal telemetry/build
       conventions) rather than teach a user how to use a vendor product. Heuristic: if the
       skill's instructions assume the agent is operating inside the vendor's own repo/CI
       (references to that repo's own scripts, hooks, or repo-specific conventions), treat it
       like the `test/`/`fixtures/`/`examples/` exclusion. Seen repeatedly across large vendor
       orgs (`openai/codex`, `openai/openai-agents-python`, `docker/docs`, `docker/docker-agent`,
       and scattered across `GoogleCloudPlatform`'s many repos) — worth checking for explicitly
       whenever an org-wide `filename:SKILL.md` search returns hits outside the vendor's
       dedicated skills catalog repo. **The frontmatter `description` alone can look
       product-relevant even when the skill is this exclusion class** — `aws/aws-lambda-dotnet`'s
       `.agents/skills/new-event-source` describes itself as "Add a new AWS event source attribute
       (e.g., Kinesis, Kafka, MQ)..." which reads like customer-facing Lambda guidance, but the
       body is a 17-step contributor guide for extending the `aws-lambda-dotnet` framework's own
       source generator (internal file paths, the framework's own unit/snapshot/integration test
       suite, diagnostic-ID conventions) — approved 2026-09-18, caught and reverted the same day
       only by reading the full body, not the description. Always read past the frontmatter before
       approving a skill in this exclusion class.
     - **When the candidate is a glob/array covering many skills at once, checking that a couple
       of them have well-formed frontmatter is not the same as verifying the class — sample
       several skill bodies spread across the glob, not just one or two.** This matters most when
       the source repo is the vendor's own primary open-source product/dev repo (as opposed to a
       repo dedicated to being a skills catalog) — a whole `.agents/skills/*` or `.claude/skills/*`
       directory there can be entirely internal contributor tooling for developing *that repo*,
       not a single stray skill mixed into otherwise-legitimate content. Both JetBrains globs
       approved 2026-09-18 (`JetBrains/intellij-community#.agents/skills/*`, 39 skills;
       `JetBrains/kotlin#.claude/skills/*`, 6 skills) turned out to be 100% repo-internal on
       review 2026-09-21 — commit workflow, internal issue tracker use, the compiler's own build
       tooling — because the original pass confirmed frontmatter shape across the glob without
       reading enough of the actual bodies to notice every single one was this exclusion class,
       not just a few. Reverted in full.
     - Reject "deprecated compatibility redirect" stubs — a `SKILL.md` with well-formed
       frontmatter whose body explicitly says the skill moved/is deprecated (seen 6x in one repo,
       `awslabs/mcp`'s aurora-dsql-mcp-server skills, 2026-09-18) has no canonical content to
       approve.
     - Reject same-name repos under a different, unaffiliated personal account that self-describe
       as "AI agent skills published by `<Vendor>`" in their own README/description (seen for
       NVIDIA: `jasonnvidia/skills`, `christinayyw/skills`, `ashishachopra/Nvidia-Skills`,
       2026-09-18) — these read as forks/rebrands of the vendor's real catalog; check the org, not
       the self-description.
     - Watch for near-identical skill folders sharing the same leaf name across sibling
       directories (e.g. per-CLI-tool "harness" variants of the same skill, seen in
       `awslabs/aidlc-workflows#harness/*/skills/aidlc`) — these can't be grouped into one
       glob/array approval, since the leaf-name-based `skillId` suffix would collide; and their
       templated, per-tool nature usually means they're build output, not independently reusable
       content, so the right call is usually to reject them rather than pick one arbitrarily.
     - Watch for the same skill content published at two paths in one repo, e.g. a canonical
       `.agents/skills/*` alongside a build-generated `.claude/skills/*` mirror (detectable via a
       `<!-- Generated by ...; edit <canonical-path> -->` header comment after frontmatter, seen
       in `JetBrains/intellij-community`, 2026-09-18) — approve only the canonical/hand-authored
       location to avoid double-approving identical content under two skillIds.
     - For everything else, open the `SKILL.md` and confirm it has real YAML frontmatter with
       `name`/`description` — a stray file that merely happens to be named `SKILL.md` isn't one.
   - **Verify every remaining candidate** against `vendor-audit-conventions.md`'s checklist,
     **including its same-org-family rule** — a repo under a product/ecosystem org that merely
     sounds affiliated with the vendor (e.g. `Kotlin` for JetBrains) is load-bearing here exactly
     as it is for plugins; don't skip it just because it's documented under the plugin audit. Note:
     SKILL.md frontmatter rarely carries an explicit author/vendor field the way a `plugin.json`
     does, so lean more heavily on repo ownership and GitHub org verification for skills than on
     manifest self-attribution. Also check whether the plugin audit's cache already flagged this
     repo as a community-contributed aggregator (e.g. its own README says so) — that verdict
     generalizes across artifact types within the same repo without re-verifying each individual
     `SKILL.md`'s authorship. Anything that doesn't clearly clear the bar goes to the reject
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
