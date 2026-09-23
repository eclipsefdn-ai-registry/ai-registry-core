---
name: audit-mcp-server-sources
description: >
  Weekly discovery sweep across every AI Registry vendor for newly published MCP servers (both
  registry-listed and self-published) that aren't approved yet, verified as genuinely
  vendor-published, staged as a local feature branch per vendor repo (never pushed). Use when
  running the recurring MCP server audit, or when asked to check registry vendors for new MCP
  servers to approve.
---

# AI Registry — MCP Server Source Audit

Recurring (intended: weekly) research pass over every vendor already in the registry, looking for
MCP servers the vendor has published since the last run. This is discovery, not onboarding — it
only touches vendors already listed in `vendors.json`; use `create-inferred-vendor` to add a
brand-new vendor.

Unlike plugins and skills, MCP servers aren't discovered by scanning git repos for a manifest
filename — there is no fixed `mcp.json`/`SKILL.md`-style file convention to code-search for. The
canonical discovery path is the **official MCP registry** first, WebSearch second, for servers the
vendor publishes without ever registering.

**REQUIRED BACKGROUND:** Read `skills/vendor-audit-conventions.md` in this repo first — it covers
repo hygiene, branching/commit/validate, the cache file shape, the verification checklist, and the
self-update rule, shared across all three vendor-audit skills (its non-GitHub-host gap note does
not apply here — see below for the MCP-specific equivalent). This file only covers what's specific
to MCP servers. Also read `create-mcp-approval` for the approval file format this skill produces,
and `create-inferred-vendor`'s "MCP servers — check both paths" section for the
registry-listed-vs-self-published distinction this audit leans on.

## Workflow

1. **Load the cache** — read `known-vendor-sources.json` in this skill's directory. For each
   vendor: known GitHub orgs (for the self-published-search fallback), sources already approved
   (skip these), and previously rejected candidates (skip re-verifying unless `lastChecked` is
   more than ~90 days old).
2. **For each vendor in `vendors.json`** (parallelizable — dispatch one subagent per vendor for
   the research step, since vendors are fully independent; keep branch/commit work in the
   dispatching thread so git state stays predictable), do the following:
   - **Get a clean local repo and read current state** — per `vendor-audit-conventions.md`. Read
     `organization.json` and every `mcp/*.json`. Build the set of already-approved `serverId`s
     (registry-listed) and self-published server identities (by `config`/`metadata`, since a
     self-published entry has no `serverId` to key off of the same way) so you never re-suggest
     something already there.
   - **Registry-listed path (primary)**: query
     `https://registry.modelcontextprotocol.io/v0.1/servers?search=<vendor-name-or-org>` for
     servers whose `serverId` namespace matches this vendor (e.g. `io.github.<vendor-org>/*`).
     Anything returned that isn't already in `mcp/*.json` is a candidate — for these, a normal
     approval is just `serverId` + `date`, since consolidation enriches name/description/version
     from the registry automatically.
   - **Self-published path (secondary, bounded)** — a vendor can ship a working MCP server (often
     bundled into a product, or a scoped npm/PyPI package) without ever submitting it to the
     registry; don't skip this just because the registry search came back empty. Aim for ≤4
     queries/vendor:
     - WebSearch for the vendor name plus `MCP server`, and separately plus Model Context
       Protocol, and check the vendor's own developer blog/docs for a server announcement.
     - Check package registries for a scoped package under the vendor's own namespace (e.g.
       `@vendor/mcp-server` on npm) — useful both as a lead and as the actual connection config.
     - `gh api search/code -f q='mcpServers org:<org>'` per known GitHub org, as a precise
       supplement — many self-published servers ship an example `mcpServers` config block in
       their README or a sample config file. This only reaches github.com; a vendor bundling a
       closed-source server (nothing on GitHub at all) has to be found via the web/docs route
       above instead — there's no code-search equivalent for that case, so don't report "nothing
       found" without having tried the web route too.
     - Check for a vendor-published "supported products"/"managed servers" catalog page (one
       WebFetch) — this can be a single high-yield source enumerating dozens of servers at once
       (see `docs.cloud.google.com/mcp/supported-products`, which alone surfaced 41 servers on
       2026-09-18); don't undercount this path's potential yield just because it's nominally
       "secondary" to the registry search. For a self-published server family sharing one apex API
       domain, mint serverIds as `<reverse-domain-of-apex>/<product-slug>` (e.g.
       `com.googleapis/bigquery` for `bigquery.googleapis.com`), analogous to the
       `com.gitlab.<group>/<name>` plugin-id convention for non-GitHub hosts.
     - A repo literally named `<vendor>-registry`/`<vendor>-catalog`/`mcp-registry` (e.g.
       `docker/mcp-registry`) needs the same open-submission check marketplace files get in the
       plugin audit — read its README before treating any listed entry as vendor-authored; an
       aggregator that accepts community PRs for third-party servers isn't a single self-published
       vendor server and doesn't fit the marketplace schema either.
     - Exclude a candidate that is a **framework/SDK building block** for embedding MCP-server
       capability into a downstream product, rather than a standalone artifact with a fixed,
       connectable config (no fixed command/serverUrl — availability is per-deployment). Example:
       `@theia/ai-mcp-server` lets *other* Theia-based applications expose an MCP endpoint at a
       deployment-specific port; it isn't itself an installable server. Same exclusion class as
       `.claude-plugin/`-style tool-specific manifests for plugins/skills.
   - **Drop anything already approved** (registry-listed `serverId` match, or a self-published
     entry whose `config`/`metadata` clearly describes the same server already in `mcp/*.json`) or
     already in the cache's `rejected` list.
   - **Drop anything already covered by an approved (or marketplace-fanned-out) Agent Plugin's
     `mcp.json`.** Per `AGENTS.md`, a plugin's bundled MCP servers are surfaced as read-only
     `containedMcpServers` metadata through the plugin approval, not as separate standalone MCP
     entries — same principle as `audit-skill-sources`' equivalent rule for a plugin's
     `containedSkills`. Cross-check candidates against this vendor's `plugins/*.json` (and any
     fanned-out marketplace entries) before treating a plugin-bundled MCP server as a new finding.
     This applies even when the containing plugin isn't agent-plugins.org-approvable — a
     Claude Code-native plugin bundle's `.mcp.json` (a `.claude-plugin/plugin.json` sibling) is
     still tool-packaging detail, not a standalone self-published server, for the same reason a
     Claude Code-native plugin's `SKILL.md` files aren't standalone skills.
   - **Verify every remaining candidate** against `vendor-audit-conventions.md`'s checklist, plus:
     only treat a self-published candidate as the vendor's own if the vendor is the actual
     publisher/maintainer (confirmed via the checklist), never merely a recommended or bundled
     third-party server — this maps directly to `selfPublished: true` in the approval, which is
     exactly the field that makes that claim. Anything that doesn't clearly clear the bar goes to
     the reject pile with a one-line reason; it does not become an approval, and does not get
     asked about.
   - **A GitHub-hosted server's repo being archived is a separate check from ownership/authorship
     and the checklist above doesn't cover it** — `gh api repos/<owner>/<repo>` and check
     `"archived"`. A server can still be genuinely vendor-owned, registry-listed, and even
     technically installable while its source repo is archived (i.e. the vendor themselves marked
     it deprecated/unmaintained); treat that as a reject, not a pass, even though it clears every
     other bar (caught 2026-09-18 on `awslabs/mcp-server-for-oscal` — registry-listed at v0.4.0,
     ownership and authorship both clean, but archived since 2026-06-23).
   - **Stage genuine findings** — for a registry-listed server, write `mcp/<serverId>.json` with
     just `serverId` + `date` (no `metadata`/`config` needed) — consolidation enriches
     name/description/version from the registry, and the registry lookup (`lookupServer` in
     `src/anthropic-registry.ts`) never pulls connection info (`packages`/`remotes`), so a bare
     registry-listed entry genuinely has no connection instructions surfaced anywhere by default.
     For a self-published server, write `mcp/<serverId>.json` with `metadata: { name, description
     }`, a `config` (`GenericMcpConfig`) built from the vendor's own published connection
     instructions, and `selfPublished: true` — see `com.jetbrains/mcp-server` in
     `ai-registry-jetbrains/mcp/` for a worked example. **Before marking a candidate
     `selfPublished` instead of registry-listed, confirm it's actually absent from the registry**
     with a direct check (`curl
     "https://registry.modelcontextprotocol.io/v0.1/servers/<url-encoded-serverId>/versions"` — a
     404 confirms it; don't just assume from an earlier search not surfacing it). Create the `mcp/`
     directory first if the vendor repo has no prior MCP approvals. Branch, commit, and validate
     per `vendor-audit-conventions.md`. A registry-not-found WARNING during validation is expected
     and fine for a still-propagating registry entry; any ERROR is not — drop and reject on ERROR.
   - **Check the vendor's own maturity label (GA / Preview / Beta / Developer Preview / etc.) when
     their docs distinguish one** — the schema has no field to carry that distinction through to
     the website, so an early-access entry shows up looking identical to a GA one. Not
     automatically a reject (it's still genuinely vendor-published), but flag mixed-maturity
     batches in the report explicitly rather than silently approving everything at the same
     confidence level — e.g. Google's official MCP catalog page separates a "Google Workspace MCP
     Servers (Developer Preview)" table from its GA/Preview Cloud tables; approved 2026-09-18
     without distinguishing the two in the commit message, caught on review 2026-09-21.
   - **If you do add a `config` (or `installConfigs`) to a registry-listed entry to fill that
     connection-info gap, don't build it from the registry's own `packages`/`packageArguments`
     data alone — cross-check the vendor's own current getting-started/setup docs page.** The
     registry submission can be stale or incomplete relative to what the vendor actually
     documents: AWS's registry entries for `aws.api.us-east-1.ecs-mcp/server` and
     `aws.api.us-east-1.eks-mcp/server` list only a bare `uvx mcp-proxy-for-aws <url>` positional
     invocation, but AWS's own getting-started pages (`docs.aws.amazon.com/.../ecs-mcp-getting-started.html`,
     `.../eks-mcp-getting-started.html`) show every example additionally requires a `--service
     <name>` flag with no default — omitted, the config silently doesn't work. Caught 2026-09-20/21
     only by fetching the vendor's live docs, not from the registry data.
   - **A region embedded in a `serverId` (e.g. `aws.api.us-east-1.ecs-mcp/server`) does not by
     itself mean the region should be hardcoded in the config.** Check whether the vendor's own
     docs present it as a fixed value or a `{region}`/`<region>`-style placeholder the user is
     instructed to replace — AWS's docs do the latter for these entries even though the one
     registered `serverId` happens to say `us-east-1`, because the underlying service spans
     multiple regions and only one region's entry has been registered so far.
   - **The generic root `config` (`GenericMcpConfig`) currently has no field to explain what a
     `<placeholder>` means** (tracked as ai-registry-core#122; `GenericConfigView` on the website
     only renders one fixed, generic caveat, never anything placeholder-specific). Until that's
     resolved, when a connection command has a non-obvious placeholder (region, profile, endpoint,
     etc.) that a reader needs explained, prefer a tool-specific `installConfigs` entry with an
     `instructions` string over the bare root `config` — see the `kiro` entries added to
     `aws.api.us-east-1.ecs-mcp--server.json`/`eks-mcp--server.json` for a worked example. If the
     placeholder is genuinely self-evident (a bare URL, an npm/PyPI package name with no
     variables), the plain root `config` is still fine.
   - **Update the vendor's cache entry** — confirmed `githubOrgs`, `lastChecked` = today, newly
     approved sources appended to `knownSources.mcpServers`, new rejections appended with reason
     and date.
3. **Write back `known-vendor-sources.json`** with all vendor updates from the previous step.
4. **Report a summary**: per vendor — branch created (if any) and files added, candidates
   rejected and why, or "nothing new" / "skipped: dirty working tree". This is a staged proposal;
   pushing and opening PRs is a separate, human decision.
5. **Self-update** — per `vendor-audit-conventions.md`'s rule, every run, no exceptions.

## MCP-specific gap: unreachable self-published servers

There's no `unsupportedHost` equivalent here the way there is for git-hosted plugins/skills — the
registry-listed path works identically regardless of where a vendor is otherwise hosted. The real
gap is a self-published server with **no public trace at all** (closed-source product, no README
config sample, no blog post): if the registry search and the bounded web search both come back
empty, report "nothing new" for that vendor, not a special gap category — there's nothing further
to try boundedly, and an unbounded crawl isn't this skill's job.
