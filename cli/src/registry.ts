import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { OrganizationsFeed, SkillsFeed } from "./types.js";

export const DEFAULT_REGISTRY = "https://ai.open-vsx.org/api/v1/";

/**
 * Reads one file of the published feed from a registry: an http(s) base URL,
 * or a local directory such as the dist/api/v1/ consolidation writes. Throws
 * an error naming the location it couldn't read.
 */
async function readFeedFile(registry: string, file: string): Promise<unknown> {
  const location = /^https?:\/\//.test(registry)
    ? new URL(file, registry.endsWith("/") ? registry : `${registry}/`).href
    : join(registry, file);
  let text: string;
  try {
    if (location.startsWith("http")) {
      const response = await fetch(location);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      text = await response.text();
    } else {
      text = await readFile(location, "utf-8");
    }
    return JSON.parse(text);
  } catch (error) {
    throw new Error(
      `Could not read ${location}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

// Checks only the array each caller iterates; the entries are trusted to be
// shaped as the feed publishes them.
async function readFeedList<T>(
  registry: string,
  file: string,
  key: string,
): Promise<T> {
  const feed = await readFeedFile(registry, file);
  if (
    typeof feed !== "object" ||
    feed === null ||
    !Array.isArray((feed as Record<string, unknown>)[key])
  ) {
    throw new Error(`${file} in ${registry} has no "${key}" list`);
  }
  return feed as T;
}

export function loadSkillsFeed(registry: string): Promise<SkillsFeed> {
  return readFeedList(registry, "skills.json", "skills");
}

export function loadOrganizationsFeed(
  registry: string,
): Promise<OrganizationsFeed> {
  return readFeedList(registry, "organizations.json", "organizations");
}
