# Agent Plugin & Marketplace Research Pass

Research pass looking for Agent Plugins (agent-plugins.org `plugin.json`) and marketplace files
(e.g. OpenAI Codex/ChatGPT's `.agents/plugins/marketplace.json`) a vendor has published since the
last run, verified as genuinely vendor-published, staged as a local feature branch per vendor repo
(never pushed). Read `conventions.md` first — it covers repo hygiene, branching/commit/validate,
the cache file shape, the verification checklist, the self-update rule, and the non-GitHub-host
gap, shared across all three research passes. This file only covers what's specific to plugins and
marketplaces. Also read `create-plugin-approval` and `create-marketplace-approval` for the approval
file formats this pass produces.

This is a genuine internet research pass per vendor (WebSearch/WebFetch, plus GitHub code search
where it applies) — not a search confined to a repo you already know about. Bounded effort is the
point, though: this runs weekly, so a missed finding this week is caught next week.

## Workflow

1. **Load the cache** — read `cache/plugin-sources.json`. For each vendor: known GitHub orgs to
   search, sources already approved (skip these), and previously rejected candidates (skip
   re-verifying unless `lastChecked` is more than ~90 days old). **Exception: a rejection whose
   reason is "no root `plugin.json`, only `.claude-plugin`/`.codex-plugin`" does _not_ inherit that
   ~90-day skip — re-check it every run.** Vendors add an agent-plugins.org manifest to an existing
   repo, and the check is one cheap fetch
   (`curl -s https://raw.githubusercontent.com/<owner>/<repo>/<default-branch>/plugin.json`).
   `atlassian-labs/twg-plugins` went from README-documented exclusion to a conformant root
   `plugin.json` between 2026-09-18 and 2026-10-02; `org:JetBrains`, rejected 2026-09-11 as
   shipping no codex-format manifests at all, now ships three.
   **Run that re-check as one bulk sweep over the whole org, not per cached rejection.**
   `gh api --paginate orgs/<org>/repos` gives every repo plus its `default_branch`; a loop of
   `curl -s -o /dev/null -w '%{http_code}'` over `<default_branch>/plugin.json` and
   `<default_branch>/.agents/plugins/marketplace.json` then answers the question exhaustively for
   zero `search`/`code_search` quota — 74 anthropics repos and 8 docker repos each re-validated in a
   single pass on 2026-10-09. It is also strictly more reliable than code search, which under-reports
   in large repos, and it catches a manifest appearing in a repo no previous run ever cached.
2. **For each vendor in `vendors.json`** (parallelizable — dispatch one subagent per vendor for
   the research step, since vendors are fully independent; keep branch/commit work in the
   dispatching thread so git state stays predictable), do the following:
   - **Get a clean local repo and read current state** — per `conventions.md`. Read
     `organization.json`, every `plugins/*.json`, every `marketplaces/*.json`. Build the set of
     already-approved `source.url` (+`path`) pairs so you never re-suggest something already
     there.
   - **Determine search targets** — per `conventions.md`'s "Determining GitHub search targets"
     section.
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
       Only reaches github.com; see `conventions.md`'s non-GitHub gap note for other hosts.
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
     - **A repo whose _name_ ends in `-plugin` can be a bare placeholder.**
       `github/computer-use-plugin` was created 2026-07-02 and pushed 2026-10-09 but holds only
       `LICENSE`, `README.md` and `SECURITY.md` — no manifest of any kind. Check the tree before
       spending a manifest fetch, and queue it for recheck rather than filing a format-based
       rejection it hasn't earned yet.
     - Reject by path alone, no further check needed: anything under `.claude-plugin/`,
       `.codex-plugin/`, `.cursor-plugin/`, `.plugin/`, `.github/plugin/`, or a
       `test/`/`fixtures/`/`examples/` directory — these are different, tool-specific plugin
       formats or test data, never a real agent-plugins.org plugin (`.plugin/` and
       `.github/plugin/` confirmed as this kind of wrapper/duplicate location in
       `atlassian/forge-skills`, 2026-09-18).
     - For everything else, open the file and check it against the **actual published
       schema**, not against a general impression of its shape. Fetch
       `https://agent-plugins.org/schemas/1.0.0/plugin.schema.json` (verified 2026-10-04 —
       1.0.0 is still the only version; 1.1.0/2.0.0/`latest` all 404, so "they target a newer
       spec" is not an available explanation):

       ```
       required:             ["$schema", "name"]
       additionalProperties: false
       allowed:              $schema, name, version, description, author, homepage,
                             repository, license, keywords, extensions
       ```

       Two failure modes matter most. **A missing `$schema` is disqualifying on its own** —
       it is required. And **top-level `skills`, `agents`, `hooks`, `mcpServers` or similar
       are forbidden**: the spec's `extensions` object ("client-specific manifest data keyed
       by reverse-domain extension namespace") exists precisely so client-specific content
       nests under e.g. `extensions["com.github.copilot"]` instead. A manifest with the right
       "feel" — name, description, version, author, homepage, keywords — can still fail both
       tests; `github/spec-kit-copilot` and `github/actions-migrations-via-copilot` did
       exactly that on 2026-10-04.

       **Do not rely on `npm run validate-vendor` to catch this.** `plugin-source.ts` only
       requires that a `plugin.json` exists and reads its fields defensively; nothing
       validates the fetched manifest against the agent-plugins.org schema, so a
       non-conformant plugin approval currently passes green. This check is manual until
       that gap is closed.

     - **A vendor-native plugin format is not a broken agent-plugins.org plugin, and there is
       nothing to report upstream.** GitHub Copilot's plugin format (root or
       `.github/plugin/` manifests with top-level `skills`/`agents`/`hooks`) is a parallel
       ecosystem, exactly like `.claude-plugin/` and `.codex-plugin/` — GitHub never claims
       agent-plugins.org conformance for it, publishes no `$schema`, and runs its own
       marketplace format. Filing a conformance issue against such a repo would be reading
       our spec into someone else's format; just record it as out of scope and move on.
     - For a `marketplace.json` hit: open it. The disqualifying shape is a **single entry** whose
       source resolves back to the marketplace file's own repo — `"local"`, a bare string path,
       `"source":"git-subdir"` (seen in `awslabs/startups`, 2026-09-18), or `"source":"url"`
       pointing at the same repo (seen in `NVIDIA/nvidia-kaggle`, 2026-09-18) are all the same
       self-wrapper pattern, whatever the exact `source` spelling — that's a per-repo wrapper
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
       underneath are actually agent-plugins.org-conformant). When that check reveals the repo is
       really a **skills catalog** (no root `plugin.json` anywhere, a canonical `skills/` dir
       underneath), the right outcome isn't just "skip the marketplace" — hand the repo to the
       skill pass, since the hit is genuine evidence of a publishable artifact in the other
       category (`docker/skills`, 2026-10-02). Say so explicitly in the report when the run is
       scoped to plugins only, or the finding is lost.
     - A multi-entry index can still be a **duplicate** rather than a new marketplace: check
       whether its entries are the same plugins an already-approved marketplace fans out, and
       whether the entries are git submodules vendoring already-approved repos (check
       `.gitmodules`) — both seen 2026-10-02 in `GoogleCloudPlatform/data-cloud-plugins` and
       `google/skills#plugins/cloud/data-cloud`.
     - A marketplace entry's `source` field can be either a bare string (e.g.
       `"./plugins/google-cloud-developer"`) or an object (e.g. `{"source":"url", ...}`) — a
       hand-rolled parser that only handles one shape will silently truncate the entry list (hit
       this 2026-09-18 on `google/skills`'s marketplace file). Prefer letting
       `npm run validate-vendor` do the resolution/duplicate-detection rather than hand-parsing,
       or handle both shapes explicitly if you must parse it yourself.

   - **Verify every remaining candidate** against `conventions.md`'s checklist. Anything that
     doesn't clearly clear the bar goes to the reject pile with a one-line reason; it does not
     become an approval, and does not get asked about.
   - **Stage genuine findings** — for each verified plugin, write a `plugins/<id>.json` file
     following `create-plugin-approval`'s rules; for each verified marketplace, write a
     `marketplaces/<name>.json` following `create-marketplace-approval`'s rules (reject it
     instead if it reads as open-submission/unreviewed, per that skill's guidance — a marketplace
     approval is all-or-nothing, don't hand-pick entries out of it). `mkdir -p` the target
     directory first — git doesn't track empty directories, so a vendor repo with no prior plugin
     approvals may not have a `plugins/` folder yet. Branch, commit, and validate per
     `conventions.md`.
   - **Update the vendor's cache entry** — confirmed `githubOrgs`, `lastChecked` = today, newly
     approved sources appended to `knownSources.plugins`/`knownSources.marketplaces`, new
     rejections appended with reason and date.
   - **Known gap**: a plugin's root directory can itself be literally named `skills` (not
     `<plugin-root>/skills/`, e.g. `awslabs/cli-agent-orchestrator#skills`) — consolidation's
     `containedSkills` discovery looks one level down for `skills/*/SKILL.md` and won't find
     anything in this case, so validation will misleadingly report "0 skills" even though the
     plugin is entirely skills. Not a blocker, just don't mistake it for a real content problem.

3. **Write back `cache/plugin-sources.json`** with all vendor updates from the previous step.
4. **Report a summary**: per vendor — branch created (if any) and files added, candidates
   rejected and why, or "skipped: dirty working tree" / "nothing new". This is a staged proposal;
   pushing and opening PRs is a separate, human decision.
5. **Self-update** — per `conventions.md`'s rule, every run, no exceptions.
