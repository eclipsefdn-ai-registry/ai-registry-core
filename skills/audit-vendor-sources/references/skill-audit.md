# Agent Skill Research Pass

Research pass looking for Agent Skills (agentskills.io `SKILL.md` folders) a vendor has published
since the last run, verified as genuinely vendor-published, staged as a local feature branch per
vendor repo (never pushed). Read `conventions.md` first — it covers repo hygiene,
branching/commit/validate, the cache file shape, the verification checklist, the self-update rule,
and the non-GitHub-host gap, shared across all three research passes. This file only covers what's
specific to skills. Also read `create-skill-approval` for the approval file format this pass
produces.

This is a genuine internet research pass per vendor (WebSearch/WebFetch, plus GitHub code search
where it applies) — not a search confined to a repo you already know about. Bounded effort is the
point, though: this runs weekly, so a missed finding this week is caught next week.

## Workflow

1. **Load the cache** — read `cache/skill-sources.json`. For each vendor: known GitHub orgs to
   search, sources already approved (skip these), and previously rejected candidates (skip
   re-verifying unless `lastChecked` is more than ~90 days old).
2. **For each vendor in `vendors.json`** (parallelizable — dispatch one subagent per vendor for
   the research step, since vendors are fully independent; keep branch/commit work in the
   dispatching thread so git state stays predictable), do the following:
   - **Get a clean local repo and read current state** — per `conventions.md`. Read
     `organization.json` and every `skills/*.json`. A skill approval's `source.path` can be a
     single string, a glob (`"skills/*"`), or an array mixing both — to know what's "already
     covered," you have to actually resolve those against the source repo's current folder
     listing (or a recent clone of it), not just string-compare paths. A candidate that already
     falls under an approved glob/array is covered even though no approval file names it
     literally.
   - **Determine search targets** — per `conventions.md`'s "Determining GitHub search targets"
     section.
   - **Search the internet, bounded** (aim for ≤6 queries/vendor total across all of the below —
     enough to be thorough, not to crawl every corner of the web):
     - WebSearch for the vendor name plus `SKILL.md agent skill`, and separately plus Agent
       Skills site:github.com — catches announcements, docs pages, and repos this vendor never
       mentioned in an org you already knew about.
     - Check the vendor's own developer blog/docs for a skills announcement — vendors often
       announce a skills repo before or instead of a discoverable code-search hit.
     - `gh api search/code -f q='filename:SKILL.md org:<org>'` per known GitHub org — a precise
       supplement to the web search above, not a replacement for it. Only reaches github.com; see
       `conventions.md`'s non-GitHub gap note for other hosts.
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
       **Boundary: the test is where the `SKILL.md` sits, not whether a tool-specific manifest
       exists somewhere in the repo.** A dedicated vendor skills-catalog repo routinely carries
       `.claude-plugin/`, `.codex-plugin/`, `.cursor-plugin/` and even
       `.agents/plugins/marketplace.json` wrappers _layered over_ a canonical root-level `skills/`
       directory — those are per-tool distribution adapters generated from the same hand-authored
       files, and the `skills/*` catalog stays approvable (`docker/skills`,
       `JetBrains/rider-skills`, `JetBrains/teamcity-skills`, and the already-approved
       `Kotlin/kotlin-agent-skills`, all confirmed 2026-10-02). The exclusion applies when the
       `SKILL.md` lives _inside a plugin root that isn't the repo root_ (`plugin/skills/*`,
       `plugins/<name>/skills/*`, `extensions/<name>/skills/*`, `hermes-plugin/skills/*`), or when
       the repo is primarily a product/tooling repo that happens to bundle skills. Two tells for
       the approvable case: `skills/` is the source of truth the manifests are derived from, and
       the README offers a tool-agnostic install (`npx skills add …`, "copy the skill folder into
       wherever your agent looks for skills") alongside the plugin route. A root-level manifest is
       not automatically the benign case either — a repo-root `.codex-plugin/plugin.json` declaring
       `"skills": "./skills/"` makes the whole repo the plugin and that `skills/` dir its contained
       skills (`openai/snap-o`, `openai/openai-developers-for-cursor`, 2026-10-02), so check
       whether a manifest at the _same_ level claims the directory before treating it as a
       standalone catalog.
     - Watch for one skill set published across several **per-tool sibling repos** — the repo-level
       analogue of the near-identical-sibling-directories rule below. `openai/plugins#plugins/openai-developers`,
       `openai/openai-developers-for-claude` and `openai/openai-developers-for-cursor` all ship the
       same six skills (2026-10-02); reject the per-tool repackagings rather than picking one
       arbitrarily.
     - Reject by path alone: anything under `test/`, `fixtures/`, or `examples/` — these are
       rarely a real, user-facing skill.
     - Reject repo-internal maintainer/dev-workflow skill folders — `SKILL.md` files under
       `.codex/skills/`, `.agents/skills/`, or `.claude/skills/` inside a vendor's own
       product/tooling repo that automate _that repo's own_ engineering workflow (PR triage,
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
       approving a skill in this exclusion class. **`.agents/skills/` is a strong prior, not a
       blanket exclusion** — check for the one product skill hiding inside an otherwise-internal
       directory (`NVIDIA/elements#.agents/skills/elements`, the public design-system skill among
       four internal authoring-convention skills, 2026-10-02), and conversely treat a root-level
       `skills/` dir in a product repo as a positive signal worth checking even when that repo's
       `.agents/skills/` is entirely internal (`NVIDIA/OpenShell`: 4 customer-facing product skills
       under `skills/`, 17 repo-internal workflow skills under `.agents/skills/`).
     - **Reject a skill whose dependency on unshipped files is permanent — not merely one that
       references them.** Consolidation hashes and installs only the approved folder, so always
       list that folder's contents against what `SKILL.md` actually needs. But "routes outside
       the folder" is _not_ the test on its own; the distinction is whether the skill can get
       itself into a working state. Two worked examples from 2026-10-02, decided opposite ways:
       - **Approvable** — `openai/redcard#codex-skill/redcard` ships `SKILL.md`, `agents/` and
         `scripts/` but no `runtime/` payload. Its installer _detects_ the missing payload by
         name, `SKILL.md` documents the one-time bootstrap (`./scripts/install-codex-skill.sh`),
         and the installer is explicitly required to "never retain a dependency on the source
         repo". The gap is closed at install time and then gone.
       - **Not approvable** — `anthropics/code-migration-kit-with-claude-code#skill` is a lone
         69-line `SKILL.md` that routes every step into repo-root `prompts/`, `scripts/` and
         `templates/` for the whole workflow's duration, with no detection and no recovery —
         only an unresolved `(set [kit path] when installing this skill)` placeholder. It is a
         pointer into a repo you must separately obtain and keep, not a distributable artifact.

       So: install-time bootstrap with detection and a documented recovery path is fine; a
       permanent runtime dependency on files that never ship is not. A related sub-signal worth
       checking at the same time: a README saying "Reference code … companion to the blog post …
       not actively maintained. Issues and PRs are not monitored" marks a whole class of vendor
       blog-companion kits (verified on the above). These repos are _not_ archived, so the MCP
       pass's archived check has no equivalent here.

     - **When the candidate is a glob/array covering many skills at once, checking that a couple
       of them have well-formed frontmatter is not the same as verifying the class — sample
       several skill bodies spread across the glob, not just one or two.** This matters most when
       the source repo is the vendor's own primary open-source product/dev repo (as opposed to a
       repo dedicated to being a skills catalog) — a whole `.agents/skills/*` or `.claude/skills/*`
       directory there can be entirely internal contributor tooling for developing _that repo_,
       not a single stray skill mixed into otherwise-legitimate content. Both JetBrains globs
       approved 2026-09-18 (`JetBrains/intellij-community#.agents/skills/*`, 39 skills;
       `JetBrains/kotlin#.claude/skills/*`, 6 skills) turned out to be 100% repo-internal on
       review 2026-09-21 — commit workflow, internal issue tracker use, the compiler's own build
       tooling — because the original pass confirmed frontmatter shape across the glob without
       reading enough of the actual bodies to notice every single one was this exclusion class,
       not just a few. Reverted in full.
       **Size the batch from the directory listing, not from the search-hit count** — GitHub code
       search under-reports files in large repos: `filename:SKILL.md org:NVIDIA` returned 2 of the
       8 skills actually present in `NVIDIA/dgx-spark-playbooks#nvidia/station-ai-skills/assets/skills/`
       and 3 of 9 in `NVIDIA/nvshmem#skills/` (2026-10-02). `gh api repos/<owner>/<repo>/contents/<dir>`
       (core API, cheap) is the authoritative count, and without it an "I read all of them" claim
       is simply false.
     - **Triage a very large vendor org by repo, not by hit.** `filename:SKILL.md org:anthropics`
       returns ~692 hits — individually unreadable. Page the search and aggregate
       (`--jq '.items[].repository.full_name' | sort | uniq -c | sort -rn`), then triage each
       _repo_ once via `gh api repos/<o>/<r>/git/trees/HEAD?recursive=1` filtered to
       `SKILL.md|.claude-plugin/`. A root `.claude-plugin/marketplace.json` is a single decisive
       signal that the whole repo is a Claude-Code-native bundle, disposing of every `SKILL.md` in
       it at once (killed 7 repos / ~500 hits in one pass, 2026-10-02).
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

   - **Verify every remaining candidate** against `conventions.md`'s checklist, **including its
     same-org-family rule** — a repo under a product/ecosystem org that merely sounds affiliated
     with the vendor (e.g. `Kotlin` for JetBrains) is load-bearing here exactly as it is for
     plugins; don't skip it just because it's documented under the plugin pass. Note: SKILL.md
     frontmatter rarely carries an explicit author/vendor field the way a `plugin.json` does, so
     lean more heavily on repo ownership and GitHub org verification for skills than on manifest
     self-attribution. Also check whether the plugin pass's cache already flagged this repo as a
     community-contributed aggregator (e.g. its own README says so) — that verdict generalizes
     across artifact types within the same repo without re-verifying each individual `SKILL.md`'s
     authorship. Anything that doesn't clearly clear the bar goes to the reject pile with a
     one-line reason; it does not become an approval, and does not get asked about.
   - **Stage genuine findings** — group multiple newly-found skill folders in the _same_ repo into
     one approval using a glob or an explicit path array (per `create-skill-approval`'s multi-skill
     examples), rather than one file per skill folder. One file per _distinct source repo_, same as
     `create-inferred-vendor`'s rule. `mkdir -p skills/` first if the vendor repo has no prior skill
     approvals. Branch, commit, and validate per `conventions.md`.
     **A skill can be a whole repo, with `SKILL.md` at the root** — the approval then omits
     `source.path` entirely, which the schema supports (proven against
     `gitlab.com/gitlab-org/ci-cd/gitlab-ci-skill` and `.../github-actions-to-gitlab-ci`,
     2026-10-02). Worth searching for deliberately: a root-level skill repo is invisible to any
     `skills/`-prefixed path grep, only to a `SKILL.md` match at depth 0.
     **A vendor can keep only a `SKILL-template.md` on the default branch and assemble the real
     `SKILL.md` files onto a release branch** (`google/perfetto`'s `ai-agents` branch). Since
     ai-registry-core#123 the skill schema has `source.ref` (tag, branch, or full commit SHA), so
     this shape _is_ approvable — pin the approval to that branch rather than rejecting it. It was
     rejected on 2026-10-02 for lacking a `ref` field that had in fact landed on `main` days
     earlier; re-evaluate it. Note the general trap: core gains schema capabilities between runs,
     so confirm a "the schema can't express this" rejection against the current schema file rather
     than against what a previous run's cache says.
   - **Update the vendor's cache entry** — confirmed `githubOrgs`, `lastChecked` = today, newly
     approved sources appended to `knownSources.skills` (one entry per resolved path, even when
     grouped into a single approval file), new rejections appended with reason and date.

3. **Write back `cache/skill-sources.json`** with all vendor updates from the previous step.
4. **Report a summary**: per vendor — branch created (if any) and files added, candidates
   rejected and why, or "skipped: dirty working tree" / "nothing new". This is a staged proposal;
   pushing and opening PRs is a separate, human decision.
5. **Self-update** — per `conventions.md`'s rule, every run, no exceptions.
