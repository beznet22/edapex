import type { ApprovalDecisionName, ApprovalRiskName, ApprovalStatus } from "@edapex/contracts";
import { approvalExpiry, decisionStatus, isExpired } from "@edapex/contracts";

import type { PolicyOutcome } from "./policy";

/**
 * Audit.
 *
 * Every write leaves a record **before** it happens and another after, so a
 * crash mid-action leaves evidence of the intent rather than a silent gap. The
 * record is the accountability trail for a school platform: who asked, what was
 * proposed, who approved, what actually happened.
 *
 * Redaction is applied here rather than at the display layer, because a token
 * that reaches a log has already leaked.
 */

export type AuditOutcome = "proposed" | "allowed" | "denied" | "aborted" | "succeeded" | "failed";

export interface AuditEvent {
  readonly id: string;
  readonly workspaceId: string;
  readonly agentId: string | null;
  readonly actorId: string;
  readonly toolName: string;
  readonly risk: ApprovalRiskName;
  readonly outcome: AuditOutcome;
  readonly approvalRequestId: string | null;
  /** Redacted arguments. Never a credential. */
  readonly argumentsJson: string;
  readonly resultSummary: string | null;
  readonly createdAt: number;
}

const SECRET_KEY = /(token|secret|password|api[_-]?key|authorization|cookie|credential|refresh)/i;
const MAX_ARGUMENT_CHARS = 2_000;

/**
 * Removes anything credential-shaped and caps the size.
 *
 * Recursive, because a token nested inside a connector payload is the realistic
 * case — a top-level filter would miss `{ auth: { access_token } }`.
 */
export function redactArguments(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[depth limit]";
  if (value === null || typeof value !== "object") return value;

  if (Array.isArray(value)) {
    return value.slice(0, 100).map((entry) => redactArguments(entry, depth + 1));
  }

  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SECRET_KEY.test(key) ? "[redacted]" : redactArguments(inner, depth + 1);
  }
  return out;
}

export function toAuditArguments(args: Record<string, unknown>): string {
  const serialised = JSON.stringify(redactArguments(args));
  return serialised.length > MAX_ARGUMENT_CHARS
    ? `${serialised.slice(0, MAX_ARGUMENT_CHARS)}…[truncated]`
    : serialised;
}

/**
 * A short, non-leaking result summary.
 *
 * Byte counts and status rather than content, for the same reason search logs
 * record counts: the content is the thing that must not persist.
 */
export function summariseResult(result: { readonly ok: boolean; readonly bytes?: number; readonly error?: string }): string {
  if (!result.ok) return `failed: ${result.error ?? "unknown"}`;
  return result.bytes === undefined ? "succeeded" : `succeeded: ${result.bytes} bytes`;
}

export interface AuditSink {
  append(event: AuditEvent): Promise<void>;
}

/** D1-backed sink. `agent_audit_events` is local-only unless a redacted subset is approved. */
export class D1AuditSink implements AuditSink {
  constructor(private readonly db: D1Database) {}

  async append(event: AuditEvent): Promise<void> {
    await this.db
      .prepare(
        "INSERT INTO agent_audit_events \
         (id, workspace_id, agent_id, actor_id, tool_name, risk, outcome, approval_request_id, arguments_json, result_summary, created_at) \
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .bind(
        event.id,
        event.workspaceId,
        event.agentId,
        event.actorId,
        event.toolName,
        event.risk,
        event.outcome,
        event.approvalRequestId,
        event.argumentsJson,
        event.resultSummary,
        event.createdAt
      )
      .run();
  }
}

/** Used in tests and by a caller that only needs the trail in memory. */
export class MemoryAuditSink implements AuditSink {
  readonly events: AuditEvent[] = [];

  async append(event: AuditEvent): Promise<void> {
    this.events.push(event);
  }
}

export interface ApprovalRecord {
  readonly id: string;
  readonly workspaceId: string;
  readonly agentId: string | null;
  readonly toolName: string;
  readonly risk: ApprovalRiskName;
  readonly status: ApprovalStatus;
  readonly decision: ApprovalDecisionName | null;
  readonly argumentsJson: string;
  readonly createdAt: number;
  readonly expiresAt: number;
  readonly decidedAt: number | null;
}

/**
 * Creates the pending record that a decision attaches to.
 *
 * The expiry is server-computed, so a client cannot widen its own window, and a
 * `read` never reaches here because policy would have allowed it outright.
 */
export function approvalFromPolicy(input: {
  readonly outcome: Extract<PolicyOutcome, { kind: "approve" }>;
  readonly id: string;
  readonly workspaceId: string;
  readonly agentId: string | null;
  readonly toolName: string;
  readonly argumentsJson: string;
  readonly nowSeconds: number;
}): ApprovalRecord {
  return {
    id: input.id,
    workspaceId: input.workspaceId,
    agentId: input.agentId,
    toolName: input.toolName,
    risk: input.outcome.risk,
    status: "pending",
    decision: null,
    argumentsJson: input.argumentsJson,
    createdAt: input.nowSeconds,
    expiresAt: input.outcome.expiresAt ?? approvalExpiry(input.nowSeconds),
    decidedAt: null
  };
}

/**
 * Applies a decision.
 *
 * A decision is appended once and never overwritten: the first answer wins, so a
 * replayed or racing approval cannot flip a denial into an allow.
 */
export function applyDecision(
  record: ApprovalRecord,
  decision: ApprovalDecisionName,
  nowSeconds: number
): { readonly ok: true; readonly record: ApprovalRecord } | { readonly ok: false; readonly reason: string } {
  if (record.status !== "pending") {
    return { ok: false, reason: `This request was already ${record.status}.` };
  }
  if (isExpired(record, nowSeconds)) {
    return { ok: false, reason: "This request expired." };
  }
  return {
    ok: true,
    record: {
      ...record,
      status: decisionStatus(decision),
      decision,
      decidedAt: nowSeconds
    }
  };
}
