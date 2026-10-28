import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  findBehindApprovals,
  formatReport,
  summarize,
  type Feed,
  type Vendor,
} from "./check-updates.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// A path, or the https:// URL of a published feed. Defaults to what
// `npm run consolidate` last wrote.
const source = process.argv[2] ?? resolve(ROOT, "dist/api/v1/all.json");

async function readFeed(): Promise<unknown> {
  if (source.startsWith("https://")) {
    const response = await fetch(source);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  }
  return JSON.parse(readFileSync(resolve(source), "utf-8"));
}

let data: Partial<Feed> & { generatedAt?: string };
try {
  data = (await readFeed()) as typeof data;
  if (!Array.isArray(data.skills)) {
    throw new Error("not a consolidated all.json, it has no skills list");
  }
} catch (err) {
  const message = err instanceof Error ? err.message : String(err);
  console.error(`Could not read the feed at ${source}: ${message}`);
  process.exit(1);
}

// A feed from before a type existed has no list for it.
const feed: Feed = {
  skills: data.skills ?? [],
  plugins: data.plugins ?? [],
  sandboxTools: data.sandboxTools ?? [],
  sandboxFeatures: data.sandboxFeatures ?? [],
};

// The vendor repos come from this checkout, whichever feed was read.
const vendors = JSON.parse(
  readFileSync(resolve(ROOT, "vendors.json"), "utf-8"),
) as Vendor[];

// Being behind is a fact to report, not a failure, so this exits 0 whatever
// it finds.
console.log(
  formatReport(
    findBehindApprovals(feed),
    vendors,
    data.generatedAt ?? "(unknown)",
    summarize(feed),
  ),
);
