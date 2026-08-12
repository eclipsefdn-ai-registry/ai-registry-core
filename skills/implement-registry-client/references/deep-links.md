# Deep links

A vendor declaring `skillInstallUrlPrefix`, `mcpInstallUrlPrefix`, or `pluginInstallUrlPrefix` in its `organization.json` causes consolidation to mint an `installUrl` for every approval targeting that tool:

```json
"installConfigs": [
  { "tool": "example-tool", "installUrl": "example-tool://install-skill?id=io.github.anthropics/code-review" }
]
```

Handling these is optional. Ignore `installUrl` and everything else still works.

## If you handle them

A deep link arrives from a web page. It is untrusted input that lands directly on an install path, so the rules below are what make it safe.

**Carry an identifier and nothing else.** Resolve the source, the name, the hash, and the endorsements from the registry when you handle the link. Any field taken from URL parameters is a field an attacker chose.

**Refuse ids your registry view does not list**, and say which id you refused. An id absent from your configured view is not endorsed for your tool, whatever the link claims.

**Confirm before installing.** Show the source, and the endorsing organizations if you surface them at all. A deep link is the one entry point with no browsing context, so it is the place where attribution matters most and the place a user is least likely to have any.

Verification and provenance are unchanged: a link is a different route to the same install, not a shortcut past it.

## Declaring a prefix is a commitment

Once a prefix is in your `organization.json`, the registry mints URLs in that scheme for every approval targeting your tool and publishes them on a public website. Ship the handler first.
