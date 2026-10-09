# Vendor Audit — Shared Conventions

Shared scaffolding for the three research passes `SKILL.md` dispatches — plugin/marketplace
(`plugin-audit.md`), skill (`skill-audit.md`), MCP server (`mcp-audit.md`). Each of those files
covers only what's type-specific (what to search for, how to filter false positives, what approval
file to write); everything else lives here so the three don't drift independently. Each research
pass still keeps its own cache file under `cache/` (`cache/plugin-sources.json`,
`cache/skill-sources.json`, `cache/mcp-sources.json`) — they are not shared, since a rejection in
one pass says nothing about approvability in another.

## Repo hygiene

Vendor repos live as sibling directories to `ai-registry-core` (`../ai-registry-<id>`). If missing,
`git clone --depth 1 <repo>`. If present, run `git status` first — if it's dirty or not on a clean
`main`, **skip this vendor and report it**, don't touch it. Otherwise
`git fetch && git checkout main && git pull --ff-only`.

**Report dirty/non-main repos up front, before researching anything.** Do a quick preflight pass
— `git status` and current branch for every vendor repo — before starting the per-vendor research
loop, and list which ones aren't clean right then, as its own separate message. Don't just quietly
skip them mid-run and mention it for the first time buried in the final summary — the whole point
of surfacing it early is so the user can clean a repo up (or tell you to) _during this same run_,
not find out after the run already finished without them. Only proceed into the research loop for
a given vendor once it's confirmed clean; still never clean up a dirty repo yourself unless the
user explicitly says so for that specific repo, in that message — this preflight report is what
makes that explicit ask possible, not a replacement for it.

## Determining GitHub search targets (plugins, skills)

For the two research passes whose primary discovery method is a `gh api search/code` pass over
known orgs (plugins, skills — MCP's _primary_ path is registry search instead, though it still runs
a supplementary, narrower GitHub code search): the set of GitHub orgs to search is the union of the
cache's `githubOrgs` for this vendor, orgs implied by this vendor's existing approvals'
`source.url`, and — only if the cache has nothing yet for this vendor — one round of discovery:
does a GitHub org literally named after the vendor id exist, and is it verified?

## Branch, commit, validate

- Stage findings on a new branch, only if there's at least one finding for that vendor: branch off
  `main`, named `<type>-audit-<YYYY-MM-DD>` (e.g. `plugin-audit-2026-09-11`,
  `skill-audit-2026-09-11`, `mcp-audit-2026-09-11` — distinct prefixes so a scoped run doesn't
  collide with a full run's branch name in the same vendor repo the same week; a full-scope run
  uses `vendor-audit-<date>` per `SKILL.md`'s own convention).
- **Exactly one commit per vendor per run, even after later fixes/reverts during the same
  session** — amend (or `reset --soft` + recommit) rather than stacking follow-up commits, so the
  branch always ends in a single clean commit before anyone pushes. Never `git commit --amend` or
  `reset` on a commit that's already been pushed (these branches never are, so this is safe here,
  but don't carry the habit elsewhere).
- The commit message must be **plain and factual (no AI attribution)**, matching that vendor
  repo's existing commit history, **and must justify each artifact concisely but traceably**: for
  every plugin/skill/MCP server added, name it, say briefly why it cleared the bar, and how origin
  was verified (e.g. "verified org, not a fork/archived", "matches vendor's own docs page
  verbatim", "confirmed absent from the MCP registry via direct lookup"). This is what lets a
  human reviewer (or a future audit) trust the approval without re-doing the verification from
  scratch. See `ai-registry-google`'s `vendor-audit-2026-09-18` commit
  ("Approve Google self-published MCP servers and two new skill categories") for a worked example.
  **Never push.**
- Validate with `npm run validate-vendor -- ../ai-registry-<id>` from `ai-registry-core`. Any file
  **this run added** that doesn't PASS gets dropped from the branch and moved to the reject pile
  with the validation error as the reason, not silently retried. **Scope that rule to your own
  files, and read the per-file PASS/FAIL lines rather than the summary verdict** — a vendor repo
  can be red on `main` for reasons predating the run, including deliberately. A pre-existing
  failure is **reported, not dropped and not fixed inside the audit commit** — folding an unrelated
  repair into a single-purpose approval commit is what the one-commit-per-vendor rule exists to
  prevent. Report it as a cross-repo issue in the final summary instead.
- **On a large vendor repo `validate-vendor` takes ~20 minutes — redirect its output to a file.**
  The google repo (47 MCP entries, 5 skill approvals resolving 200+ paths, a 17-entry marketplace)
  ran 19 minutes on 2026-10-09. Backgrounding it without an explicit `> file 2>&1` loses everything
  but the last few KB, which leaves only the summary verdict readable — precisely the failure the
  "read per-file lines, not the summary" rule exists to prevent. Redirect, then poll the file.
- **Before concluding that a vendor repo is broken, check that your `ai-registry-core` checkout is
  current** (`git fetch && git status -sb`). Validation runs against the _local_ schemas, so a
  checkout behind `origin/main` makes correctly-migrated vendor files look invalid. On 2026-10-02
  six vendor repos had migrated to the new `"streamable-http"` transport ahead of the core change;
  the audit ran from a branch that predated it, read the failures as six vendor bugs, and wrote a
  fresh batch of files in the old spelling. Vendor repos deliberately stage ahead of core for
  cross-repo schema changes (the merge order is documented in ai-registry-core#95) — "vendor repo
  red, core branch behind" is the expected transient state, not a vendor defect.

## Cache file shape (`cache/plugin-sources.json`, `cache/skill-sources.json`, `cache/mcp-sources.json`)

```json
{
  "<vendor-id>": {
    "githubOrgs": ["<org1>", "<org2>"],
    "lastChecked": "YYYY-MM-DD",
    "knownSources": {
      "<type-specific key(s), e.g. plugins/marketplaces, skills, mcpServers>": [
        "<git-url>#<path>"
      ]
    },
    "rejected": [
      {
        "url": "<git-url>",
        "type": "...",
        "reason": "...",
        "checkedAt": "YYYY-MM-DD"
      }
    ],
    "unsupportedHost": "gitlab"
  }
}
```

Keys match `vendors.json` ids. A vendor with no entry yet has never been researched by that
particular research pass — treat that as "discover from scratch," not an error. `unsupportedHost`
is only meaningful for git-hosted artifact types (plugins, skills) — see the non-GitHub gap note
below.

**`knownSources` is authoritative for dedup, not just what's literally on `main`.** A previous
run's findings can be sitting on an unmerged, unpushed-or-pushed-but-not-yet-reviewed feature
branch for a while — `main` won't reflect them yet. Check a candidate against both the vendor
repo's current `main` state _and_ this cache's `knownSources` before treating it as new; relying on
`main` alone will re-flag the same finding as "new" on a second branch every week until someone
actually merges the first one.

**There is a third place decisions live: the vendor repo's own README.** Several vendor repos carry
a "considered and excluded" section whose entries were never mirrored into a cache `rejected` list
— so nothing ever re-checks them and they go stale silently (`atlassian-labs/twg-plugins` sat
documented as excluded for a reason that had stopped being true; `ai-registry-docker`'s README
lists `docker/sbx-kits-contrib` as rejected while a committed approval sources a skill from it).
Read that section as part of reading current state, re-validate each entry's _stated reason_ rather
than trusting the verdict, and mirror anything still valid into the cache so the next run sees it.

## Verification checklist (condensed — full version in create-inferred-vendor)

A candidate clears the bar only if at least one holds, checked against the _specific_ repo, not
just the org in general:

- The repo's owner (`api.github.com/repos/<owner>/<repo>`) is the vendor's own org, not a fork,
  mirror, or similarly-named unrelated account.
- `api.github.com/orgs/<org>` returns `"is_verified": true` with a `blog` domain the vendor
  actually controls.
- The manifest/frontmatter/registry entry itself names the vendor as author/publisher, and you've
  actually opened it and read it — not trusted a search snippet.
- A vendor-run "official project" badge or marketplace/registry "verified publisher" flag,
  confirmed against that vendor's own published legend for what the badge means.

Exclude: forks/mirrors under unrelated accounts, third-party repackagings, community aggregators,
same-name-different-owner look-alikes.

**A same-org-family repo is not the vendor's own org.** A repo living under a product- or
ecosystem-specific org that merely _sounds_ affiliated with the vendor (e.g. `gemini-cli-extensions`
for Google) is not the same as the repo's owner being the vendor's actual, verified org — check
`api.github.com/orgs/<that-specific-org>` for `is_verified`/`blog` yourself, don't infer it from
the name. When that org is _not_ independently verified, a manifest's self-declared `author` field
naming the vendor is not enough on its own to approve a plugin/skill directly from it — this is
exactly the "prefer more than one signal when evidence is ambiguous" case. In that situation, only
approve entries the vendor's own verified, curated index (a marketplace file, an official docs page
that names that specific repo) actually lists; don't extend that trust to the org's other repos
just because one of them made it into the index. Before adding a new individual approval for an
ambiguous-provenance org, check the target vendor repo's own README/history first — an existing,
narrower scope decision (e.g. "only marketplace-listed entries from this org") may already be
established there and should be followed, not silently widened.

**The converse also has a test, and it is two signals, never one.** A vendor-adjacent org _can_
be admitted — `atlassian-labs` was, on 2026-10-02, the first `*-labs` approval in the registry —
but only when (a) `api.github.com/orgs/<org>` returns `is_verified: true` with a blog domain the
vendor controls, **and** (b) the specific artifact is documented on the vendor's own
product/developer-docs domain (there, `developer.atlassian.com/cloud/twg-cli/`). Neither signal
suffices alone: (a) without (b) is just a verified org publishing anything it likes, and (b)
without (a) is the `gemini-cli-extensions` trap. When you do admit one, **record the two signals
in the vendor repo's README** next to the entry, so the next run can see the basis and does not
generalise it to every similarly-named org — nothing is inherited by siblings.

## Known gap: non-GitHub-hosted vendors (git-based types only)

`gh api search/code` only reaches GitHub. A vendor who publishes from `gitlab.com` or a self-hosted
GitLab (e.g. `gitlab.eclipse.org`) can't be searched that way. WebSearch still applies and is the
primary route in this case — lean on it (vendor blog/docs, the host's own search UI via WebFetch)
rather than treating the vendor as unreachable. Record `"unsupportedHost"` in the cache entry only
if WebSearch also turned up nothing this run, so an empty result reads as "checked via web search,
found nothing" rather than silently meaning "not checked."

**GitLab-hosted vendors have a working `gh api search/code` substitute — use it as the primary
method, not WebSearch.** The GitLab REST API is usable unauthenticated for public groups (proven
2026-09-18 against `gitlab.eclipse.org/eclipse-research-labs/mosaico-project`):

0. **Establish every top-level group the vendor owns, not just the obvious one.** GitLab itself owns
   `gitlab-org` (the product) _and_ `gitlab-com` (`GET /api/v4/groups/gitlab-com` → "GitLab.com — For
   GitLab company related projects"). Searching only `gitlab-org` on 2026-10-09 would have missed the
   `dap` skill entirely. Run the keyword searches against each group.
1. `GET /api/v4/groups/<url-encoded-group-path>/projects?per_page=100&include_subgroups=true`
   enumerates every repo in a vendor's group/org, including subgroups.
   **1b. For a large group, enumeration is impractical — search it instead.** `gitlab-org` has
   thousands of projects; adding `&search=<keyword>` to that same endpoint with the four keywords
   `mcp`, `skill`, `plugin`, `agent` surfaced every real finding in one pass on 2026-10-02. Two
   false-positive classes to filter from the results: any path under `*/experiments/*`, and
   `<team-name>/skills` repos, are reliably internal.
2. `GET /api/v4/projects/<url-encoded-path>/repository/tree?recursive=true&per_page=100`
   (paginate via `&page=N`) lists every file path in a given repo — grep the returned paths for
   `plugin.json`, `marketplace.json`, `SKILL.md`, `mcp.json`. **Paginate to exhaustion or scope the
   call with `&path=skills`.** A 3-page scan of `gitlab-org/orbit/knowledge-graph` on 2026-10-09
   found no `SKILL.md` at all; the repo's root-level `skills/` directory with three skills in it
   only appeared on page 7. A short scan returns a clean empty result that reads exactly like
   "nothing here" — treat an unexhausted scan as unchecked.
3. Group/project-level **content** (blob) search (`/api/v4/groups/.../search?scope=blobs`) returns
   `401 Unauthorized` anonymously — don't rely on it; filename/path enumeration via (1)+(2) is the
   working approach instead.

Demote WebSearch to a supplement for these vendors, mirroring how `gh api search/code` is used for
GitHub vendors — it's much sparser for a small/niche vendor than a full repo-tree scan.

## Discovery: scan the org's trees, don't code-search it

**For any org under a few hundred repos, a full tree scan is the primary discovery method and
`search/code` is the supplement — not the other way round.** Four vendor agents arrived at this
independently on 2026-10-09:

1. `gh api --paginate orgs/<org>/repos` — **`--paginate` is not optional.** Without it, `atlassian`
   returned 11 active non-fork repos; with it, 105. A scan built on the short list misses every
   already-approved repo and reads as "this org has nothing," indistinguishable from a real empty
   result.
2. `gh api repos/<owner>/<repo>/git/trees/<default_branch>?recursive=1` per repo, grepping the
   returned paths for `SKILL.md`, `plugin.json`, `marketplace.json`, `mcp.json` **together** — one
   scan answers all three research passes at once. The repo listing already carries `default_branch`,
   which also satisfies the raw-fetch rule below for free.

This costs the core bucket (5000/hr) instead of `code_search` (10/hr), so it needs no rationing, and
it is authoritative where code search is not: `filename:SKILL.md org:openai` reported
`total_count: 624` but its first 100 items covered only 7 repos, while the tree scan found 22 —
including `openai/openai-dotnet`, which would have taken 5+ more code-search calls to reach. It
reconciles exactly against directory listings (`openai/skills`: 44 = 39 `.curated` + 5 `.system`),
which is what the "size the batch from the directory listing, not the hit count" rule asks for.
Across `atlassian` + `atlassian-labs`, 181 repos scanned in about two minutes.

**For a vendor already fully scanned in a previous run, `search/repositories` answers "what's new"
on a different, far cheaper bucket.** `gh api -X GET search/repositories -f q='org:<org>
created:><last-run-date> fork:false'` costs a `search` call (30/min), not a `code_search` call
(10/hr), and is the right first move for a weekly delta.

## `gh api search/code` operational notes

- Pass `-X GET` explicitly — omitting it has intermittently produced spurious 404s.
- **A negation filter can be silently ignored, and a silently-ignored negation looks like a
  finding.** `filename:plugin.json org:anthropics -path:.claude-plugin` returned 151 hits on
  2026-10-09, every one of them under `.claude-plugin/` — the `-path:` term had no effect at all.
  `-repo:` does work (below). Spot-check the first page against what the negation was supposed to
  remove before trusting the result set, and never spend the scarce budget on a query whose
  usefulness depends on an unverified negation.
- **One call, not two.** Getting `.total_count` and `.items[]` by running the same query twice burns
  two of the ten hourly code searches for one question; a single `--jq` expression yields both.
- The `search` endpoint's rate limit (30/min) is far tighter than `core` (5000/hr) and appears
  shared across concurrently-running agents; a burst of 403 "rate limit exceeded" mid-run typically
  self-resolves within ~20s. Don't mistake a transient shared-limit 403 for "no results" and
  under-search — retry after a short wait instead.
- For a repo you already know hosts a small, bounded directory (e.g. a vendor's dedicated
  plugins/skills catalog repo), `gh api repos/<owner>/<repo>/contents/<dir>` (core API, cheap) is a
  faster way to check "has anything been added since last time" than re-running a full code search.
- **`code_search` has its own, far tighter limit than `search`: 10/hour, not 30/minute.** Three
  `search/code` calls in a minute exhausted it mid-run on 2026-10-02. Check
  `gh api rate_limit --jq '.resources.code_search'` — `.resources.search` is a different bucket and
  will look healthy while code search is already blocked. Budget code-search calls accordingly and
  prefer the core-API directory/tree reads above wherever they answer the same question.
- **`-repo:<owner>/<name>` works as an exclusion filter** and is the standard way to search an org
  containing a known-rejected aggregator: `filename:SKILL.md org:github` returns 564 hits whose
  entire first page is the already-rejected `github/awesome-copilot`; adding
  `-repo:github/awesome-copilot` drops it to 165 and puts real candidates on page 1.
- **Check `default_branch` before any `raw.githubusercontent.com` fetch.** `NVIDIA/nvshmem`
  defaults to `devel`, and `curl -sf .../main/...` returns empty with no error — indistinguishable
  from "file doesn't exist", which nearly caused a false rejection on 2026-10-02. The one
  `api.github.com/repos/<owner>/<repo>` call you already need for the `fork`/`archived` checks
  carries it.

## Self-update, every run — this step is not optional

Before finishing, explicitly check whether this run taught you anything that would make the _next_
run faster or more accurate, and act on it now, not "if it comes up":

- Routine per-vendor learnings (a confirmed org, a rejected source, a host quirk) always go into
  that pass's own cache file under `cache/` — already mandatory as part of the per-vendor loop.
- Process-level learnings go into the relevant reference file (`plugin-audit.md`, `skill-audit.md`,
  or `mcp-audit.md`) — not this shared file, unless the learning is generic across all covered
  scopes: a search phrasing that reliably surfaced real hits this run, a new false-positive class
  worth excluding by default, a new format worth naming, or a faster way to recognize an
  already-covered candidate.
- If this run genuinely surfaced nothing that generalizes beyond the vendors involved, say so
  explicitly in the report ("no process update this run") rather than silently skipping the check
  — the check itself must happen every time, even when it concludes "nothing to change."

## Rules

- Never push, never open a PR, never touch `main` directly — every change lands on a dated feature
  branch, in the vendor repo it belongs to. **The audit itself always stops at the local branch.**
  Pushing and opening a PR happens only when a human explicitly asks, per vendor, after reviewing
  that vendor's findings — that is a separate decision, not the tail end of this workflow, and
  "they approved vendor A's PR" is never licence to open vendor B's. On 2026-10-02 the review was
  run vendor-by-vendor against the live sources and changed the outcome three times (openai's
  skill was nearly dropped on a misread, github's 24 skills became 14, nvidia's and google's
  commit messages carried claims that did not survive checking) — so the staged-then-reviewed
  shape is load-bearing, not ceremony.
- Never modify a vendor repo with uncommitted changes or a dirty working tree — report and move
  on, don't stash or discard someone else's in-progress work.
- Bounded per vendor: a handful of searches, not a crawl. Missing something this week is fine;
  inventing a false positive is not.
- **Vendor maturity labels have nowhere to go — flag them, don't invent a convention.** Five
  vendors hit this in the 2026-10-02 run alone: GitLab ("experimental … .v1", "(prototype)"),
  Google (12 Preview + 1 Early Access servers), Docker (`sbxenv.yaml` schemaVersion "1",
  EXPERIMENTAL), JetBrains (3 of 8 `context` skills self-labelled experimental), NVIDIA. A
  self-labelled preview/prototype artifact is still genuinely vendor-published and still clears
  the approval bar — maturity is not an ownership question. But no schema carries the
  distinction, so these publish looking identical to GA. State the label in the commit and PR
  body; **do not** start encoding it into `description` text as a workaround, which only
  produces per-vendor divergence. Tracked for a real `maturity` field.
- **Always default to conservative.** An entry is approvable only when it's _both_ clearly
  user/customer-facing _and_ its source is 100% confirmed (ownership verified, and — for skills —
  the actual body read, not inferred from frontmatter or a folder name). When a batch (a glob, an
  array, a marketplace, a catalog page) is a mix, **narrow the approval to only the individually
  confirmed subset** — via an explicit path array, not the original glob — rather than
  all-or-nothing accepting or rejecting the batch, and rather than approving on a partial sample
  of it. If narrowing down would take more verification effort than is available this run, exclude
  the unclassified remainder entirely and say so in the cache/report; don't guess. This is the
  default posture for every run, not a special case to be asked for — see the 2026-09-21 NVIDIA
  skill review (`Megatron-LM`, `NemoClaw`, `TensorRT-LLM` each narrowed from a wholesale glob down
  to only the skills actually read and confirmed customer-facing; `cudf` dropped entirely) for a
  worked example of what this looks like across a batch of vendors in one sitting.
