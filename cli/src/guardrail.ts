import { field } from "./describe.js";
import type { SkillApproval } from "./types.js";

/**
 * Which organizations' approvals an install needs: "off" takes any, a list
 * takes one approval from any organization on it.
 */
export type RequireApprovalFrom = "off" | string[];

/** The setting in force, and the flag, variable or file that set it. */
export interface Guardrail {
  requireApprovalFrom: RequireApprovalFrom;
  setBy: string;
}

export const GUARDRAIL_OFF: Guardrail = {
  requireApprovalFrom: "off",
  setBy: "default",
};

/** The approval fields the guardrail reads, shared by every type. */
export type Approval = Pick<SkillApproval, "organizationId" | "viaTrust">;

export interface Decision<A extends Approval> {
  allowed: boolean;
  approvals: A[];
  // the approvals that satisfy the guardrail: all of them when it's off
  matching: A[];
}

/**
 * Reads the flag or environment variable form: "off", or organization ids
 * separated by commas. Undefined when the value can't be read as either.
 */
export function parseRequireApprovalFrom(
  value: string,
): RequireApprovalFrom | undefined {
  if (value.trim() === "off") return "off";
  return organizationIds(value.split(","));
}

/**
 * The trimmed, non-empty ids of a list. Undefined when none is left, since an
 * empty list would refuse everything, or when one is a misspelt or misplaced
 * off, which as an id would quietly do the same.
 */
export function organizationIds(ids: string[]): string[] | undefined {
  const trimmed = ids.map((id) => id.trim()).filter(Boolean);
  if (!trimmed.length || trimmed.some((id) => id.toLowerCase() === "off")) {
    return undefined;
  }
  return trimmed;
}

/**
 * Whether an entry with these approvals may be installed. A trust-derived
 * approval counts as the trusting organization's: it delegated the judgement,
 * and the approval stands under its own delegation policy.
 */
export function checkApprovals<A extends Approval>(
  approvals: A[],
  requireApprovalFrom: RequireApprovalFrom,
): Decision<A> {
  const matching =
    requireApprovalFrom === "off"
      ? approvals
      : approvals.filter((a) => requireApprovalFrom.includes(a.organizationId));
  return {
    allowed: requireApprovalFrom === "off" || matching.length > 0,
    approvals,
    matching,
  };
}

/**
 * What the guardrail tells the user: the setting and the approval that met
 * it, or, on refusal, who did approve the entry so they can override it
 * knowing that. A trust-derived approval always names the organization whose
 * judgement it rests on, since trusting one organization can mean inheriting
 * another's.
 */
export function guardrailLines<A extends Approval>(
  decision: Decision<A>,
  guardrail: Guardrail,
  orgName: (id: string) => string,
): string[] {
  const { requireApprovalFrom, setBy } = guardrail;
  const approver = (a: Approval, withId = false) =>
    `${orgName(a.organizationId)}${withId ? ` (${a.organizationId})` : ""}${a.viaTrust ? `, via trust in ${orgName(a.viaTrust)}` : ""}`;

  if (requireApprovalFrom === "off") {
    return [field("Guardrail", `off (${setBy})`)];
  }
  if (!decision.allowed) {
    return [
      `Not installing: none of ${requireApprovalFrom.join(", ")} approved it (required by ${setBy}).`,
      `It was approved by ${decision.approvals.map((a) => approver(a, true)).join("; ")}.`,
      "To install it anyway, run again with --require-approval-from naming one of them, or off.",
    ];
  }

  const delegated = decision.matching.filter(
    (a): a is A & { viaTrust: string } => a.viaTrust !== undefined,
  );
  return [
    field(
      "Guardrail",
      `requires ${requireApprovalFrom.join(", ")} (${setBy}), met by ${decision.matching.map((a) => approver(a)).join("; ")}`,
    ),
    ...delegated.map(
      (a) =>
        `${orgName(a.organizationId)} didn't review this itself: it trusts the approvals of ${orgName(a.viaTrust)}, so installing rests on that organization's judgement.`,
    ),
  ];
}
