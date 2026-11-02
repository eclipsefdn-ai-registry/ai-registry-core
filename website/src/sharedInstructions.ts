import type { InstallConfig } from "./types";

/**
 * Setup text an approval card shows once instead of in each install config.
 * Consolidation copies a generic config's notes into the instructions of every
 * entry it derives from that config, so a card listing several tools would
 * otherwise print the same notes once per tool.
 *
 * Two cases, in order:
 *  - shownNotes: the notes the card's generic config box already shows. An
 *    install config whose instructions equal them loses them.
 *  - Instructions every one of two or more remaining install configs carries
 *    word for word come back as `hoisted`, for the card to show once above
 *    them, and are removed from each. That is a trust-derived card, or one
 *    derived from another vendor's config, neither of which has a generic
 *    config box of its own to compare against.
 *
 * Every, not most: text shown above all the tools has to apply to all of
 * them. On a mixed card, say one tool whose derivation failed and so has no
 * instructions, each tool keeps its own text, which repeats at worst.
 */
export function hoistSharedInstructions(
  installConfigs: InstallConfig[],
  shownNotes: string | undefined,
): { hoisted?: string; installConfigs: InstallConfig[] } {
  const remaining =
    shownNotes === undefined
      ? installConfigs
      : installConfigs.map((c) =>
          c.instructions === shownNotes ? withoutInstructions(c) : c,
        );

  const [first] = remaining;
  const shared =
    remaining.length >= 2 &&
    first.instructions &&
    remaining.every((c) => c.instructions === first.instructions)
      ? first.instructions
      : undefined;
  if (!shared) return { installConfigs: remaining };

  return {
    hoisted: shared,
    installConfigs: remaining.map(withoutInstructions),
  };
}

function withoutInstructions(config: InstallConfig): InstallConfig {
  const copy = { ...config };
  delete copy.instructions;
  return copy;
}
