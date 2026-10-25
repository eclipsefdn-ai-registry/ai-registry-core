import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  checkApprovals,
  guardrailLines,
  parseRequireApprovalFrom,
  type Guardrail,
} from "./guardrail.js";

const ANTHROPIC = { organizationId: "anthropic", date: "2026-01-02" };
// Theia trusts Anthropic: Anthropic filed the approval, Theia inherits it.
const THEIA_VIA_ANTHROPIC = {
  organizationId: "theia",
  date: "2026-01-02",
  viaTrust: "anthropic",
};
const names: Record<string, string> = {
  anthropic: "Anthropic",
  theia: "Eclipse Theia",
};
const orgName = (id: string) => names[id] ?? id;

function guardrail(
  requireApprovalFrom: Guardrail["requireApprovalFrom"],
): Guardrail {
  return { requireApprovalFrom, setBy: "--require-approval-from" };
}

describe("parseRequireApprovalFrom", () => {
  it("reads off", () => {
    assert.equal(parseRequireApprovalFrom("off"), "off");
  });

  it("reads a comma separated list of organization ids", () => {
    assert.deepEqual(parseRequireApprovalFrom(" eclipse, anthropic ,"), [
      "eclipse",
      "anthropic",
    ]);
  });

  it("rejects a value naming no organization, rather than refuse everything", () => {
    assert.equal(parseRequireApprovalFrom(" , "), undefined);
  });

  // read as an organization id, either would quietly refuse everything
  for (const value of ["OFF", "off,eclipse"]) {
    it(`rejects ${value} rather than read off as an organization id`, () => {
      assert.equal(parseRequireApprovalFrom(value), undefined);
    });
  }
});

describe("checkApprovals", () => {
  it("allows anything when off, and names every approval", () => {
    const decision = checkApprovals([ANTHROPIC], "off");
    assert.equal(decision.allowed, true);
    assert.deepEqual(decision.matching, [ANTHROPIC]);
  });

  it("allows what one of the required organizations approved", () => {
    const decision = checkApprovals([ANTHROPIC], ["eclipse", "anthropic"]);
    assert.equal(decision.allowed, true);
    assert.deepEqual(decision.matching, [ANTHROPIC]);
  });

  it("refuses what none of the required organizations approved", () => {
    const decision = checkApprovals([ANTHROPIC], ["eclipse"]);
    assert.equal(decision.allowed, false);
    assert.deepEqual(decision.matching, []);
  });

  it("counts a trust-derived approval as the trusting organization's", () => {
    const decision = checkApprovals(
      [ANTHROPIC, THEIA_VIA_ANTHROPIC],
      ["theia"],
    );
    assert.equal(decision.allowed, true);
    assert.deepEqual(decision.matching, [THEIA_VIA_ANTHROPIC]);
  });
});

describe("guardrailLines", () => {
  it("says the guardrail is off and where that was set", () => {
    const g = { requireApprovalFrom: "off" as const, setBy: "default" };
    const lines = guardrailLines(
      checkApprovals([ANTHROPIC], "off"),
      g,
      orgName,
    );
    assert.match(lines.join("\n"), /Guardrail: +off \(default\)/);
  });

  it("names the required organization that approved it", () => {
    const lines = guardrailLines(
      checkApprovals([ANTHROPIC], ["anthropic"]),
      guardrail(["anthropic"]),
      orgName,
    );
    assert.match(
      lines.join("\n"),
      /Guardrail: +requires anthropic \(--require-approval-from\), met by Anthropic$/m,
    );
  });

  it("shows the delegation behind a trust-derived approval", () => {
    const lines = guardrailLines(
      checkApprovals([ANTHROPIC, THEIA_VIA_ANTHROPIC], ["theia"]),
      guardrail(["theia"]),
      orgName,
    ).join("\n");
    assert.match(lines, /met by Eclipse Theia, via trust in Anthropic/);
    assert.match(
      lines,
      /Eclipse Theia didn't review this itself: it trusts the approvals of Anthropic, so installing rests on that organization's judgement\./,
    );
  });

  it("on refusal, names who did approve it and how to override", () => {
    const lines = guardrailLines(
      checkApprovals([ANTHROPIC, THEIA_VIA_ANTHROPIC], ["eclipse", "acme"]),
      guardrail(["eclipse", "acme"]),
      orgName,
    ).join("\n");
    assert.match(
      lines,
      /Not installing: none of eclipse, acme approved it \(required by --require-approval-from\)\./,
    );
    assert.match(
      lines,
      /It was approved by Anthropic \(anthropic\); Eclipse Theia \(theia\), via trust in Anthropic\./,
    );
    assert.match(
      lines,
      /To install it anyway, run again with --require-approval-from naming one of them, or off\./,
    );
  });
});
