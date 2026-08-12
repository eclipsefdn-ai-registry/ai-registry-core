# Content hash

The hash the registry publishes as `contentHash` for skills and plugins. Reproduce it byte for byte or comparisons are meaningless.

Consolidation computes it over the skill folder or the plugin directory. Both use the same algorithm.

## Algorithm

1. Walk the directory recursively. Skip every entry whose name begins with `.`, at every level. Skipping a directory skips everything under it.
2. For each remaining file, take its path relative to the directory root, with `/` as the separator regardless of platform.
3. Sort those relative paths in lexicographic byte order.
4. Create a SHA-256 hash. For each path in sorted order, feed the path as UTF-8 bytes, then the file's raw bytes. Nothing separates or delimits the two.
5. Take the hex digest and keep the first 12 characters.

Steps 1 to 5 are the definition. The code below illustrates them.

```ts
function collectFiles(dir: string, base = ""): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith(".")) continue;
    const rel = base ? `${base}/${entry}` : entry;
    if (statSync(join(dir, entry)).isDirectory()) {
      out.push(...collectFiles(join(dir, entry), rel));
    } else {
      out.push(rel);
    }
  }
  return out;
}

function computeContentHash(root: string): string {
  const hash = createHash("sha256");
  for (const rel of collectFiles(root).sort()) {
    hash.update(rel);
    hash.update(readFileSync(join(root, ...rel.split("/"))));
  }
  return hash.digest("hex").slice(0, 12);
}
```

## Things that will bite you

**Path separators.** The registry computes hashes on Linux, so relative paths use `/`. A client on Windows that feeds `skills\helper.md` into the hash produces a different digest for identical content.

**The dot rule applies at every level, not just the root.** A file at `docs/.notes/draft.md` is excluded because a segment of its path starts with `.`, even though the file itself does not.

**Name your provenance marker with a leading dot.** A marker written into the artifact directory as `.registry.json` is excluded automatically. Written as `registry.json` it changes the hash, and the artifact reads as tampered with the moment it is installed.

**Truncation is part of the format.** Twelve hex characters, not the full digest. A 48-bit prefix is fine for detecting accidental change and is not a defence against a prepared collision.
