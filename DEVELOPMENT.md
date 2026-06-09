# Development Guide

## Structure

- **`schemas/`** — JSON Schema definitions for organization and approval files
- **`vendors.json`** — Registered vendor repositories
- **`src/`** — TypeScript scripts for consolidation and validation
- **`website/`** — React static website (Vite + TypeScript)
- **`skills/`** — AI agent skills (e.g., `create-mcp-approval`, `create-skill-approval`)

## Local vendor repos

For local development, the consolidation step needs access to vendor repositories. Instead of cloning them from GitHub, you can point it to local checkouts via the `LOCAL_VENDORS_DIR` environment variable.

By default (when `LOCAL_VENDORS_DIR` is not set), the consolidation step clones vendor repos from GitHub. When set, it looks for vendor repos at `<LOCAL_VENDORS_DIR>/ai-registry-<vendor-id>/`.

The recommended setup is to check out vendor repos as siblings of the core repo. The `dev` script picks them up automatically:

```
parent/
├── ai-registry-core/     # this repo
└── ai-registry-theia/    # vendor repo
```

## Scripts

```bash
npm install

# Run lint and tests
npm run check

# Validate a vendor repo
npm run validate-vendor -- /path/to/vendor-repo

# Consolidate all vendor repos (outputs to dist/api/v1/)
npm run consolidate

# Run consolidation + start local dev server (uses LOCAL_VENDORS_DIR=.. by default)
npm run dev

# Build the website
npm run build:website

# Auto-format all files
npm run format

# Lint only
npm run lint

# Tests only
npm test
```

### Local development

`npm run dev` consolidates from local sibling vendor repos (defaults to `LOCAL_VENDORS_DIR=..`) and starts the Vite dev server. To use a different path:

```bash
LOCAL_VENDORS_DIR=/path/to/parent/dir npm run dev
```

### Environment variables

| Variable            | Used by              | Description                                                                                             |
| ------------------- | -------------------- | ------------------------------------------------------------------------------------------------------- |
| `LOCAL_VENDORS_DIR` | `consolidate`, `dev` | Path to parent directory containing vendor repos                                                        |
| `GH_TOKEN`          | `consolidate`        | GitHub PAT for cloning private vendor repos. Injected into clone URL. Not needed once repos are public. |
| `BASE_PATH`         | `build:website`      | Base path for GitHub Pages deployment. Defaults to `/`. Set by CI from `configure-pages` output.        |

## GitHub Actions

| Workflow    | Trigger                                        | Purpose                                                               |
| ----------- | ---------------------------------------------- | --------------------------------------------------------------------- |
| `build.yml` | Push / PR to main, vendor dispatch, daily cron | Check + consolidate + build website. Deploys to GitHub Pages on main. |

## Adding a vendor

1. Create a vendor repository following the [vendor template](https://github.com/eclipsefdn-ai-registry/ai-registry-theia)
2. Add an entry to `vendors.json` with the vendor ID and repository URL
3. The consolidation workflow will automatically include the new vendor
