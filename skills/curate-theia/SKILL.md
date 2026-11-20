---
name: curate-theia
description: >
  Monthly curation review for the Theia organization in the AI Registry: which widely adopted MCP
  servers, Agent Skills and Agent Plugins Theia users would expect but Theia covers neither directly
  nor through trust, and whether Theia's `trusts` in `organization.json` should be added to, widened,
  narrowed or dropped. Produces a ranked proposal for a human; writes no approval files. Use when
  asked to curate Theia, review Theia's trusts, or find popular artifacts missing from Theia. Not for
  inferred vendors — that is `audit-vendor-sources`.
---

# Theia curation review

Theia is not a publisher. It curates for Eclipse Theia users: popular third-party artifacts approved
directly (`obra/superpowers`, the Notion and Stripe MCP servers) plus other organizations' approvals
taken through `trusts`. So the question here is "what do Theia users expect that Theia doesn't
cover?", not the vendor audit's "what did this vendor publish?".

Paths are relative to this skill's directory, except `vendors.json` and `src/` (core repo root) and
the organization repos (`../ai-registry-<id>` next to core).

## Output

The run produces one proposal and a cache update, nothing else. Never write approval files, never
edit `organization.json`, never branch or commit in `ai-registry-theia`. A human decides; the
approval files are written afterwards, with `create-*-approval`.

The proposal has these parts, in order:

1. **Coverage now**: per artifact type, how many Theia has and how many of those come directly vs.
   through each trusted org.
2. **Existing approvals to fix**: drift in what Theia already approved (a glob that matches nothing,
   a serverId gone from the MCP registry, a source that moved). Each with a proposed fix.
3. **Gaps, ranked**: one table per type (MCP servers, skills, plugins). Each row: id and source,
   owner and how it was verified, adoption evidence with numbers and dates, why Theia users want
   it, and blockers still to check (license, client compatibility, conformance).
4. **Trust review**: one row per org already trusted or worth trusting. Each row: today, proposal
   (keep / add / widen / narrow / drop, per artifact type), what it would bring in (count and
   examples), inherited risks, reason. For an inferred org, inherited risks names its open PRs
   (`gh pr list -R eclipsefdn-ai-registry/ai-registry-<id> --state open`) and any approved glob
   whose members were sampled, not read. "None" is a valid answer, a blank isn't.
5. **Considered and not proposed**: each with a one-line reason.
6. **Process notes**: signals used, calls made, what was skipped or uncertain.

## Workflow

1. **Load `cache/theia-curation.json`.** Skip any candidate there with `status: "declined"` unless
   its `reason` has stopped being true; say so if you re-raise one. List every `proposed` entry
   from earlier runs that still isn't approved in an "Open from earlier runs" line, rather than
   proposing it as new.
2. **Measure coverage from the live feed**, `https://ai.open-vsx.org/api/v1/all.json`, not a local
   `dist/` (it can be weeks old). An entry is Theia's when Theia appears among its approvers,
   directly or through trust (see `resolve*Trust` in `src/consolidate.ts`). Diffing this month's
   coverage against the cache's `coverage` from last run finds silent drops: an approved glob
   that suddenly matches fewer folders.
3. **Find candidates.** Pick from these sources:
   - the official MCP registry, by vendor namespace;
   - other clients' curated catalogs, such as the VS Code MCP gallery and Claude's connector
     directory;
   - skills.sh's leaderboard;
   - GitHub stars and recent activity on the source repo;
   - npm/PyPI downloads for packaged servers.
4. **Check each candidate against the other registry organizations first.** `grep` the
   `../ai-registry-*/` repos and the `audit-vendor-sources` caches
   (`../audit-vendor-sources/cache/*.json`).
   - **Approved there:** if Theia already trusts that org for the type, it's covered. If not, it
     becomes a trust question for part 4, not a direct approval.
   - **Rejected there:** carry the reason over. An artifact the vendor audit rejected as internal
     doesn't become approvable because it's popular.
5. **Verify each surviving gap.**
   - **Ownership:** apply the vendor audit's checklist
     (`../audit-vendor-sources/references/conventions.md`). Use the vendor's own org, a
     DNS-verified `com.*` registry namespace, or a verified `io.github.<org>`. Theia approves
     individuals' repos too (obra, mattpocock), but only well-known maintainers with years of
     public history.
   - **License:** read the license, not just the API's `license` field.
   - **Client compatibility:** check whether Theia's tools can actually use the artifact. Some
     vendors' remote servers only accept allowlisted OAuth clients (Figma, Vercel). An unknown
     answer is a blocker in the row, not a pass.
   - **Plugins and skill paths:** check full conformance, not just `$schema`. Write the candidate
     approvals into a throwaway vendor repo under `/tmp` (an `organization.json` plus the files)
     and run `npm run validate-vendor -- <that dir>` from core. Phase 4 reports Agent Plugin
     conformance, and the skill phase resolves globs.
6. **Rank** by adoption first, then fit for an IDE audience, then how much a single approval brings
   (a vendor plugin bundling skills and an MCP server beats either alone).
7. **Review trust.** Base it on what each org has approved, read from its repo and the feed, never
   on its reputation. Keep in mind:
   - **Trust is all or nothing per artifact type.** The per-type conditions in the schema are
     reserved and empty, so everything that org approves under that type comes in, including
     its future approvals.
   - **Trusting an inferred org means trusting our own weekly audit of it**
     (`"inferred": true` in its `organization.json`). Its approvals change every week and are only
     as careful as that audit. Name that org's open audit PRs and any approved glob whose members
     were only sampled, not read.
   - **A non-inferred org decides its own approvals.** Trusting it delegates judgment to it.
   - **Theia's own approval stays when a trusted org approves the same artifact**, so a new trust
     can make direct approvals redundant. List them as candidates for removal.
   - **A trust entry for a type Theia's tools can't install is dead weight.** For example,
     `agents` with no `agentInstallUrlPrefix`. Propose dropping it.
8. **Update `cache/theia-curation.json`** (format below). This is the only file the run writes; it
   lands with the month's audit records on the monthly `vendor-audit-<YYYY-MM>` branch in core.

## Cache format

```json
{
  "lastRun": "YYYY-MM-DD",
  "coverage": { "mcp": { "total": 0, "direct": 0, "trusted": { "<org>": 0 } } },
  "candidates": [
    {
      "id": "<serverId, skillId or pluginId>",
      "type": "mcp | skill | plugin",
      "source": "<repo URL or registry id>",
      "status": "proposed | declined | approved | deferred",
      "reason": "<one line: why proposed, or why not>",
      "checkedAt": "YYYY-MM-DD"
    }
  ],
  "fixes": [
    {
      "approval": "<file in ai-registry-theia>",
      "problem": "...",
      "proposal": "...",
      "status": "proposed | applied | declined",
      "checkedAt": "YYYY-MM-DD"
    }
  ],
  "trustDecisions": [
    {
      "org": "<id>",
      "types": ["mcp"],
      "status": "proposed | declined | applied",
      "reason": "...",
      "checkedAt": "YYYY-MM-DD"
    }
  ]
}
```

When the human decides, move entries from `proposed` to `approved` or `declined`, with their
reason. That keeps next month from asking again.

## Common mistakes

| Mistake                                                                   | Instead                                                                                                                                                       |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ranking by skills.sh installs alone                                       | Look-alike repos reusing a popular name ("superpowers") and unknown owners top the list. Install counts are cheap to inflate; weigh owner identity and stars. |
| Proposing a direct approval for something a registry org already approves | Make it a trust question (step 4).                                                                                                                            |
| Treating "popular" as overriding a vendor-audit rejection                 | Carry the rejection over.                                                                                                                                     |
| Trust judged by the org's name                                            | Judge by what it has approved: count, the riskiest items, open audit PRs.                                                                                     |
| Proposing remote MCP servers without checking client access               | Put the open question in the row as a blocker.                                                                                                                |
| Re-proposing last month's declined items                                  | Read the cache first.                                                                                                                                         |
