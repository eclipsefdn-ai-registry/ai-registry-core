# ai-registry CLI

Installs what the AI Registry holds through each ecosystem's own installer,
after printing who approved it and what the approval targets. Detecting tools
and their config paths stays with that installer: this CLI adds the lookup in
the published feed and the guardrails around it.

```bash
ai-registry install skill <id> [--yes] [--agent <name>...] [--global] [--registry <url|path>]
```

- `install skill <id>` looks the id up in `skills.json` and installs it with
  the [skills CLI](https://www.npmjs.com/package/skills), at the revision the
  approval names. An id the registry doesn't hold fails without running
  anything, and so does an approval the skills CLI can't install at that
  revision: it never falls back to the default branch.
- `--yes` skips the confirmation and is forwarded to the skills CLI, which then
  installs to the agents it detects. Without a terminal to confirm on, the CLI
  fails rather than wait for an answer.
- `--registry` (or `AI_REGISTRY_URL`) points it at another registry, either a
  base URL or a local directory such as the `dist/api/v1/` that `npm run
consolidate` writes. Default: `https://ai.open-vsx.org/api/v1/`.

Everything the CLI says goes to stderr; stdout is the installer's own output.

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
