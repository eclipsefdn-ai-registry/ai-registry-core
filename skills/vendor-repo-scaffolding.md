# Vendor Repo Scaffolding — Shared Conventions

Shared scaffolding steps for the two vendor-repo-creation skills — `create-inferred-vendor` (a
vendor that hasn't joined the registry, pre-seeded from research) and `create-direct-vendor` (an
organization directly participating, self-approving its own artifacts). Everything mechanical and
identical between the two lives here so they don't drift independently; each skill's own SKILL.md
covers only what's specific to its mode (research/verification for inferred, gathering info
directly from the organization for direct).

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

Always include `id`, `name`, `description`, `website`. `color` is optional and cosmetic — a quick
source is the vendor homepage's `theme-color` meta tag
(`curl -s https://vendor.com | grep -io 'theme-color[^>]*content="[^"]*"'`); omit if nothing turns
up quickly. Only include `tools` if the organization provides an installable tool itself — most
vendors don't; they just publish artifacts that other tools install.

The two modes differ only in `description` and the `inferred` flag:

- **Inferred** (see `create-inferred-vendor`): set `"inferred": true` and use this description
  verbatim: `"This entry is based solely on information published through the organisation's
official public channels. The organisation has not endorsed, approved or validated this listing,
and is not necessarily participating in the AI Registry."`
- **Direct** (see `create-direct-vendor`): omit `inferred` entirely (schema defaults to `false`)
  and use a plain, factual description of the organization/project itself — see
  `ai-registry-mosaico/organization.json` for the shape.

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
skill exists yet). Approvals surfaced purely through a `trusts` relationship (see
`create-direct-vendor`'s trust step) never need `installConfigs` — see `ai-registry-google/skills/*.json`
and `ai-registry-anthropic/skills/*.json`, which carry none, relying entirely on the trusting
org's own tool configuration.

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
