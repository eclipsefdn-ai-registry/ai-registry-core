---
name: create-vendor-repo
description: >
  Scaffold a brand-new vendor repo for the AI Registry, in either of two modes: **direct**, for an
  organization that is participating itself and self-approving its own artifacts (Agent Skills, MCP
  servers, Agent Plugins, A2A agents), or **inferred**, for pre-seeding a vendor that hasn't joined
  yet from public research, with a disclaimer. Use this when onboarding any new organization — e.g.
  "create a vendor repo for Acme Corp", "onboard our own project as a vendor", "add Atlassian as an
  inferred vendor", "do the same research for GitHub".
argument-hint: '<vendor-id-or-name> [direct|inferred] — e.g. "ai-registry" direct, "github" inferred'
---

# AI Registry — Vendor Repo Generator

You are scaffolding a new vendor repo. Everything mechanical — repo setup, file templates,
approval-file conventions, validation, commit — is the same either way. What differs is where the
content comes from, and that is the **mode**.

## Step 0 — Pick the mode

**Direct** — the organization is participating itself, self-declaring its identity and
self-approving its own artifacts. What it tells you is authoritative, so there is no research or
verification phase. `ai-registry-eclipsesource`, `ai-registry-mosaico`, and `ai-registry-theia` are
existing examples.

**Inferred** — the AI Registry project maintains the repo, not the vendor, pre-seeding the registry
with artifacts the vendor published through official public channels, with a disclaimer that the
vendor hasn't endorsed the listing. `ai-registry-google`, `ai-registry-anthropic`, and
`ai-registry-jetbrains` are existing examples.

Infer the mode from the request. The user asking on the organization's behalf ("our project", "we
publish", "set up a repo for us"), or naming artifact sources directly, means direct. The user
asking about a third party they don't speak for ("add Atlassian", "do the same research for X")
means inferred. If it's genuinely ambiguous, ask with `AskUserQuestion` — the disclaimer and the
whole verification phase hang on this, so don't guess quietly.

Read one existing repo of the chosen mode end-to-end before starting if you want a concrete
reference.

## Workflow

1. **Gather organization metadata**: `id` (lowercase, alphanumeric, hyphens), `name`,
   `description`, `website`, `color`, and optionally `tools`. See "`organization.json`" below.
2. **Gather artifact sources** — which Agent Skill/MCP server/Agent Plugin/A2A agent repos (and
   paths within them) to approve.
   - **Direct**: the user tells you, or you read the organization's own repo structure (e.g. a
     `skills/` directory of `SKILL.md` folders) to find them. The source is already known and
     self-declared, so there's no need to search the wider web.
   - **Inferred**: this is the research-heavy part of the job. **Read
     `references/inferred-research.md` now** and work through it in order — where to look, how to
     verify official vs. community, how to resolve MCP servers, and how to scope conservatively.
     Don't skip the verification phase to get to scaffolding faster; a wrong "official" claim is
     worse than a missing artifact.
3. **Scaffold the repo and generate approval files** — the rest of this file.
4. **Validate and commit locally only** — see "Validate" and "Commit".
5. **Wire up trust, if asked** — see "Trust relationships".
6. **Stop** — see "What NOT to do automatically", and tell the user what's left.

## Repo setup

Create the new repo as a sibling directory to the other vendor repos (same parent directory as
`ai-registry-core`), so relative paths and `AI_REGISTRY_CORE_DIR` defaults work:

```bash
mkdir -p ../ai-registry-<id>/skills   # add mcp/ plugins/ agents/ as needed
cd ../ai-registry-<id>
git init
git branch -M main
git remote add origin git@github.com:eclipsefdn-ai-registry/ai-registry-<id>.git
```

## `organization.json`

Always include `id`, `name`, `description`, `website`, and `color` — never omit `color` for a new
vendor, even when it takes a little more digging. Try, in order, stopping at the first hit:

1. The vendor homepage's `theme-color` meta tag:
   `curl -s https://vendor.com | grep -io 'theme-color[^>]*content="[^"]*"'`.
2. A primary/accent brand color pulled from the vendor's own site CSS if step 1 turns up nothing
   (e.g. a `--color-primary`-style custom property, or the color used for primary buttons/links) —
   `curl -s https://vendor.com/path/to/style.css | grep -i primary` is a reasonable starting point;
   for a vendor whose site is built from a known repo, reading the source CSS directly is faster
   than reverse-engineering it from a compiled bundle.
3. If neither turns up anything quickly, pick a hex that visibly matches the vendor's actual brand
   (e.g. a color sampled from their logo) rather than a generic default — a wrong-but-plausible
   guess is worse than spending one more minute looking, but the field must never end up omitted.

Only include `tools` if the organization provides an installable tool itself — most vendors don't;
they just publish artifacts that other tools install.

The two modes differ only in `description` and the `inferred` flag:

- **Inferred**: set `"inferred": true` and use this description verbatim: `"This entry is based
solely on information published through the organisation's official public channels. The
organisation has not endorsed, approved or validated this listing, and is not necessarily
participating in the AI Registry."`
- **Direct**: omit `inferred` entirely (schema defaults to `false`) and use a plain, factual
  description of the organization/project itself — see `ai-registry-mosaico/organization.json` for
  the shape.

## `package.json`

Copy verbatim (matches every existing vendor repo):

```json
{
  "private": true,
  "scripts": {
    "validate": "CORE=$(mktemp -d) && git clone --depth 1 https://github.com/eclipsefdn-ai-registry/ai-registry-core.git \"$CORE\" && npm --prefix \"$CORE\" ci --silent && npm run --prefix \"$CORE\" validate-vendor -- \"$PWD\"; CODE=$?; rm -rf \"$CORE\"; exit $CODE",
    "validate:local": "npm run --prefix ${AI_REGISTRY_CORE_DIR:-../ai-registry-core} validate-vendor -- $PWD"
  }
}
```

## `.github/workflows/validate.yml`

Copy verbatim — the plain version, without a `schedule:` trigger or a "Stale skill references"
step (dead code some older vendor repos still carry; don't reintroduce it):

```yaml
name: Validate

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout vendor repo
        uses: actions/checkout@v5
        with:
          path: vendor

      - name: Checkout central repo
        uses: actions/checkout@v5
        with:
          repository: eclipsefdn-ai-registry/ai-registry-core
          ref: main
          path: core

      - name: Setup Node.js
        uses: actions/setup-node@v5
        with:
          node-version: "22"

      - name: Install core dependencies
        run: cd core && npm ci

      - name: Validate vendor repo
        run: cd core && npm run validate-vendor -- ../vendor

      - name: Trigger consolidation
        if: github.event_name == 'push' && github.ref == 'refs/heads/main'
        run: |
          if [ -z "$GH_TOKEN" ]; then
            echo "::warning::CORE_REGISTRY_DISPATCH_TOKEN not set — skipping consolidation trigger"
            exit 0
          fi
          gh api repos/eclipsefdn-ai-registry/ai-registry-core/actions/workflows/build.yml/dispatches \
            -f ref=main
        env:
          GH_TOKEN: ${{ secrets.CORE_REGISTRY_DISPATCH_TOKEN }}
```

## `LICENSE`

Copy the Eclipse Public License v2.0 text verbatim from any existing vendor repo (e.g.
`ai-registry-google/LICENSE`).

## `README.md`

Both modes: a title (`# AI Registry — <Vendor Display Name>`, with `(Inferred)` appended for
inferred vendors), a short body naming what the repo contains, and a closing "Documentation"
section:

```markdown
## Documentation

See the [Vendor Guide](https://github.com/eclipsefdn-ai-registry/ai-registry-core#vendor-guide) in the central repository for how vendor repos work, how to add approvals, and how validation runs.
```

- **Inferred**: lead with a blockquote disclaimer that this is an AI-Registry-maintained, not
  vendor-maintained, repo (see `ai-registry-jetbrains/README.md`), then a "What this repo contains"
  section naming each source repo/product per artifact type and _why_ it qualified — including
  anything considered and rejected.
- **Direct**: a plain one-paragraph body is enough (see `ai-registry-mosaico/README.md` or
  `ai-registry-eclipsesource/README.md`) — no disclaimer, no per-source justification, since the
  organization is speaking for itself.

## Approval files

One file per distinct upstream source (not one file per vendor): if the org publishes skills from
three different repos, that's three skill approval files with three different base IDs, even though
they all live under one vendor's `skills/` directory. Follow `create-skill-approval`/
`create-mcp-approval`/`create-plugin-approval`'s ID and naming-convention rules exactly
(reverse-domain ID, `/` → `--` in the filename). For A2A agents, mirror
`ai-registry-mosaico/agents/*.json` against `schemas/agent-approval.schema.json` (no dedicated
skill exists yet). Approvals surfaced purely through a `trusts` relationship (see below) never need
`installConfigs` — see `ai-registry-google/skills/*.json` and `ai-registry-anthropic/skills/*.json`,
which carry none, relying entirely on the trusting org's own tool configuration.

## Validate

From `ai-registry-core`:

```bash
npm run validate-vendor -- /path/to/ai-registry-<id>
```

Expect PASS on every file. A WARNING like "not found in Anthropic MCP registry" on a self-published
MCP approval is expected and fine. Any ERROR means a schema or cross-check problem to fix before
moving on.

## Commit

```bash
git add -A
git commit -m "<plain, factual message describing the actual content>"
```

Keep messages plain and factual, matching every existing vendor repo's commit history — no AI
attribution or co-author trailer.

## Trust relationships

A new vendor repo — either mode — is often something existing vendors want to delegate trust to
(see the `trusts` field in `schemas/organization.schema.json`). `ai-registry-theia` trusts
`anthropic`, `openai`, `aws` and `google` (all inferred) plus `eclipsesource` and `ai-registry`
(both direct), so don't treat this as a direct-mode-only step.

Only do this when the user asks for it. For each vendor repo that should trust the new org:

- `git status` first — if it's dirty or not on a clean `main`, skip it and report, don't touch it.
- Otherwise `git checkout main && git pull --ff-only`, then create a new feature branch off main —
  don't commit trust changes directly to `main`.
- Add an entry to that vendor's `organization.json` `trusts` array:
  `{ "org": "<new-vendor-id>", "artifactTypes": { "<type>": {} } }` — if an entry for this org
  already exists, add the missing artifact type to it instead of adding a duplicate entry.
- If a direct approval file for this org's content already exists in the trusting vendor's own
  `skills/`/`mcp/`/`plugins/`/`agents/` directory (predating the new vendor repo), remove it as
  part of the same commit — the new `trusts` entry supersedes it.
- Commit locally only, same plain/factual/no-AI-attribution convention as everywhere else. Never
  push someone else's vendor repo without being asked to.

## What NOT to do automatically

Stop after the local commit. Do not:

- Push to the remote — the GitHub repo (`eclipsefdn-ai-registry/ai-registry-<id>`) needs to exist
  first, and creating it / pushing to it is the user's call.
- Add the vendor to `vendors.json` in `ai-registry-core` and push _that_ — registering the vendor
  makes the shared consolidation pipeline start cloning a repo that may not exist yet, and pushing
  the core repo's `main` branch is a shared-state action regardless.

Tell the user explicitly what's left:

1. Create `eclipsefdn-ai-registry/ai-registry-<id>` on GitHub (yours or theirs to do).
2. `git push -u origin main` from the new repo.
3. Add `{ "id": "<id>", "repo": "https://github.com/eclipsefdn-ai-registry/ai-registry-<id>.git" }`
   to `vendors.json` in `ai-registry-core` and commit (pushing that commit is a separate decision).
