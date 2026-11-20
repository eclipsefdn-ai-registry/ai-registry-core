/** A version as major, minor and patch, and any prerelease after a `-`. */
export type Version = [number, number, number, prerelease?: string];

/**
 * Reads the version a Tool's CLI prints for `--version`, from a first line of
 * the form `<program> X.Y.Z` (such as `codex-cli 0.171.0`). Undefined when the
 * output isn't of that form, which callers read as "couldn't read the
 * version". Build metadata after a `+` is dropped.
 */
export function parseVersionLine(
  output: string,
  program: string,
): Version | undefined {
  const firstLine = output.split("\n", 1)[0].trim();
  const prefix = `${program} `;
  if (!firstLine.startsWith(prefix)) return undefined;
  const match = /^(\d+)\.(\d+)\.(\d+)(?:-([^\s+]+))?(?:\+\S*)?$/.exec(
    firstLine.slice(prefix.length),
  );
  if (!match) return undefined;
  const version: Version = [
    Number(match[1]),
    Number(match[2]),
    Number(match[3]),
  ];
  if (match[4]) version.push(match[4]);
  return version;
}

/**
 * Whether `version` is `min` or later. A prerelease comes before its release,
 * as in semver; two prereleases of one version aren't told apart.
 */
export function atLeast(version: Version, min: Version): boolean {
  for (let i = 0; i < 3; i++) {
    if (version[i] !== min[i]) return version[i]! > min[i]!;
  }
  return version[3] === undefined || min[3] !== undefined;
}
