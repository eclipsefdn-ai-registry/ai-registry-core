---
name: implement-registry-client
description: >
  Implement an AI Registry client in an agent, IDE, or development tool.
  Use when adding registry support for MCP servers, Agent Skills, Agent Plugins, or A2A agents,
  or when a tool needs to browse, install, update, or verify registry-approved artifacts.
---

# Implement an AI Registry client

A client reads the registry, shows users which artifacts their organizations endorsed, and installs them.

Implement any subset of the four artifact types.

## What the registry vouches for

The registry records that a named organization **endorsed** an artifact on a date. That is the whole claim.

It does not test, audit, sandbox, or certify anything. Endorsement is per organization, not a registry-wide certification. A client can present its per-tool list as its own and never name another organization, or it can show the endorsement chain behind each artifact. Both are valid; the second gives the user something to evaluate.

Four limits shape everything below:

- MCP servers are described by configuration, not by content. The registry publishes the command or URL to run. Nothing in the feed covers the server's code, and that code can change under a stable command at any time.
- Skills and plugins carry a content hash of their source as of the last consolidation run, which happens daily and on vendor push. Sources are referenced by repository URL and path with no commit pin, so the hash is the only pin available.
- Agents carry a content hash too, but of a single fetched Agent Card JSON file, not a directory — there is no path to pin.
- Withdrawing an endorsement removes the entry from the feed, but so does a source that was briefly unreachable when consolidation ran. Nothing in the data separates the two, so there is no revocation signal a client can act on. See [Disappearing entries](#disappearing-entries).

## The data

Base URL: `https://ai.open-vsx.org/api/v1/`

| Endpoint                                                 | What it gives you                                                                                                                     |
| :------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------ |
| `tools/<tool-id>.json`                                   | Artifacts endorsed for your tool, with other tools' install configs stripped                                                          |
| `orgs/<org-id>.json`                                     | Artifacts endorsed by one organization, across every tool, full install configs kept                                                  |
| `organizations.json`                                     | Organization identity: name, description, website, colour                                                                             |
| `mcp.json`, `skills.json`, `plugins.json`, `agents.json` | Every endorsed artifact of one type, across every tool, full install configs kept — each a single-key object, e.g. `{ "mcp": [...] }` |
| `all.json`                                               | Everything, unfiltered                                                                                                                |

`tools/<tool-id>.json` is all you need to browse and install. Add `organizations.json` if you want to name the endorsing organizations, since the per-tool view carries `organizationId` strings and nothing else about them.

Reach for `orgs/<org-id>.json` or the per-type files when your client's boundary is an organization or an artifact type rather than a tool — for example, an organization publishing its own curated allowlist, or a client that only ever handles one artifact type.

Both keep every entry's `approvals` and `installConfigs` exactly as filed, unlike `tools/<tool-id>.json`. Filter `approvals` by `organizationId` and `installConfigs[].tool` yourself before installing, or treat these as browsing views like `all.json`.

Use `all.json` when your tool has no registered tool id yet. It carries every artifact any organization endorsed, including install configs aimed at other tools, so treat it as a browsing view rather than an install source.

### Base URL and tool id are product configuration

Both decide who the user trusts. Bind them in product code and keep them out of user-facing settings. A user who can point the tool at another registry can change their trust anchor without seeing that as the decision it is.

### Refreshing

Fetch on startup, cache in memory, and refetch when the user asks or before an update check. A fetch that fails leaves the previous state intact: **failure to reach the registry is not evidence that anything changed.** Keep an empty response and a failed request distinct, because they mean opposite things.

## Core

Every artifact type follows the same five steps.

### 1. Read the entries you handle

Top-level keys are `organizations`, `tools`, `mcp`, `skills`, `plugins`, and `agents`. New keys may appear, so ignore what you do not implement.

### 2. Resolve endorsements

Each entry carries an `approvals` array, one element per endorsing organization:

```json
{
  "serverId": "io.github.ChromeDevTools/chrome-devtools-mcp",
  "name": "Chrome DevTools",
  "description": "Debug and inspect pages in Chrome.",
  "mcpRegistryVerified": true,
  "approvals": [
    {
      "organizationId": "example-org",
      "date": "2026-05-12",
      "configHash": "a3f19c284b7e",
      "installConfigs": [
        {
          "tool": "example-tool",
          "config": {
            "servers": {
              "chrome-devtools": {
                "command": "npx",
                "args": ["-y", "chrome-devtools-mcp@latest"]
              }
            }
          }
        }
      ]
    }
  ]
}
```

Keep every `organizationId`. Pick one `installConfig` to install from by sorting on `date` descending, with `organizationId` ascending as the tie-break, so two clients given the same feed reach the same result.

`viaTrust` on an approval means the organization endorsed it by trusting another organization rather than by filing its own approval. Attribute it to the organization named in `organizationId`, and mention the delegation if you show approval detail.

### 3. Decide how much of the endorsement chain to show

Presence in your per-tool view already means endorsed for your tool, so a list with no organization names is a legitimate client. If you do show them, show all of them rather than only the one whose config you picked, since several organizations endorsing the same artifact is a signal that disappears when it collapses to one name.

### 4. Install

See the per-type sections below for what installing means.

### 5. Record provenance

Write a marker alongside every artifact you install, recording at minimum the registry id it came from and the hash you recorded at install time.

**You must be able to tell an artifact you installed from one the user placed there, and never overwrite the latter.** Adoption of pre-existing artifacts, update detection, drift detection, and safe uninstall all depend on it. It cannot be added retroactively, because after the fact there is no way to tell which artifacts were yours.

When the local slot is already occupied by something you did not install, offer to adopt it. Write your provenance marker without touching its content, rather than replacing it.

## MCP servers

The registry publishes configuration. Install means writing that configuration wherever your tool keeps MCP server definitions.

```json
"config": {
  "servers": {
    "chrome-devtools": { "command": "npx", "args": ["-y", "chrome-devtools-mcp@latest"] }
  }
}
```

- The key inside `servers` is the local name, chosen by the organization that filed the approval. Use it as the artifact's local identity. It can collide with a server the user configured by hand, which is what the adoption path in step 5 is for.
- `config.servers` may hold more than one entry. Install all of them or install none. Picking one silently gives the user a partial server set with no indication anything is missing.
- `mcpRegistryVerified` means the server is listed in the Anthropic MCP registry. It says nothing about the server's behaviour or safety.
- `publisherClaimedBy` names an organization that claims to publish the server, not merely to endorse it. Show it distinctly from endorsement if you show it at all.
- Content hashing does not apply here. `configHash` covers the approval, and update detection uses it.

## Agent Skills

The registry points at a skill's source; it does not host it. Install means downloading `source.path` from `source.url` into wherever your tool keeps skills.

```json
{
  "skillId": "io.github.anthropics/code-review",
  "name": "code-review",
  "description": "Review code changes for correctness.",
  "source": {
    "url": "https://github.com/anthropics/skills.git",
    "path": "skills/code-review"
  },
  "contentHash": "7c1e4b9d02af",
  "approvals": [
    {
      "organizationId": "example-org",
      "date": "2026-06-01",
      "installConfigs": []
    }
  ]
}
```

**Verify what you downloaded against `contentHash` before installing.** Recompute the hash over the downloaded tree using the algorithm in [`references/content-hash.md`](references/content-hash.md) and compare.

On a mismatch, tell the user the source has changed since the organization endorsed it, name the organization and the date, and let them install anyway with an explicit choice. A mismatch is expected for up to a day after any upstream commit, because consolidation runs daily and the source has no commit pin. It is also what a compromised source looks like, and the user is the one who gets to weigh that.

Record the hash you computed, not the one from the feed. The recorded hash is the baseline for drift detection, and a baseline the local content never matched detects nothing.

A skill's identity is the `name` in its `SKILL.md` frontmatter, because that is what the agent runtime and the model address it by. Two skills with the same name collide no matter which directories they occupy.

## Agent Plugins

An [Agent Plugin](https://agent-plugins.org) is a directory holding a `plugin.json` manifest, optional `skills/<name>/SKILL.md` folders, and an optional `mcp.json`. `source.path` points at that directory; omit it and the plugin is at the repository root.

```json
{
  "pluginId": "io.github.gemini-cli-extensions/bigquery-data-analytics",
  "name": "BigQuery Data Analytics",
  "version": "1.2.0",
  "source": {
    "url": "https://github.com/gemini-cli-extensions/bigquery-data-analytics.git"
  },
  "contentHash": "5b8ad3f0e174",
  "containedSkills": [
    {
      "name": "query-builder",
      "description": "Build SQL.",
      "path": "skills/query-builder"
    }
  ],
  "containedMcpServers": [{ "name": "bigquery", "transport": "stdio" }],
  "approvals": [
    {
      "organizationId": "example-org",
      "date": "2026-08-07",
      "installConfigs": []
    }
  ]
}
```

### Install the plugin whole

Download the plugin directory into a root of your choosing, keyed by `pluginId`, and load its skills and MCP servers from inside that root. Do not extract components into your shared skills directory or merge its servers into your global MCP configuration.

The plugin root is a boundary that agent-plugins.org builds on. Files must resolve inside it, `PLUGIN_ROOT` and `PLUGIN_DATA` are defined relative to it, `./` commands resolve against it, and failure isolation is expressed per plugin, per component type, and per entry. A decomposed plugin can no longer find its own files.

Keeping plugins whole also means plugins and standalone artifacts coexist. The same skill can appear twice in a client, once on its own and once inside a plugin, with different endorsements and different content. That is not a duplicate to merge, and merging them would assert an equivalence the registry never published.

Verify `contentHash` over the downloaded plugin directory exactly as for skills, using the same algorithm.

### Where the registry stops

The registry answers which plugin, endorsed by whom, from where, and whether it is current. Loading and running it is defined by agent-plugins.org, which deliberately leaves installation sources, registries, enablement, update experience, and trust policy to clients. That is the registry's half.

The handoff is the verified plugin root on disk. From there, follow [Implement an Agent Plugins client](https://agent-plugins.org).

Two facts about the feed belong on this side of the line:

- `containedSkills` and `containedMcpServers` are what consolidation read from the plugin at the time it ran. Use them to tell the user what they are about to install. Discover components yourself from the plugin root, and let the root win if the two disagree.
- `containedMcpServers` gives only `name` and `transport`, and `transport` is empty when the entry declares no `type`. The feed cannot tell you how to run anything.

Endorsement attaches to the plugin as a whole. No contained MCP server is endorsed independently, and since a plugin's MCP servers can run arbitrary local commands, say so before installing.

## Agents

An A2A agent's `source.url` points directly at its Agent Card, a single JSON file describing a remote agent — not a repository or a directory, and there is no `source.path`. `name` and `description` come from the card itself.

```json
{
  "agentId": "eu.mosaico-project/ip-solution-agent",
  "name": "IP Solution Agent",
  "description": "Answers questions about IP licensing.",
  "source": {
    "url": "https://example.com/agents/ip-solution/agent_card.json"
  },
  "contentHash": "4d881ac8a3bd",
  "approvals": [
    {
      "organizationId": "example-org",
      "date": "2026-08-01",
      "installConfigs": []
    }
  ]
}
```

**`contentHash` covers the card's JSON text as fetched, not a directory.** Recompute it as a SHA-256 of the raw response body and take the first 12 hex characters — the same digest format [content hash](references/content-hash.md) documents for skills and plugins, but over one file instead of a walked tree.

There is no plugin-root or skill-folder equivalent to download. Install means resolving the card from `source.url`, using it to reach the remote agent per the [A2A protocol](https://a2a-protocol.org), and registering that reference in your tool. `installConfigs[].config` carries whatever else your tool needs to do that — for a container-delivered agent, for example, an image, tag, port, or environment.

Endorsement attaches to the agent as a whole, the same as for plugins: there is nothing smaller inside an Agent Card to endorse independently.

## Disappearing entries

An installed artifact vanishing from the feed can mean an organization withdrew its endorsement. It can also mean consolidation skipped the entry because its source was briefly unreachable, or a vendor retargeted the approval, or an id was renamed. The data does not distinguish them.

Surface it and act on nothing. Mark the artifact as no longer listed, and let the user keep it, dropping the registry link, or remove it.

Removing artifacts automatically deletes working installations whenever a source repository has a bad morning. Skipping unreachable sources is normal consolidation behaviour, not an exception.

## Going further

- [Staying current](references/staying-current.md), on detecting and applying updates
- [Detecting tampering](references/detecting-tampering.md), on local drift against the recorded hash
- [Deep links](references/deep-links.md), on handling `installUrl` safely
- [Content hash](references/content-hash.md), the algorithm byte for byte
- [Yours to decide](references/client-owned.md), on organization filtering, auto-update policy, and presentation

## Checklist

**Core**

- [ ] Treat the base URL and tool id as product configuration, not user settings
- [ ] Keep a failed fetch distinct from an empty response, and change nothing on failure
- [ ] Ignore fields you do not recognise rather than rejecting the document
- [ ] Pick an install config by `date` descending and `organizationId` ascending
- [ ] Verify `contentHash` before installing a skill, plugin, or agent, and let the user override an explicit mismatch warning
- [ ] Record provenance for everything you install, and never overwrite what you did not
- [ ] Offer adoption when a local slot is already occupied
- [ ] Install plugins whole, keyed by `pluginId`, and load from inside the plugin root
- [ ] Surface artifacts missing from the feed without removing them

**If you show endorsing organizations**

- [ ] Fetch `organizations.json` to resolve `organizationId` into a name
- [ ] Show every endorsing organization, not only the one whose config you used
- [ ] Attribute a `viaTrust` approval to its `organizationId`, noting the delegation

**If you implement updates**

- [ ] Use `configHash` for MCP servers and `contentHash` for skills, plugins, and agents
- [ ] Preserve user-supplied configuration across an update

**If you implement deep links**

- [ ] Resolve everything from the registry by id, and install nothing from URL parameters
- [ ] Refuse ids absent from your registry view
- [ ] Confirm with the user, naming the source
      </content>
