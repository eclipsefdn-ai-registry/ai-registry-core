# Detecting tampering

Local content can change after installation: an edit by the user, a partial write, a process that rewrote files. Comparing the artifact on disk against the hash you recorded at install tells you when it has.

This applies to skills and plugins. MCP servers and agents have no local content to check: the registry publishes MCP server configuration rather than content, and an agent's card lives at its source rather than on disk.

## Detecting it

Recompute the [content hash](content-hash.md) over the artifact directory and compare it against the hash in your provenance marker. Different means the local content has changed since install.

This is why the recorded baseline has to be the hash you computed from what you actually downloaded. Recording the feed's hash instead means every install that overrode a mismatch warning reads as tampered with immediately afterwards.

## Making it cheap

Recomputing a hash reads every file, and this check runs often. Cache the result against a signature built from the file paths, sizes, and modification times you gather while walking the directory. Any write to the artifact changes that signature, so an unchanged directory is walked once and never re-read. Drop cache entries for directories that no longer exist.

## What to do about it

Offer to restore the artifact from its source, and leave it alone until the user asks. A local change is often deliberate, and a client that quietly reverts it destroys the user's work to satisfy a hash.

Resolve drift before offering an update. Restoring already writes the current registry content, so a single restore lands both.

Check only artifacts carrying your provenance marker. One the user placed by hand has no baseline, and its content is not yours to have an opinion about.
