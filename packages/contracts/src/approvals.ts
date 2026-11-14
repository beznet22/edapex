/**
 * Approval contracts.
 *
 * An approval is a server-issued record, not a UI affordance. The agent runtime
 * asks; the server decides what the question is and whether it is required; the
 * person answers; the answer is appended, never overwritten. A UI that "already
 * approved" something is display state, not authority.
 */

import type { ApprovalDecision } from "./agent";
import type { CapabilityRisk } from "./capabilities";

/**
 * Reused rather than redeclared: `agent.ts` already owns the decision union and
 * `capabilities.ts` owns the risk union. Two definitions of the same vocabulary
 * is how a server and a client end up disagreeing about the word "allowed".
 *
 * Not `import`ed as values because the client only needs the types; the runtime
 * checks live where the values do.
 */
export type ApprovalRiskName = CapabilityRisk;
export type ApprovalDecisionName = ApprovalDecision;

/**
 * `aborted` is distinct from `denied`: a denial answers one tool call, while an
 * abort stops the whole turn. Collapsing them would let the runtime continue
 * after a person asked it to stop.
 */
export const APPROVAL_STATUSES = ["pending", "allowed", "denied", "aborted", "expired"] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

/** `allow_for_session` records a rule; the other three answer this call only. */
export function decisionStatus(
  decision: ApprovalDecision
): Exclude<ApprovalStatus, "pending" | "expired"> {
  switch (decision) {
    case "allow_once":
    case "allow_for_session":
      return "allowed";
    case "deny":
      return "denied";
    case "abort":
      return "aborted";
  }
}

/** Whether a decision lets this call proceed. */
export function decisionAllows(decision: ApprovalDecision): boolean {
  return decision === "allow_once" || decision === "allow_for_session";
}

/** Whether a decision should also stop the turn. */
export function decisionAborts(decision: ApprovalDecision): boolean {
  return decision === "abort";
}

/** How long a pending request stays answerable. */
export const APPROVAL_TTL_SECONDS = 15 * 60;

export interface ApprovalRequestView {
  readonly id: string;
  readonly status: ApprovalStatus;
  readonly risk: ApprovalRiskName;
  /** One line, shown on the button row. */
  readonly title: string;
  /** What will happen, in the person's terms. Not the raw tool arguments. */
  readonly description: string;
  /** The exact payload that will be sent, when it is an outgoing message. */
  readonly preview?: {
    readonly recipient: string;
    readonly body: string;
  };
  readonly toolName: string;
  readonly createdAt: number;
  readonly expiresAt: number;
  readonly decision: ApprovalDecisionName | null;
  readonly decidedAt: number | null;
}

/**
 * Whether a tool needs a decision.
 *
 * Anything not positively classified as a read is a write. The default is
 * therefore "ask", because a forgotten classification must fail towards asking
 * rather than towards acting.
 */
export function requiresApproval(risk: ApprovalRiskName): boolean {
  return risk !== "read";
}

/** A read never needs a decision; a write always does. */
export function approvalFor(risk: ApprovalRiskName): "none" | "required" {
  return requiresApproval(risk) ? "required" : "none";
}

/** Expiry is computed server-side so a client cannot extend its own window. */
export function approvalExpiry(createdAtSeconds: number): number {
  return createdAtSeconds + APPROVAL_TTL_SECONDS;
}

export function isExpired(
  request: Pick<ApprovalRequestView, "expiresAt">,
  nowSeconds: number
): boolean {
  return nowSeconds >= request.expiresAt;
}

/**
 * An outgoing message must show recipient and content before it is sent.
 *
 * This is the one case the spec calls out by name, because "send an email to the
 * parents" is exactly the action a person would least forgive being automated
 * wrongly.
 */
export function requiresOutgoingPreview(toolName: string): boolean {
  return /(^|_)(send|reply|forward|post|publish|notify|email|message)(_|$)/i.test(toolName);
}
