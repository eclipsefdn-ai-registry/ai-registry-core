import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { filterByNameDescId, filterByOrg } from "./filterArtifacts";

interface Entry {
  id: string;
  name: string;
  description: string;
  approvals: { organizationId: string; viaTrust?: string }[];
}

function entry(id: string, ...approvals: Entry["approvals"]): Entry {
  return { id, name: id, description: "", approvals };
}

const ACME_ONLY = entry("acme-only", { organizationId: "acme" });
const GLOBEX_ONLY = entry("globex-only", { organizationId: "globex" });
const BOTH = entry(
  "both",
  { organizationId: "acme" },
  { organizationId: "globex" },
);
const ENTRIES = [ACME_ONLY, GLOBEX_ONLY, BOTH];

const ids = (items: Entry[]) => items.map((e) => e.id);

describe("filterByOrg", () => {
  it("keeps every entry when no organization is selected", () => {
    assert.deepEqual(filterByOrg(ENTRIES, undefined), ENTRIES);
    assert.deepEqual(filterByOrg(ENTRIES, ""), ENTRIES);
  });

  it("keeps only the entries the organization approved", () => {
    assert.deepEqual(ids(filterByOrg(ENTRIES, "acme")), ["acme-only", "both"]);
    assert.deepEqual(ids(filterByOrg(ENTRIES, "initech")), []);
  });

  it("matches an entry for each organization that approved it", () => {
    assert.ok(filterByOrg(ENTRIES, "acme").includes(BOTH));
    assert.ok(filterByOrg(ENTRIES, "globex").includes(BOTH));
  });

  it("counts an approval held via trust for the trusting organization", () => {
    const trusted = entry(
      "trusted",
      { organizationId: "globex" },
      { organizationId: "acme", viaTrust: "globex" },
    );
    assert.deepEqual(ids(filterByOrg([trusted], "acme")), ["trusted"]);
  });

  it("narrows a name search to one organization", () => {
    const named = [
      { ...ACME_ONLY, name: "review" },
      { ...GLOBEX_ONLY, name: "review" },
      { ...BOTH, name: "deploy" },
    ];
    assert.deepEqual(
      ids(
        filterByNameDescId(filterByOrg(named, "acme"), "review", (e) => e.id),
      ),
      ["acme-only"],
    );
  });
});
