import { createHash } from "node:crypto";
import type { AgentEntry } from "./consolidate.js";

export interface AgentMetadata {
  name: string;
  description: string;
  contentHash: string;
}

// Pure parsing — no I/O. Mirrors parseSkillFrontmatter / parsePluginManifest.
// name/description default to "" when absent or non-string (AgentEntry falls
// back to agentId when name is blank, matching the plugin/skill precedent) —
// never throws for a merely-incomplete card.
export function parseAgentCard(rawText: string): {
  name: string;
  description: string;
} {
  const data = JSON.parse(rawText) as { name?: unknown; description?: unknown };
  return {
    name: typeof data.name === "string" ? data.name : "",
    description: typeof data.description === "string" ? data.description : "",
  };
}

// Thin I/O wrapper: fetch, read text, parse, hash the raw text. Throws a
// descriptive Error (including the URL) on a non-OK response or invalid
// JSON — mirrors anthropic-registry.ts's error-message style. Does NOT
// throw for a card that parses but lacks name/description (see parseAgentCard).
export async function fetchAgentCard(url: string): Promise<AgentMetadata> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to fetch agent card from ${url}: HTTP ${response.status}`,
    );
  }
  const rawText = await response.text();

  let parsed: { name: string; description: string };
  try {
    parsed = parseAgentCard(rawText);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid JSON in agent card from ${url}: ${detail}`);
  }

  const contentHash = createHash("sha256")
    .update(rawText)
    .digest("hex")
    .slice(0, 12);

  return { ...parsed, contentHash };
}

// Enrichment mapper — mutates each entry in place with fetched metadata (like
// enrichSkillMetadata/enrichPluginMetadata do) and returns the array of
// entries that succeeded. On a single entry's fetch failure: warn and DROP
// it (same warn+drop contract as skills/plugins — do NOT implement a
// fallback-to-last-published or fail-the-build behavior; that was explicitly
// deferred as a known, accepted limitation matching plugins' identical gap).
export async function enrichAgentMetadata(
  agents: AgentEntry[],
): Promise<AgentEntry[]> {
  if (agents.length === 0) return agents;

  console.log("Enriching agents with source metadata...\n");

  const results = await Promise.allSettled(
    agents.map(async (entry) => {
      const metadata = await fetchAgentCard(entry.source.url);
      entry.name = metadata.name || entry.agentId;
      entry.description = metadata.description;
      entry.contentHash = metadata.contentHash;
      return entry;
    }),
  );

  const enriched: AgentEntry[] = [];
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const entry = agents[i];
    if (result.status === "fulfilled") {
      console.log(`  Enriched: ${entry.agentId}`);
      console.log(`    Name: ${entry.name}`);
      console.log(`    Hash: ${entry.contentHash}`);
      enriched.push(entry);
    } else {
      const message =
        result.reason instanceof Error
          ? result.reason.message
          : String(result.reason);
      console.warn(`  WARNING: ${entry.agentId} — skipped`);
      console.warn(`    ${message}`);
    }
  }
  return enriched;
}
