---
name: create-sandbox-extension-approval
description: >
  Generate sandbox extension approval files for the AI Registry.
  Use this when a user wants to approve the sandbox tool and feature extensions
  in a git repository from their vendor repository.
argument-hint: "<source-url> [ref] — the git repo URL holding the extensions, and an optional tag or branch"
---

# AI Registry — Sandbox Extension Approval Generator

You are helping the user create a sandbox extension approval file for the AI Registry.

## What is the AI Registry?

The AI Registry is a vendor-neutral, federated trust registry for AI artifacts.
Vendors maintain their own repositories with approval files for the artifacts they endorse.

## What is a sandbox extension?

A sandbox extension is a directory in a git repository holding a `spec.yaml` (or `spec.json`)
that configures an AI agent sandbox. [Eclipse Enclave](https://enclave.eclipse.dev/) installs
them; the format follows Docker's sandbox kit format, so it is not tied to one vendor.

The spec's `kind` field decides which of two registry types the extension is published as:

| spec `kind` | Registry type             | Repository directory | Enclave verb           |
| ----------- | ------------------------- | -------------------- | ---------------------- |
| `sandbox`   | Sandbox tool extension    | `tools/<name>/`      | `enclave tools add`    |
| `mixin`     | Sandbox feature extension | `features/<name>/`   | `enclave features add` |

**One approval covers a whole repository.** There is no path field: consolidation clones the
repository, publishes every extension it finds under `tools/*` and `features/*`, and creates
one registry entry per extension.

## Read this before writing an approval

An extension is code that runs **as root** at container build and start time. It can install
apt packages, run install and startup scripts, widen the sandbox's network allowlist, declare
credentials it may hold, seed files into the user's project directory, and turn off the
agent's own approval prompts (`sandbox.yoloFlag`).

Approving a repository endorses **every** extension in it, and it is re-read on every
consolidation run — so extensions added upstream later are published under this approval too.
Pin `source.ref` to a tag if the organization means to endorse a fixed release rather than
whatever the default branch becomes.

## Your Workflow

1. **Identify the repository** — The user provides a git repository URL, and optionally a tag
   or branch.
2. **Read the extensions** — Clone the repository (at the ref, if given) and list the
   directories under `tools/` and `features/`. Read each `spec.yaml` and report the `kind`,
   `name`, `displayName` and `description` to the user, along with what each one does at
   build and start time, so they know what they are endorsing.
3. **Check the layout** — The registry publishes only `tools/*` and `features/*` at the
   repository root, and skips any extension whose `kind` contradicts its directory or whose
   `name` differs from its directory name. If the repository is laid out some other way, say
   so: the approval will publish nothing.
4. **Determine the sandboxExtensionId** — A reverse-domain prefix naming the **repository**,
   not just the owner: `io.github.<owner>/<repo>`. Consolidation appends each extension's
   path, so `io.github.eclipse-enclave/enclave-extensions` yields
   `io.github.eclipse-enclave/enclave-extensions/tools/openclaw`. A prefix naming only the
   owner collides as soon as that owner has a second kit repository.
5. **Read the vendor's organization.json** — Find `organization.json` in the repo root to
   confirm the vendor ID.
6. **Read the approval schema** — Fetch
   `https://ai.open-vsx.org/schemas/sandbox-extension-approval.schema.json` to follow the
   current contract.
7. **Generate the approval file** — Create a JSON file in the `sandbox-extensions/` directory
   following the schema and the naming convention below.
8. **Validate** — Run `npm run validate` to check the file. Phase 7 resolves the repository
   and lists exactly which extensions the approval will publish.

## Naming Convention

The approval file must be named `<sandboxExtensionId>.json` with all `/` characters replaced
by `--`.

Example: `io.github.eclipse-enclave/enclave-extensions` becomes
`io.github.eclipse-enclave--enclave-extensions.json`.

## Key Rules

- **sandboxExtensionId** (required): Reverse-domain prefix for the repository (e.g.
  `io.github.eclipse-enclave/enclave-extensions`). Each published extension appends its own
  repository path.
- **date** (required): Today's date in ISO format (YYYY-MM-DD).
- **source** (required): Object with `url` (git repo URL) and optionally `ref`.
  - **ref**: A git tag or branch to read and hash instead of the default branch. A commit SHA
    is not supported — the clone uses `--branch`, which takes a tag or branch only. Omit `ref`
    to follow the default branch, which is also what `enclave add` does with no `--ref`.
  - There is **no** `path`. The two directory prefixes are the convention.
- **installConfigs**: not part of this schema. Nothing about installing a sandbox extension is
  tool-specific, so an approval is the organization, the date, and the hash. The website builds
  the `enclave` command from the published metadata.

## Example: Approving a repository at its default branch

```json
{
  "sandboxExtensionId": "io.github.eclipse-enclave/enclave-extensions",
  "date": "2026-09-09",
  "source": {
    "url": "https://github.com/eclipse-enclave/enclave-extensions.git"
  }
}
```

## Example: Approving a fixed release

```json
{
  "sandboxExtensionId": "io.github.eclipse-enclave/enclave-extensions",
  "date": "2026-09-09",
  "source": {
    "url": "https://github.com/eclipse-enclave/enclave-extensions.git",
    "ref": "v1.2.0"
  }
}
```

## Trusting another organization instead

An organization that would rather delegate than file its own approvals can add a trust entry
to its `organization.json`. One key covers both kinds — an approval yields tool and feature
extensions together, so they cannot be delegated apart:

```json
{
  "trusts": [
    { "org": "eclipsesource", "artifactTypes": { "sandboxExtensions": {} } }
  ]
}
```
