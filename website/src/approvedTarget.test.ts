import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  approvedTarget,
  approvedTargetText,
  checkedOn,
  displayRef,
  sourceLinkTitle,
} from "./approvedTarget";
import type { Skill } from "./types";

const APPROVED_COMMIT = "db28b191f5a0c1b2d3e4f5a6b7c8d9e0f1a2b3c4";
const MOVED_COMMIT = "2df10e25bb00112233445566778899aabbccddee";
const APPROVED_HASH = "49b0db08bdaa";
const OTHER_HASH = "760876d07424";
const GENERATED_AT = "2026-09-28T12:39:07.680Z";

const SOURCE = {
  url: "https://github.com/acme/kits.git",
  path: "skills/review",
  commit: APPROVED_COMMIT,
};

// A whole Skill rather than the bare input type, so the cases can say what
// the commits did and show that it doesn't matter. The spread keeps an
// explicit `latestHash: undefined` undefined instead of defaulting it.
function skill(over: Partial<Skill> = {}): Skill {
  return {
    skillId: "io.github.acme/kits/review",
    name: "review",
    description: "",
    source: SOURCE,
    contentHash: APPROVED_HASH,
    latestCommit: APPROVED_COMMIT,
    latestHash: APPROVED_HASH,
    approvals: [],
    ...over,
  };
}

function said(entry: Skill, generatedAt?: string) {
  return approvedTargetText(approvedTarget(entry), generatedAt);
}

describe("approvedTarget", () => {
  it("tracks the default branch when there is no ref", () => {
    assert.deepEqual(approvedTarget(skill()), { kind: "tracks" });
    assert.equal(said(skill()).text, "Tracks the default branch");
  });

  it("tracks a branch the feed says isn't pinned", () => {
    const entry = skill({
      source: { ...SOURCE, ref: "release-1.x", pinned: false },
    });
    assert.deepEqual(approvedTarget(entry), {
      kind: "tracks",
      branch: "release-1.x",
    });
    assert.equal(said(entry).text, "Tracks release-1.x");
  });

  // The repository's default branch moved past the tag, but not in this
  // skill's folder: the commits differ and the hashes don't, so there is
  // nothing to report.
  it("makes no drift claim for a pin whose repository moved but whose folder didn't", () => {
    const entry = skill({
      source: { ...SOURCE, ref: "v1.2.0", pinned: true },
      latestCommit: MOVED_COMMIT,
    });
    assert.deepEqual(approvedTarget(entry), {
      kind: "pinned",
      ref: "v1.2.0",
      change: "same",
    });
    assert.equal(said(entry, GENERATED_AT).text, "Pinned to v1.2.0");
  });

  // Without source.pinned, v1.2.0 could be a branch, and a branch is its own
  // latest, so an unchanged hash says nothing about the default branch.
  it("prints a named ref as given when the feed doesn't classify it", () => {
    const entry = skill({
      source: { ...SOURCE, ref: "v1.2.0" },
      latestCommit: MOVED_COMMIT,
    });
    assert.deepEqual(approvedTarget(entry), {
      kind: "ref",
      ref: "v1.2.0",
      change: "same",
    });
    const { text, title } = said(entry, GENERATED_AT);
    assert.equal(text, "Ref: v1.2.0");
    assert.doesNotMatch(title, /ships/);
  });

  it("says the source has changed when a pin's own path did", () => {
    const entry = skill({
      source: { ...SOURCE, ref: "v1.2.0", pinned: true },
      latestCommit: MOVED_COMMIT,
      latestHash: OTHER_HASH,
    });
    assert.equal(
      said(entry, GENERATED_AT).text,
      "Pinned to v1.2.0, the source has changed since (checked 2026-09-28)",
    );
    assert.equal(
      said(entry).text,
      "Pinned to v1.2.0, the source has changed since",
    );
  });

  // Consolidation only hashes the default branch a second time for a pin, so
  // a differing hash already says which kind the ref is.
  it("reads a differing hash as a pin when the feed doesn't classify the ref", () => {
    const entry = skill({
      source: { ...SOURCE, ref: "v1.2.0" },
      latestCommit: MOVED_COMMIT,
      latestHash: OTHER_HASH,
    });
    assert.deepEqual(approvedTarget(entry), {
      kind: "pinned",
      ref: "v1.2.0",
      change: "changed",
    });
    assert.equal(
      said(entry, GENERATED_AT).text,
      "Pinned to v1.2.0, the source has changed since (checked 2026-09-28)",
    );
  });

  it("reads a full commit SHA as a pin", () => {
    const entry = skill({ source: { ...SOURCE, ref: MOVED_COMMIT } });
    assert.equal(approvedTarget(entry).kind, "pinned");
    const { text, title } = said(entry);
    assert.equal(text, "Pinned to 2df10e2");
    assert.match(title, new RegExp(MOVED_COMMIT));
  });

  // Absent is neither current nor changed. A check for `latestHash !==
  // contentHash` alone would report every such entry as changed.
  it("claims nothing when latestHash is missing", () => {
    const pinned = skill({
      source: { ...SOURCE, ref: "v1.2.0", pinned: true },
      latestHash: undefined,
    });
    assert.deepEqual(approvedTarget(pinned), {
      kind: "pinned",
      ref: "v1.2.0",
      change: "unknown",
    });
    assert.equal(said(pinned, GENERATED_AT).text, "Pinned to v1.2.0");
    assert.match(said(pinned).title, /couldn't find out/);

    const ref = skill({
      source: { ...SOURCE, ref: "v1.2.0" },
      latestHash: undefined,
    });
    assert.deepEqual(approvedTarget(ref), {
      kind: "ref",
      ref: "v1.2.0",
      change: "unknown",
    });
    assert.match(said(ref).title, /couldn't find out/);
  });

  // A tracking entry's latest fields are what it resolved to, so a change
  // can't occur. If one ever did, it wouldn't be the approval's to report.
  it("never reports a change on a tracking entry", () => {
    const entries = [
      skill({ latestHash: OTHER_HASH }),
      skill({ source: { ...SOURCE, pinned: true } }),
      skill({
        source: { ...SOURCE, ref: "release-1.x", pinned: false },
        latestHash: OTHER_HASH,
      }),
    ];
    for (const entry of entries) {
      assert.equal(approvedTarget(entry).kind, "tracks");
      assert.doesNotMatch(said(entry, GENERATED_AT).text, /changed/);
    }
  });
});

describe("displayRef", () => {
  it("shortens a full commit SHA, in either case", () => {
    assert.equal(displayRef(APPROVED_COMMIT), "db28b19");
    assert.equal(displayRef(APPROVED_COMMIT.toUpperCase()), "DB28B19");
  });

  // Only a full SHA is a commit to git's checkout; anything else is a name,
  // and shortening a name would print a different one.
  it("leaves every name as it is", () => {
    for (const name of ["deadbee", "g".repeat(40), "v1.2.0"]) {
      assert.equal(displayRef(name), name);
    }
  });
});

describe("checkedOn", () => {
  it("gives the date of the run", () => {
    assert.equal(checkedOn(GENERATED_AT), "2026-09-28");
  });

  it("gives nothing for a feed without a usable timestamp", () => {
    assert.equal(checkedOn(undefined), undefined);
    assert.equal(checkedOn("not a date"), undefined);
  });
});

describe("approvedTargetText", () => {
  // A pinned approval is a valid approval someone reviewed, and a hash
  // difference has no direction. None of this wording may say otherwise.
  it("never calls an approval outdated or gives a difference a direction", () => {
    const entries = [
      skill(),
      skill({ source: { ...SOURCE, ref: "release-1.x", pinned: false } }),
      skill({ source: { ...SOURCE, ref: "v1.2.0", pinned: true } }),
      skill({
        source: { ...SOURCE, ref: "v1.2.0", pinned: true },
        latestHash: OTHER_HASH,
      }),
      skill({
        source: { ...SOURCE, ref: "v1.2.0", pinned: true },
        latestHash: undefined,
      }),
      skill({ source: { ...SOURCE, ref: "v1.2.0" } }),
      skill({ source: { ...SOURCE, ref: "v1.2.0" }, latestHash: undefined }),
    ];
    const forbidden = /outdated|out of date|stale|behind|newer|older|update/i;
    for (const entry of entries) {
      for (const generatedAt of [undefined, GENERATED_AT]) {
        const { text, title } = said(entry, generatedAt);
        assert.doesNotMatch(text, forbidden);
        assert.doesNotMatch(title, forbidden);
      }
    }
  });
});

describe("sourceLinkTitle", () => {
  it("names the commit the link opens", () => {
    assert.match(sourceLinkTitle(APPROVED_COMMIT)!, /db28b19/);
  });

  it("says nothing without a commit", () => {
    assert.equal(sourceLinkTitle(undefined), undefined);
  });
});
