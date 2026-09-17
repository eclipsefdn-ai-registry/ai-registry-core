---
name: create-inferred-vendor
description: >
  Research a vendor's officially published Agent Skills, MCP servers, Agent Plugins, and A2A agents,
  then scaffold a brand-new "inferred vendor" repo for the AI Registry, pre-seeded with approvals for
  what's genuinely theirs. Use this when a user wants to onboard an organization that hasn't joined the
  registry itself yet (like the existing Google, Anthropic, or JetBrains repos) — e.g. "do the same
  research for GitHub", "add Atlassian as an inferred vendor", "create an inferred vendor repo for IBM".
argument-hint: '<vendor-name> [github-org-or-website] — e.g. "github", "atlassian", "ibm"'
---

# AI Registry — Inferred Vendor Generator

You are helping the user research a vendor and scaffold an **inferred vendor repo**: a repo the AI
Registry project itself maintains (not the vendor), pre-seeding the registry with artifacts the vendor
has published through official public channels, with a disclaimer that the vendor hasn't endorsed the
listing. `ai-registry-google`, `ai-registry-anthropic`, and `ai-registry-jetbrains` are existing examples
— read one of them end-to-end before starting if you want a concrete reference.

This is a research-heavy, multi-artifact-type task. Work through it in order; don't skip the verification
phase to get to scaffolding faster — a wrong "official" claim is worse than a missing artifact.

If the organization is directly participating instead — self-declaring and self-approving its own
artifacts, with no research/verification needed — use `create-direct-vendor` instead.

## Your Workflow

1. **Research** — find candidate Agent Skills, MCP servers, Agent Plugins, and A2A agents the vendor has
   published (see "Where to look" below).
2. **Verify** — for every candidate, confirm it's genuinely the vendor's own work, not third-party
   content the vendor merely republishes, forks, or is loosely affiliated with (see "Official vs.
   community" below). Drop or flag anything that doesn't clear this bar.
3. **Resolve MCP servers specifically against the two possible paths** — registry-listed vs.
   self-published config (see "MCP servers" below). Don't conclude "no MCP artifact" without checking
   both.
4. **Scope conservatively** — when in doubt, exclude and note the reasoning in the README rather than
   include and hope. Ask the user (`AskUserQuestion`) for genuine coin-flips.
5. **Scaffold the repo and generate approval files** — follow `vendor-repo-scaffolding.md` in this
   directory for repo setup, file templates, approval-file conventions, validation, and commit steps.
   For `organization.json`, set `"inferred": true` and use the disclaimer description text it
   documents. For the README, lead with the AI-Registry-maintained disclaimer blockquote it
   documents, then a "What this repo contains" section.
6. **Validate and commit locally only** — per `vendor-repo-scaffolding.md`. Do **not** push, and do
   **not** register the vendor in `vendors.json` — see that file's "What NOT to do automatically"
   section.

## Where to look

Do a medium-depth pass, not an exhaustive crawl — a handful of targeted searches per artifact type. Use
WebSearch/WebFetch directly, plus the GitHub API (`gh api` or plain `curl` against `api.github.com`, no
auth needed for public data) to check org/repo ownership and verification status. If the user wants a
broader, adversarially fact-checked sweep, offer the `deep-research` skill instead of trying to
approximate it by hand — but still verify anything it returns yourself (see "Official vs. community");
a research subagent's synthesis is a lead, not a citation.

- The vendor's primary GitHub org (`github.com/<vendor>`) — search for repos with a `skills/` directory
  containing `SKILL.md` files, a `plugin.json` manifest (Agent Plugin), an `agent_card.json` (A2A agent),
  or MCP server source.
- Sibling GitHub orgs the vendor operates under a different name (e.g. a product-specific org, or a
  foundation the vendor leads) — these need extra scrutiny, see below.
- The official MCP registry: `https://registry.modelcontextprotocol.io/v0.1/servers?search=<vendor>`.
- The vendor's own developer blog/docs for MCP/Skills/Plugin announcements — these often reveal the
  _current_ official artifact even when an older standalone repo has been deprecated/archived in favor
  of a bundled product feature.
- Package registries (npm, PyPI) for a scoped package under the vendor's own namespace (e.g. `@vendor/*`)
  — useful both as a research lead and as the actual MCP connection config if one exists.
- `agent-plugins.org`'s own spec/example repos are never evidence of a vendor publishing a plugin — they're
  the vendor-neutral spec, not vendor content.

## Official vs. community — verification checklist

Treat every candidate as unproven until it clears at least one of these, and prefer more than one when
the evidence is ambiguous:

- **Direct org ownership**: the repo's owner (check via `api.github.com/repos/<owner>/<repo>`) is
  literally the vendor's own GitHub org, not a mirror, fork, or similarly-named unrelated org.
- **GitHub org verification**: `api.github.com/orgs/<org>` returns `"is_verified": true` with a `blog`
  field matching a domain the vendor actually controls.
- **First-party manifest/frontmatter attribution**: an `author`/`metadata.author`/`vendor` field inside
  the artifact itself (SKILL.md frontmatter, plugin.json, marketplace listing) naming the vendor — spot
  check a few, don't trust a research summary's paraphrase of this.
  - **Vendor-published attribution tables are gold, but read them literally.** If the vendor republishes
    a curated catalog of other people's skills (JetBrains/skills republishing Anthropic's, OpenAI's, and
    others' skills is a real example), its own README table telling you which entries are _actually_
    attributed to the vendor is exactly the mechanism to use — don't credit the vendor for entries the
    table itself attributes to someone else.
- **Vendor-specific "official project" badges**: some vendors run their own labeling scheme for projects
  outside their main org (JetBrains does this — see `github.com/JetBrains#jetbrains-on-github` for what
  each badge on a `Kotlin/*` repo means). Check whether the vendor has a public legend like this before
  assuming a badge implies official status, and check it applies to the _specific repo_ in question, not
  just the org in general.
- **Marketplace "verified publisher" flags**: e.g. a plugin/extension marketplace listing's vendor object
  with `isVerified: true` and a matching organization name.
- **Scoped package ownership**: an npm/PyPI package under the vendor's own reserved scope/namespace.

Exclude, regardless of how official-sounding the name is: forks/mirrors of a real official repo hosted
under an unrelated account, third-party marketplace repackagings, community aggregator sites (useful as
a pointer, never as the proof), and same-name-different-owner look-alikes. When a repo sits under a
GitHub org that isn't literally the vendor's own but is plausibly related (a foundation, a product-line
org), require one of the concrete signals above tied to that _specific_ repo — don't infer affiliation
from name similarity alone.

## MCP servers — check both paths before concluding there's none

1. **Registry-listed**: search `registry.modelcontextprotocol.io` (see above). If found, a normal
   `create-mcp-approval`-style file with just `serverId` + `date` is enough — consolidation enriches
   name/description/version automatically.
2. **Self-published, not registry-listed**: many vendors publish a working MCP server (often bundled into
   a product, or distributed as a scoped npm/PyPI package) without ever submitting it to the official
   registry. This is still approvable — do not skip it. Use:
   - `metadata: { name, description }` — fallback display data, since the registry lookup will return
     `mcpRegistryVerified: false` (a warning, not a validation failure).
   - `config` — a `GenericMcpConfig` (`stdio` with `command`/`args`, or `http`/`sse`/`ws` with `url`)
     built from the vendor's own published connection instructions (official docs, a deprecated-but-still-
     functional repo's README, a scoped npm package). A product's in-app "copy config" UI flow that can't
     be captured as a static value (e.g. it embeds a per-instance port at runtime) is not by itself a
     reason to give up — check whether the same product also documents or ships a generic launcher
     (like a stdio proxy npm package) that works without that per-instance value.
   - `selfPublished: true` — only when the vendor is the actual publisher/maintainer (confirmed via the
     checklist above), not merely a recommended third-party server.
     See `com.jetbrains/mcp-server` in `ai-registry-jetbrains/mcp/` for a worked example of this exact
     situation (bundled, closed-source IDE plugin; connection config recovered from an archived repo whose
     README is still the officially linked answer for manual client setup).

## Scoping — default to conservative

- Never approve a vendor's full "curated collection" glob if it mixes in third-party content — narrow the
  `source.path` to just the vendor-attributed entries (explicit array of paths, not a glob, when the
  vendor-attributed items don't share a folder prefix).
- Document every inclusion/exclusion decision in the README's "What this repo contains" section,
  including artifacts you _considered and rejected_ and why (mirrors how the JetBrains repo explains
  excluding `Kotlin/kotlin-backend-agent-skills` for lacking a first-party JetBrains signal, right next
  to including `Kotlin/kotlin-agent-skills` for having one).
- If an artifact type turns up nothing that clears verification, say so explicitly in the README (e.g.
  "No Agent Plugin approval is included: no agent-plugins.org-conformant plugin was found published by
  \<vendor>") rather than silently omitting the section.
