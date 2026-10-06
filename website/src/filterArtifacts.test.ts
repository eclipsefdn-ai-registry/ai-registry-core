import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  filterByNameDescId,
  filterByOrgs,
  filterByTool,
  passesOrgFilter,
} from "./filterArtifacts";

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

describe("filterByOrgs", () => {
  it("keeps every entry when no organization is selected", () => {
    assert.deepEqual(filterByOrgs(ENTRIES, []), ENTRIES);
  });

  it("keeps only the entries the organization approved", () => {
    assert.deepEqual(ids(filterByOrgs(ENTRIES, ["acme"])), [
      "acme-only",
      "both",
    ]);
    assert.deepEqual(ids(filterByOrgs(ENTRIES, ["initech"])), []);
  });

  it("matches an entry for each organization that approved it", () => {
    assert.ok(filterByOrgs(ENTRIES, ["acme"]).includes(BOTH));
    assert.ok(filterByOrgs(ENTRIES, ["globex"]).includes(BOTH));
  });

  it("keeps what any of several organizations approved, each entry once", () => {
    assert.deepEqual(ids(filterByOrgs(ENTRIES, ["acme", "globex"])), [
      "acme-only",
      "globex-only",
      "both",
    ]);
    assert.deepEqual(ids(filterByOrgs(ENTRIES, ["globex", "initech"])), [
      "globex-only",
      "both",
    ]);
  });

  it("counts an approval held via trust for the trusting organization", () => {
    const trusted = entry(
      "trusted",
      { organizationId: "globex" },
      { organizationId: "acme", viaTrust: "globex" },
    );
    assert.deepEqual(ids(filterByOrgs([trusted], ["acme"])), ["trusted"]);
  });

  it("narrows a name search to the selected organizations", () => {
    const named = [
      { ...ACME_ONLY, name: "review" },
      { ...GLOBEX_ONLY, name: "review" },
      { ...BOTH, name: "deploy" },
    ];
    assert.deepEqual(
      ids(
        filterByNameDescId(
          filterByOrgs(named, ["acme"]),
          "review",
          (e) => e.id,
        ),
      ),
      ["acme-only"],
    );
  });
});

describe("passesOrgFilter", () => {
  it("passes every organization when none is selected", () => {
    assert.equal(passesOrgFilter([], "acme"), true);
  });

  it("passes only the selected organizations", () => {
    assert.equal(passesOrgFilter(["acme", "globex"], "globex"), true);
    assert.equal(passesOrgFilter(["acme", "globex"], "initech"), false);
  });
});

describe("filterByTool", () => {
  function installs(id: string, ...tools: string[][]) {
    return {
      id,
      approvals: tools.map((t) => ({
        installConfigs: t.map((tool) => ({ tool })),
      })),
    };
  }

  const THEIA = installs("theia", ["theia"]);
  const SECOND_APPROVAL = installs("second-approval", ["vscode"], ["theia"]);
  const OTHER_TOOL = installs("other-tool", ["vscode"]);
  const NO_CONFIGS = installs("no-configs", []);
  const ALL = [THEIA, SECOND_APPROVAL, OTHER_TOOL, NO_CONFIGS];

  it("keeps entries with an approval that installs into the tool", () => {
    assert.deepEqual(
      filterByTool(ALL, "theia").map((e) => e.id),
      ["theia", "second-approval"],
    );
  });

  it("drops entries whose approvals name only other tools, or none", () => {
    assert.deepEqual(
      filterByTool(ALL, "vscode").map((e) => e.id),
      ["second-approval", "other-tool"],
    );
    assert.deepEqual(filterByTool(ALL, "cursor"), []);
  });
});
