# Yours to decide

The registry publishes data. What a client builds on top of it is the client's call, and the sketches below are meant to show what the data supports rather than to prescribe an implementation.

## Organization filtering

A client that names endorsing organizations can go further and let the choice of organizations change what a user sees.

Everything needed is already in the feed. `organizations.json` gives each organization an `id`, `name`, `description`, `website`, and `color`. Every approval carries an `organizationId`, and `viaTrust` names the organization whose judgment was delegated to when one was. Filtering is a matter of intersecting the two.

Some shapes this can take:

- **Pinned in product configuration.** A distribution ships an allowlist and the user sees only those endorsements. Predictable, and the user cannot widen it.
- **Chosen by the user.** Settings list the organizations present in the feed and the user picks. Flexible, and it needs an answer for an artifact whose only endorsement comes from an organization the user later deselects while it is installed.
- **Ranking rather than filtering.** Everything stays visible, and endorsements from preferred organizations sort first or carry a stronger badge. Nothing disappears, so there is no empty-list state to design.
- **A threshold.** Require endorsement by more than one organization before an artifact is offered. Cheap to implement, and it disadvantages artifacts that are simply new.

The `inferred` flag on an organization is worth surfacing in any of these. It marks an organization pre-seeded from a public source rather than one participating in the registry directly, which is a different kind of endorsement than a vendor filing its own approvals.

## Auto-update policy

The registry tells you an update exists. Whether to apply it, whether to ask first, and whether that choice is global or per artifact are product decisions it has no opinion on.

The one interaction worth knowing is with drift: an artifact whose local content has changed is a restore rather than an update, so it does not belong in whatever automatic path you build. See [detecting tampering](detecting-tampering.md).

## Presentation

The registry has no opinion on any of this: how artifacts are browsed and searched, whether endorsement appears as a badge or a sentence, how a plugin's contained components are displayed, where installed artifacts are managed, or how updates are announced.
