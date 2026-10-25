# ai-registry CLI

Installs what the AI Registry holds through each ecosystem's own installer,
after printing who approved it and what the approval targets. Detecting tools
and their config paths stays with that installer: this CLI adds the lookup in
the published feed and the guardrails around it.

```bash
ai-registry install skill <id> [--yes] [--agent <name>...] [--global] [--registry <url|path>] [--require-approval-from <org,...|off>]
ai-registry install plugin <id> [--yes] [--target <tool>] [--scope user|project|local] [--registry <url|path>] [--require-approval-from <org,...|off>]
```

- `install skill <id>` looks the id up in `skills.json` and installs it with
  the [skills CLI](https://www.npmjs.com/package/skills), at the revision the
  approval names. An id the registry doesn't hold fails without running
  anything, and so does an approval the skills CLI can't install at that
  revision: it never falls back to the default branch.
- `install plugin <id>` looks the id up in `plugins.json` and installs it with
  the [plugins CLI](https://www.npmjs.com/package/plugins), after listing the
  skills and MCP servers it brings along and any marketplace an approval came
  through. The plugins CLI always installs the default branch, so an approval
  that names a ref is refused, with the git commands to install it by hand.
  It also installs every plugin it finds in the repository when not asked, so
  a plugin in a subdirectory only installs from a terminal, where its picker
  lets you keep just the approved one. `--target` and `--scope` (`user`,
  `project` or `local`) are forwarded to it.
- `--yes` skips the confirmation and is forwarded to the installer, which then
  installs to the tools it detects, except for a plugin in a
  subdirectory, which always goes through the plugins CLI's picker. Without a terminal to confirm on, the CLI
  fails rather than wait for an answer.
- `--registry` (or `AI_REGISTRY_URL`) points it at another registry, either a
  base URL or a local directory such as the `dist/api/v1/` that `npm run
consolidate` writes. Default: `https://ai.open-vsx.org/api/v1/`.

Everything the CLI says goes to stderr; stdout is the installer's own output.

## Approval guardrail

Both install commands check who approved the entry before running anything.
`--require-approval-from eclipse,anthropic` installs only what one of those
organizations approved, and otherwise exits 1, naming the organizations that
did approve it so you can decide whether to override. `off`, the default,
installs anything the registry holds and prints who approved it.

A trust-derived approval counts as the trusting organization's, since it
delegated that judgement: if you require `theia` and Theia trusts AWS's
approvals, an AWS approval passes, and the output says it rests on AWS.

The setting comes from the first of:

1. `--require-approval-from <org,...|off>`
2. `AI_REGISTRY_REQUIRE_APPROVAL_FROM`
3. `.ai-registry.json` in the working directory
4. `$XDG_CONFIG_HOME/ai-registry/config.json`, by default
   `~/.config/ai-registry/config.json`
5. `off`

Both config files hold JSON:

```json
{ "requireApprovalFrom": ["eclipse", "anthropic"] }
```

or `{ "requireApprovalFrom": "off" }`. A file without the key is skipped; one
that can't be read as above fails the install rather than read as `off`.

The guardrail binds installs that go through this CLI only. It can't stop
anyone running `npx skills add` or `npx plugins add` directly.

## Install from source

The package isn't on npm yet. From the repository root:

```bash
npm install                 # also builds cli/dist
npm install -g ./cli        # puts `ai-registry` on your PATH
```

Or run it in place with `node cli/dist/cli.js`. The skills CLI it runs needs
Node.js 22.20 or later.

The CLI is a client of the published feed and nothing more: it imports nothing
from `src/` or `website/`, and mirrors the types and install rules it needs by
hand.
