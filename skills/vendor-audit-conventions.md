# Vendor Audit — Shared Conventions

Shared scaffolding for the recurring weekly discovery audits — one per artifact-type family:
`audit-agent-plugin-sources` (Agent Plugins + marketplaces), `audit-skill-sources` (Agent Skills),
`audit-mcp-server-sources` (MCP servers). Each of those SKILL.md files covers only what's
type-specific (what to search for, how to filter false positives, what approval file to write);
everything else lives here so the three don't drift independently. Each skill's own directory
still keeps its own `known-vendor-sources.json` — they are not shared, since a rejection in one
audit says nothing about approvability in another.

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

For the two audits whose primary discovery method is a `gh api search/code` pass over known orgs
(plugins, skills — MCP's _primary_ path is registry search instead, though it still runs a
supplementary, narrower GitHub code search): the set of GitHub orgs to search is the union of the
cache's `githubOrgs` for this vendor, orgs implied by this vendor's existing approvals'
`source.url`, and — only if the cache has nothing yet for this vendor — one round of discovery:
does a GitHub org literally named after the vendor id exist, and is it verified?

## Branch, commit, validate

- Stage findings on a new branch, only if there's at least one finding for that vendor: branch off
  `main`, named `<type>-audit-<YYYY-MM-DD>` (e.g. `plugin-audit-2026-09-11`,
  `skill-audit-2026-09-11`, `mcp-audit-2026-09-11` — distinct prefixes so the three audits can run
  the same week without colliding on one branch name in the same vendor repo).
- Commit locally with a plain, factual message (no AI attribution, matching that vendor repo's
  existing commit history). **Never push.**
- Validate with `npm run validate-vendor -- ../ai-registry-<id>` from `ai-registry-core`. Any file
  that doesn't PASS gets dropped from the branch and moved to the reject pile with the validation
  error as the reason, not silently retried.

## `known-vendor-sources.json` shape

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
particular audit — treat that as "discover from scratch," not an error. `unsupportedHost` is only
meaningful for git-hosted artifact types (plugins, skills) — see the non-GitHub gap note below.

**`knownSources` is authoritative for dedup, not just what's literally on `main`.** A previous
run's findings can be sitting on an unmerged, unpushed-or-pushed-but-not-yet-reviewed feature
branch for a while — `main` won't reflect them yet. Check a candidate against both the vendor
repo's current `main` state _and_ this cache's `knownSources` before treating it as new; relying on
`main` alone will re-flag the same finding as "new" on a second branch every week until someone
actually merges the first one.

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

## Known gap: non-GitHub-hosted vendors (git-based types only)

`gh api search/code` only reaches GitHub. A vendor who publishes from `gitlab.com` or a self-hosted
GitLab (e.g. `gitlab.eclipse.org`) can't be searched that way. WebSearch still applies and is the
primary route in this case — lean on it (vendor blog/docs, the host's own search UI via WebFetch)
rather than treating the vendor as unreachable. Record `"unsupportedHost"` in the cache entry only
if WebSearch also turned up nothing this run, so an empty result reads as "checked via web search,
found nothing" rather than silently meaning "not checked."

## Self-update, every run — this step is not optional

Before finishing, explicitly check whether this run taught you anything that would make the _next_
run faster or more accurate, and act on it now, not "if it comes up":

- Routine per-vendor learnings (a confirmed org, a rejected source, a host quirk) always go into
  that skill's `known-vendor-sources.json` — already mandatory as part of the per-vendor loop.
- Process-level learnings go into that skill's own `SKILL.md` (not this shared file, unless the
  learning is generic across all three audits): a search phrasing that reliably surfaced real hits
  this run, a new false-positive class worth excluding by default, a new format worth naming, or a
  faster way to recognize an already-covered candidate.
- If this run genuinely surfaced nothing that generalizes beyond the vendors involved, say so
  explicitly in the report ("no process update this run") rather than silently skipping the check
  — the check itself must happen every time, even when it concludes "nothing to change."

## Rules

- Never push, never open a PR, never touch `main` directly — every change lands on a dated feature
  branch, in the vendor repo it belongs to.
- Never modify a vendor repo with uncommitted changes or a dirty working tree — report and move
  on, don't stash or discard someone else's in-progress work.
- Bounded per vendor: a handful of searches, not a crawl. Missing something this week is fine;
  inventing a false positive is not.
