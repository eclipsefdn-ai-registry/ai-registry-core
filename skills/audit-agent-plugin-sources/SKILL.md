---
name: audit-agent-plugin-sources
description: >
  Weekly discovery sweep across every AI Registry vendor for newly published Agent Plugins
  (agent-plugins.org plugin.json) and marketplace files (e.g. OpenAI Codex/ChatGPT's
  .agents/plugins/marketplace.json) that aren't approved yet, verified as genuinely
  vendor-published, staged as a local feature branch per vendor repo (never pushed). Use when
  running the recurring plugin/marketplace audit, or when asked to check registry vendors for
  new plugins or marketplaces to approve.
---

# AI Registry — Agent Plugin & Marketplace Source Audit

Recurring (intended: weekly) research pass over every vendor already in the registry, looking for
Agent Plugins and marketplace files the vendor has published since the last run. This is
discovery, not onboarding — it only touches vendors already listed in `vendors.json`; use
`create-inferred-vendor` to add a brand-new vendor.

This is a genuine internet research pass per vendor (WebSearch/WebFetch, plus GitHub code search
where it applies) — not a search confined to a repo you already know about. Bounded effort is the
point, though: this runs weekly, so a missed finding this week is caught next week.

**REQUIRED BACKGROUND:** Read `skills/vendor-audit-conventions.md` in this repo first — it covers
repo hygiene, branching/commit/validate, the cache file shape, the verification checklist, the
self-update rule, and the non-GitHub-host gap, shared across all three vendor-audit skills. This
file only covers what's specific to plugins and marketplaces. Also read `create-plugin-approval`
and `create-marketplace-approval` for the approval file formats this skill produces.

## Workflow

1. **Load the cache** — read `known-vendor-sources.json` in this skill's directory. For each
   vendor: known GitHub orgs to search, sources already approved (skip these), and previously
   rejected candidates (skip re-verifying unless `lastChecked` is more than ~90 days old).
2. **For each vendor in `vendors.json`** (parallelizable — dispatch one subagent per vendor for
   the research step, since vendors are fully independent; keep branch/commit work in the
   dispatching thread so git state stays predictable), do the following:
   - **Get a clean local repo and read current state** — per `vendor-audit-conventions.md`. Read
     `organization.json`, every `plugins/*.json`, every `marketplaces/*.json`. Build the set of
     already-approved `source.url` (+`path`) pairs so you never re-suggest something already
     there.
   - **Determine search targets** — per `vendor-audit-conventions.md`'s "Determining GitHub
     search targets" section.
   - **Search the internet, bounded** (aim for ≤6 queries/vendor total across all of the below —
     enough to be thorough, not to crawl every corner of the web):
     - WebSearch for the vendor name plus `plugin.json agent-plugins.org`, and separately plus
       `marketplace.json agent-plugins` — catches announcements, docs pages, and repos this
       vendor never mentioned in an org you already knew about.
     - Check the vendor's own developer blog/docs (if `organization.json`'s `website` or an
       existing approval hints at one) for a plugin/marketplace announcement — vendors often
       announce a plugin before or instead of a discoverable code-search hit.
     - `gh api search/code -f q='filename:plugin.json org:<org>'` and
       `gh api search/code -f q='filename:marketplace.json path:.agents/plugins org:<org>'` per
       known GitHub org — a precise supplement to the web search above, not a replacement for it.
       Only reaches github.com; see `vendor-audit-conventions.md`'s non-GitHub gap note for other
       hosts.
     - A candidate found this way that names a GitHub org you didn't have cached yet is itself a
       result — add it to `githubOrgs` in the cache-update step below so next week's code-search
       pass starts from it directly.
     - Marketplace format is currently limited to `"codex"` (`.agents/plugins/marketplace.json`) —
       see `schemas/marketplace-approval.schema.json`'s `format` enum. A plugin index in some other
       shape isn't approvable yet; note it in the report rather than forcing it into this schema.
     - A vendor hosted outside github.com (e.g. gitlab.com) can still get **direct** `plugins/*.json`
       approvals — `plugin-source.ts`'s enrichment is a plain `git clone`, host-agnostic. Mint the
       `pluginId` by reversing the _code host's_ domain, same pattern as `io.github.<owner>/<name>`
       for GitHub (e.g. `com.gitlab.<group>/<name>` for a gitlab.com repo — proven working against
       `gitlab.com/gitlab-org/ai/gitlab-duo-plugins` on 2026-09-11). A **marketplace** approval for
       a non-GitHub host is not currently viable, though: `marketplace-source.ts`'s
       `derivePluginIdFromSource` calls `deriveGithubOwnerRepo`, which only parses `github.com`
       URLs and throws for anything else — so even a genuine, well-formed non-GitHub marketplace
       file can only be exploited by approving its individual plugins directly, one by one, not by
       approving the marketplace itself.
   - **Drop anything already approved or already fanned out.** "Already covered" means: a
     `plugins/*.json` approval with a matching `source.url`+`path`, **or** an entry inside an
     already-approved `marketplaces/*.json` file's own fan-out list — fetch that marketplace file
     (same repo/path it points to) and check its resolved entries too, not just standalone plugin
     approvals, or you'll re-suggest something a marketplace approval already covers. Also drop
     anything already in the cache's `rejected` list. **Do this check first, before spending effort
     verifying a candidate**: if the vendor already has an approved marketplace, a plugin.json hit
     that looks brand new from a code/web search is often just one of that marketplace's own
     fanned-out entries — matching by exact resolved `source.url` (not by name/description) is what
     catches this; a same-repo search hit and a marketplace fan-out entry look identical otherwise.
     Once confirmed covered, add its URL to `knownSources.plugins` in the cache so future runs don't
     need to re-fetch and re-parse the marketplace file just to re-derive the same answer.
   - **Filter false-positive hits before verifying anything.** `filename:plugin.json` and
     `filename:marketplace.json` searches over-match badly:
     - Reject by path alone, no further check needed: anything under `.claude-plugin/`,
       `.codex-plugin/`, `.cursor-plugin/`, or a `test/`/`fixtures/`/`examples/` directory —
       these are different, tool-specific plugin formats or test data, never a real
       agent-plugins.org plugin.
     - For everything else, open the file before treating it as a candidate. A genuine
       agent-plugins.org `plugin.json` has top-level `name`/`description` (and usually
       `version`); if it doesn't look like that shape, it's not one.
     - For a `marketplace.json` hit: open it. The disqualifying shape is a **single entry** whose
       only source is `"local"` (or a bare string path) — that's a per-repo wrapper
       auto-generated by tooling around one plugin, not a curated index; skip the marketplace and
       evaluate that entry's own `plugin.json` directly as a plugin candidate instead. A
       **multi-entry** file is a genuine index worth approving as a marketplace even when every
       entry is `"source":"local"` — a monorepo with several plugin subdirectories fans out to
       several distinct `io.github.<owner>/<subdir-name>` plugins exactly the way a skill
       approval's glob/array does (see `aws/agent-toolkit-for-aws`, approved 2026-09-12: 4
       local-source entries, one repo). Either way, **before treating any marketplace.json hit as
       real, verify at least one referenced plugin subdirectory actually contains a root
       `plugin.json`** — a repo can ship a marketplace.json-shaped index whose entries are only
       `.claude-plugin`/`.codex-plugin` tool-specific manifests with no agent-plugins.org manifest
       at all (see `awslabs/agent-plugins`, rejected 2026-09-12 on exactly this — the marketplace
       file's shape alone is not sufficient evidence, since it doesn't guarantee the entries
       underneath are actually agent-plugins.org-conformant).
   - **Verify every remaining candidate** against `vendor-audit-conventions.md`'s checklist.
     Anything that doesn't clearly clear the bar goes to the reject pile with a one-line reason;
     it does not become an approval, and does not get asked about.
   - **Stage genuine findings** — for each verified plugin, write a `plugins/<id>.json` file
     following `create-plugin-approval`'s rules; for each verified marketplace, write a
     `marketplaces/<name>.json` following `create-marketplace-approval`'s rules (reject it
     instead if it reads as open-submission/unreviewed, per that skill's guidance — a marketplace
     approval is all-or-nothing, don't hand-pick entries out of it). `mkdir -p` the target
     directory first — git doesn't track empty directories, so a vendor repo with no prior plugin
     approvals may not have a `plugins/` folder yet. Branch, commit, and validate per
     `vendor-audit-conventions.md`.
   - **Update the vendor's cache entry** — confirmed `githubOrgs`, `lastChecked` = today, newly
     approved sources appended to `knownSources.plugins`/`knownSources.marketplaces`, new
     rejections appended with reason and date.
3. **Write back `known-vendor-sources.json`** with all vendor updates from the previous step.
4. **Report a summary**: per vendor — branch created (if any) and files added, candidates
   rejected and why, or "skipped: dirty working tree" / "nothing new". This is a staged proposal;
   pushing and opening PRs is a separate, human decision.
5. **Self-update** — per `vendor-audit-conventions.md`'s rule, every run, no exceptions.
