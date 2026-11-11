# Agent Plugins schemas

Verbatim copies of the [Agent Plugins](https://agent-plugins.org) specification's published schemas, one directory per specification version. They are the allowlist of versions consolidation and vendor validation recognise when deciding whether a Plugin is an Agent Plugin (`src/agent-plugin-conformance.ts`). A Plugin whose `$schema` names a version not listed here is not an Agent Plugin.

The `$schema` URL in a vendor's `plugin.json` or `mcp.json` is never fetched. Adopting a new specification version means adding its directory here, deliberately.

| Version | Source                                                                                                                  | Downloaded |
| ------- | ----------------------------------------------------------------------------------------------------------------------- | ---------- |
| 1.0.0   | <https://agent-plugins.org/schemas/1.0.0/plugin.schema.json>, <https://agent-plugins.org/schemas/1.0.0/mcp.schema.json> | 2026-11-09 |

Don't edit these files. The specification forbids reassigning a published schema identifier to different contents, so a copy that differs from its source is a bug.
