# Staying current

An organization can revise an endorsement, either with a new config for an MCP server or with a source whose content moved on. Without update detection, users sit on whatever the registry said the day they installed, and the registry has no way to reach them.

## Detecting an update

Compare a hash from the feed against the one you recorded at install time.

| Type                    | Feed field                 | Compare against                               |
| :---------------------- | :------------------------- | :-------------------------------------------- |
| MCP servers             | `approvals[].configHash`   | The `configHash` in your provenance marker    |
| Skills, plugins, agents | `contentHash` on the entry | The hash you computed and recorded at install |

Different means an update is available. Refetch before checking, since a cached response cannot contain anything new.

For skills and plugins, resolve drift first. An artifact whose local content no longer matches its recorded hash needs restoring rather than updating. See [detecting tampering](detecting-tampering.md). Agents have no local content to drift, so there is nothing to resolve first.

## `version` is not an update signal

Two fields carry a `version`, and neither drives update detection:

- An MCP approval's `approvals[].version` is informational. It records the MCP registry version the organization reviewed, and it is present only when the approval gave one. It doesn't pin what runs: the server runs whatever its config starts.
- A plugin's `version` is whatever its `plugin.json` declares at `source.commit`.

Comparing versions gets updates wrong both ways:

- A new version with an unchanged config gives the user nothing to apply.
- A changed config under the same version is a real update and a version comparison misses it.

Show a plugin's `version` where it helps a user understand what they have. Never present an MCP approval's as the version the user runs. Decide with the hash.

## What the source ships now

Skills, plugins, and sandbox extensions carry two more fields next to `source.commit` and `contentHash`:

- `latestCommit` is the tip, when consolidation ran, of the branch the entry follows: the one `source.ref` names for a branch ref, the default branch otherwise.
- `latestHash` is the content hash of the entry's own path at that commit, computed exactly as `contentHash` is.

`source.commit` and `contentHash` say what was endorsed. These two say what the source ships now.

The endorsement is behind its source when `latestHash` differs from `contentHash`. Compare those two and nothing else:

- **Never compare commits.** A repository holding twenty skills moves its default branch whenever any one of them changes. `latestCommit` then differs from `source.commit` on all twenty, while only one of them changed.
- **Only a pinned endorsement can fall behind.** An endorsement with no `source.ref`, or with a branch name, follows that branch, so its latest fields equal `source.commit` and `contentHash` by construction. A tag or a full commit SHA is a fixed point, and the default branch can move past it.
- **Absent means unknown.** Both fields are missing when consolidation couldn't tell, because the source didn't answer or the default branch no longer has a valid artifact at that path. That is neither current nor behind, so claim nothing. In JavaScript, `undefined !== contentHash` is true, so a check that doesn't test for `latestHash` first reports every such entry as behind.
- **Different is not newer.** A tag cut on a release branch can be ahead of the default branch or diverged from it. Say that the source ships something different now, not that a newer version exists.
- **A hash says that the content changed, not what it changed to.** There is no version to name. "The source has changed since this was endorsed" is as far as it goes.

State the endorsed revision and any change together: that the endorsement is at `v1.2.0`, say, and, when the hashes differ, that the source has changed since. Showing `latestCommit` beside `source.commit` hands the user the commit comparison above. Don't call the endorsement outdated or stale either: a pinned endorsement is still valid, and it is the newer content that nobody has reviewed. A plugin's `version` doesn't help. It is whatever `plugin.json` declares at `source.commit`, not a statement about `source.ref`, and a plugin endorsed at `2.6.0` can declare `1.0.0`.

This is for display and notification, and it is never an update. Nothing at `latestCommit` has been endorsed, so never install from it and never verify a download against `latestHash`.

- Install at `source.commit` and verify against `contentHash`, as always. Once you have the bytes, the hash you compute from them is the one that says what you got.
- Update detection doesn't change: an update is something newly endorsed, which arrives as a new `contentHash`, and the table above still decides it.

Every file carries `generatedAt`, the time the consolidation run that produced it started. Show it wherever you show the latest fields, since a stored "latest" is only as current as the run that stored it.

## Applying an update

An installed artifact usually holds two kinds of state: what the registry published, and what the user supplied. An update replaces the first and preserves the second.

For MCP servers, the registry's values win for keys it sets. Carry forward what only the user could have provided: authentication tokens, enablement or autostart flags, environment entries the user added. A registry that ships no token, as it should, otherwise wipes the one the user typed.

When an update switches transport, with a local command becoming a remote URL or the reverse, drop the previous transport's fields rather than leaving both in place.

For skills and plugins, updating is a clean replace: remove the directory and write the fresh content. Verify `contentHash` on the new download, exactly as at install.

For agents, updating means re-resolving the card from `source.url` and verifying the new `contentHash`, exactly as at install — there is no local directory to remove and replace.

Update only artifacts carrying your provenance marker. One the user placed by hand was never yours to replace.

## Two caveats worth designing around

**Dropped keys survive.** Without recording which environment entries the registry set, you cannot tell a key the registry has since removed from one the user added, and preserving user additions preserves both. Record the registry-set key names at install if this matters to you.

**Applying updates automatically is a policy decision**, and one users hold opinions about. See [yours to decide](client-owned.md).
