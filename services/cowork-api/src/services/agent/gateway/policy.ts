import {
  approvalExpiry,
  requiresApproval,
  requiresOutgoingPreview,
  type ApprovalRiskName
} from "@edapex/contracts";

/**
 * Policy.
 *
 * The one rule this file exists to hold: **a tool call is classified before it
 * runs, and anything not positively a read is a write.** Classification is
 * server-side because a client that could classify its own calls could also
 * classify them as reads.
 *
 * The output is deliberately a decision, not a boolean. "Needs approval" and
 * "refused" are different outcomes, and collapsing them loses the reason the
 * person is being asked.
 */

export type PolicyOutcome =
  | { readonly kind: "allow"; readonly risk: ApprovalRiskName }
  | { readonly kind: "approve"; readonly risk: ApprovalRiskName; readonly expiresAt: number }
  | { readonly kind: "deny"; readonly code: PolicyDenialCode; readonly message: string };

export type PolicyDenialCode =
  | "not_granted"
  | "connector_disconnected"
  | "access_mismatch"
  | "scope_denied"
  | "no_tenant";

export interface PolicyInput {
  readonly toolName: string;
  readonly risk: ApprovalRiskName;
  /** Whether the agent holds a grant for this tool at call time. */
  readonly granted: boolean;
  /** Whether the tool reaches a third-party system. */
  readonly connector: boolean;
  /** Whether the connector reports itself connected for this person. */
  readonly connectorConnected: boolean;
  /** Now, in seconds, supplied by the caller so this stays pure and testable. */
  readonly nowSeconds: number;
}

/**
 * Decides what happens to one tool call.
 *
 * Order matters: a denied call never reaches the approval step, so a person is
 * never asked to approve something that could not run anyway. That is the
 * difference between a prompt that means something and one that trains people to
 * click through.
 */
export function evaluatePolicy(input: PolicyInput): PolicyOutcome {
  if (input.connector) {
    if (!input.granted) {
      return {
        kind: "deny",
        code: "not_granted",
        message: `This agent has no grant for ${input.toolName}.`
      };
    }
    if (!input.connectorConnected) {
      return {
        kind: "deny",
        code: "connector_disconnected",
        message: "The connector is not connected for this account."
      };
    }
  }

  if (requiresApproval(input.risk)) {
    return {
      kind: "approve",
      risk: input.risk,
      expiresAt: approvalExpiry(input.nowSeconds)
    };
  }

  return { kind: "allow", risk: input.risk };
}

/**
 * The description shown to the person.
 *
 * Written in their terms, not the tool's: "Send 32 report cards to parents" is
 * answerable; `{"classId":5,"termId":2}` is not. The raw arguments remain
 * available in the audit event, not in the primary prompt.
 */
export function describeAction(input: {
  readonly toolName: string;
  readonly risk: ApprovalRiskName;
  readonly arguments: Record<string, unknown>;
}): { title: string; description: string; preview?: { recipient: string; body: string } } {
  const title = input.toolName
    .replace(/[_.]/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

  const parts: string[] = [];
  if (input.risk === "destructive") parts.push("This cannot be undone.");
  if (requiresOutgoingPreview(input.toolName)) {
    parts.push("This message will be sent to a real recipient.");
  }
  if (parts.length === 0) parts.push("This changes stored data.");

  const preview = requiresOutgoingPreview(input.toolName) ? outgoingPreview(input.arguments) : undefined;

  return {
    title,
    description: parts.join(" "),
    ...(preview === undefined ? {} : { preview })
  };
}

/** Best-effort extraction, so a person sees the message before it is sent. */
function outgoingPreview(
  args: Record<string, unknown>
): { recipient: string; body: string } | undefined {
  const recipient =
    firstString(args, ["to", "recipient", "email", "toAddress", "channel"]) ?? "(recipient not specified)";
  const body =
    firstString(args, ["body", "message", "text", "content", "html"]) ?? "(content not specified)";
  return { recipient, body };
}

function firstString(args: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = args[key];
    if (typeof value === "string" && value.trim().length > 0) return value;
  }
  return null;
}
