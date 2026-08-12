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

`approvals[].version` pins an MCP server version, and plugins carry a `version` from their manifest. Neither drives update detection:

- A new version with an unchanged config gives the user nothing to apply.
- A changed config under the same version is a real update and a version comparison misses it.

Show `version` where it helps a user understand what they have. Decide with the hash.

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
