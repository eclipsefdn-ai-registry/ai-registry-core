// What `install skill` and `install plugin` share once the command line is
// read: where the registry is, the guardrail in force, the organizations'
// names, the guardrail check and the one confirmation.
import { checkApprovals, guardrailLines, type Approval } from "./guardrail.js";
import type { Guardrail } from "./guardrail.js";
import type { Deps } from "./run.js";
import type { Organization } from "./types.js";

export interface InstallContext {
  registry: string;
  guardrail: Guardrail;
  // Display only: settles to an empty list when organizations.json can't be
  // read, since approvals then show ids, which is no reason to refuse.
  organizations: Promise<Organization[]>;
}

/**
 * Checks the guardrail over an entry's approvals and prints what it decided.
 * True when the install may go on.
 */
export function approvalGate(
  approvals: Approval[],
  guardrail: Guardrail,
  orgName: (id: string) => string,
  deps: Pick<Deps, "printErr">,
): boolean {
  const decision = checkApprovals(approvals, guardrail.requireApprovalFrom);
  for (const line of guardrailLines(approvals, decision, guardrail, orgName)) {
    deps.printErr(line);
  }
  return decision.allowed;
}

/**
 * The one confirmation before anything is installed. `--yes` skips it; with no
 * terminal to ask on it refuses, since an agent can't answer a prompt and
 * waiting for one would hang it. True when the install may go on.
 */
export async function confirmInstall(
  yes: boolean | undefined,
  deps: Pick<Deps, "isTTY" | "confirm" | "printErr">,
): Promise<boolean> {
  if (yes) return true;
  if (!deps.isTTY) {
    deps.printErr(
      "Not installing: there is no terminal to confirm on. Pass --yes to install without asking.",
    );
    return false;
  }
  if (!(await deps.confirm("Install it?"))) {
    deps.printErr("Nothing was installed.");
    return false;
  }
  return true;
}
