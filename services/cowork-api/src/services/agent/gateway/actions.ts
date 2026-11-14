import type { ApprovalDecisionName, ApprovalRiskName } from "@edapex/contracts";
import { decisionAborts, decisionAllows } from "@edapex/contracts";

import {
  applyDecision,
  approvalFromPolicy,
  D1AuditSink,
  MemoryAuditSink,
  summariseResult,
  toAuditArguments,
  type ApprovalRecord,
  type AuditEvent,
  type AuditOutcome,
  type AuditSink
} from "./audit";
import { describeAction, evaluatePolicy, type PolicyOutcome } from "./policy";

/**
 * Act.
 *
 * The single path a write takes. Policy → audit → act, in that order and with no
 * shortcut: `execute` is the only exported way to run a tool that changes state,
 * so "did this go through policy?" has one answer rather than one per caller.
 */

export interface ToolInvocation {
  readonly toolName: string;
  readonly risk: ApprovalRiskName;
  readonly granted: boolean;
  readonly connector: boolean;
  readonly connectorConnected: boolean;
  readonly arguments: Record<string, unknown>;
}

export type ArtifactKind = "read" | "write";

export interface ActionContext {
  readonly workspaceId: string;
  readonly agentId: string | null;
  readonly actorId: string;
  readonly nowSeconds: number;
}

export type ActionOutcome =
  | { readonly kind: "read"; readonly result: unknown }
  | {
      readonly kind: "pending_approval";
      readonly approval: ApprovalRecord;
      readonly title: string;
      readonly description: string;
      readonly preview?: { readonly recipient: string; readonly body: string };
    }
  | { readonly kind: "denied"; readonly code: string; readonly message: string }
  | { readonly kind: "executed"; readonly result: unknown; readonly approvalId: string | null };

export interface ActionDependencies {
  readonly audit: AuditSink;
  readonly runTool: (invocation: ToolInvocation) => Promise<{ ok: boolean; bytes?: number; error?: string; value?: unknown }>;
  readonly newId: () => string;
}

/** Reads are not gated, but they are still audited: reach is reach. */
export async function read(
  invocation: ToolInvocation,
  context: ActionContext,
  deps: ActionDependencies
): Promise<ActionOutcome> {
  const outcome = evaluatePolicy({ ...invocation, nowSeconds: context.nowSeconds });

  if (outcome.kind === "deny") {
    await deps.audit.append(
      buildEvent(invocation, context, deps, "failed", null, outcome.message)
    );
    return { kind: "denied", code: outcome.code, message: outcome.message };
  }

  // A read that policy says needs approval is a misclassification; treating it as
  // a write is the safe direction rather than a silent allow.
  if (outcome.kind === "approve") {
    return write(invocation, context, deps);
  }

  await deps.audit.append(buildEvent(invocation, context, deps, "allowed", null, null));
  const result = await deps.runTool(invocation);
  await deps.audit.append(
    buildEvent(invocation, context, deps, result.ok ? "succeeded" : "failed", null, summariseResult(result))
  );
  return { kind: "read", result: result.value };
}

/**
 * Writes go through the approval chain.
 *
 * The pending record is created *before* anything runs, and `execute` refuses to
 * run without an allowed decision, so there is no window in which the action has
 * happened but the approval has not.
 */
export async function write(
  invocation: ToolInvocation,
  context: ActionContext,
  deps: ActionDependencies
): Promise<ActionOutcome> {
  const outcome: PolicyOutcome = evaluatePolicy({ ...invocation, nowSeconds: context.nowSeconds });

  if (outcome.kind === "deny") {
    await deps.audit.append(
      buildEvent(invocation, context, deps, "failed", null, outcome.message)
    );
    return { kind: "denied", code: outcome.code, message: outcome.message };
  }

  if (outcome.kind === "allow") {
    // Policy allowed a write with no decision. That means the risk was classified
    // as a read; do not run it, because acting without approval is the failure
    // this whole path exists to prevent.
    await deps.audit.append(
      buildEvent(invocation, context, deps, "failed", null, "write without approval")
    );
    return {
      kind: "denied",
      code: "classification_error",
      message: "A write cannot be allowed without an approval decision."
    };
  }

  const argumentsJson = toAuditArguments(invocation.arguments);
  const approval = approvalFromPolicy({
    outcome,
    id: deps.newId(),
    workspaceId: context.workspaceId,
    agentId: context.agentId,
    toolName: invocation.toolName,
    argumentsJson,
    nowSeconds: context.nowSeconds
  });

  await deps.audit.append(
    buildEvent(invocation, context, deps, "proposed", approval.id, null)
  );

  const described = describeAction({
    toolName: invocation.toolName,
    risk: invocation.risk,
    arguments: invocation.arguments
  });

  return {
    kind: "pending_approval",
    approval,
    title: described.title,
    description: described.description,
    ...(described.preview === undefined ? {} : { preview: described.preview })
  };
}

/**
 * Runs a write that has been allowed.
 *
 * Separate from `write` on purpose: the approval round trip happens outside this
 * function, so this can be called only once a decision exists and can refuse
 * anything else.
 */
export async function execute(
  invocation: ToolInvocation,
  approval: ApprovalRecord,
  decision: ApprovalDecisionName,
  context: ActionContext,
  deps: ActionDependencies
): Promise<ActionOutcome> {
  const applied = applyDecision(approval, decision, context.nowSeconds);

  if (!applied.ok) {
    await deps.audit.append(
      buildEvent(invocation, context, deps, "failed", approval.id, applied.reason)
    );
    return { kind: "denied", code: "approval_invalid", message: applied.reason };
  }

  if (!decisionAllows(decision)) {
    // `abort` stops the turn; `deny` answers this call. The distinction is
    // carried outward rather than flattened, so the runtime can honour it.
    const aborted = decisionAborts(decision);
    await deps.audit.append(
      buildEvent(invocation, context, deps, aborted ? "aborted" : "denied", approval.id, null)
    );
    return {
      kind: "denied",
      code: aborted ? "aborted" : "denied",
      message: aborted ? "The turn was stopped." : "The action was denied."
    };
  }

  await deps.audit.append(buildEvent(invocation, context, deps, "allowed", approval.id, null));
  const result = await deps.runTool(invocation);
  await deps.audit.append(
    buildEvent(
      invocation,
      context,
      deps,
      result.ok ? "succeeded" : "failed",
      approval.id,
      summariseResult(result)
    )
  );

  return { kind: "executed", result: result.value, approvalId: approval.id };
}

function buildEvent(
  invocation: ToolInvocation,
  context: ActionContext,
  deps: ActionDependencies,
  outcome: AuditOutcome,
  approvalRequestId: string | null,
  resultSummary: string | null
): AuditEvent {
  return {
    id: deps.newId(),
    workspaceId: context.workspaceId,
    agentId: context.agentId,
    actorId: context.actorId,
    toolName: invocation.toolName,
    risk: invocation.risk,
    outcome,
    approvalRequestId,
    argumentsJson: toAuditArguments(invocation.arguments),
    resultSummary,
    createdAt: context.nowSeconds
  };
}

export { D1AuditSink, MemoryAuditSink };
