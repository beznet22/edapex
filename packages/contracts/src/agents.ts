/**
 * Agent lifecycle contracts.
 *
 * The narrowing invariant is the whole point of this module:
 *
 *   agent.effectiveGrant ⊆ capabilityManifest(creator.role, features)
 *
 * An agent may only narrow. It may never introduce an operation, a tool or a role.
 * Without that, creating an agent is privilege escalation: a teacher mints an agent,
 * grants it an admin operation, and holds admin authority through a proxy.
 *
 * Creation is **plan-then-apply**. Proposing resolves the candidate grants and
 * reports anything that would exceed the ceiling; it does not silently trim, because
 * a person who is told "these three were dropped" can fix their intent, while a
 * silent trim leaves them believing they granted four.
 */

import { allowedOperationIds, type CapabilityRole, type TenantFeature } from "./capabilities";

export const AGENT_KINDS = ["local", "remote"] as const;
export type AgentKind = (typeof AGENT_KINDS)[number];

export interface AgentDraft {
  readonly name: string;
  readonly purpose: string;
  readonly model: string;
  readonly operationIds: readonly string[];
}

export interface AgentRecordView {
  readonly id: string;
  readonly workspaceId: string;
  readonly createdBy: string;
  readonly name: string;
  readonly purpose: string;
  readonly model: string;
  readonly kind: AgentKind;
  readonly operationIds: readonly string[];
  readonly createdAt: number;
  readonly ceilingSnapshot: readonly string[];
}

/**
 * Result of proposing an agent.
 *
 * `exceeding` is reported, never silently dropped. `within` is what *would* be
 * applied if the person proceeds.
 */
export type AgentProposal =
  | {
      readonly kind: "proposable";
      readonly within: readonly string[];
      readonly exceeding: readonly string[];
      readonly acrossTools: number;
    }
  | { readonly kind: "rejected"; readonly reason: ProposalRejection; readonly detail?: string };

export type ProposalRejection =
  | "empty_name"
  | "no_operations"
  | "remote_requires_admin"
  | "too_many_operations";

/** A tool may hold at most this many operations; a manifest at most this many tools. */
export const MAX_OPERATIONS_PER_TOOL = 8;
export const MAX_TOOLS_PER_AGENT = 5;

/**
 * Resolves a candidate grant set against the creator's ceiling.
 *
 * Pure on purpose: the same function runs when a person is shown a preview, when
 * they apply, and when a turn executes. Three call sites, one answer.
 */
export function proposeAgent(input: {
  readonly draft: AgentDraft;
  readonly kind: AgentKind;
  readonly creatorRole: CapabilityRole;
  readonly features: readonly TenantFeature[];
  /** Remote agents need explicit admin approval; the caller decides that. */
  readonly creatorIsAdmin: boolean;
}): AgentProposal {
  if (input.draft.name.trim().length === 0) {
    return { kind: "rejected", reason: "empty_name" };
  }
  if (input.draft.operationIds.length === 0) {
    return { kind: "rejected", reason: "no_operations" };
  }
  if (input.kind === "remote" && !input.creatorIsAdmin) {
    // Never derived from the creator: a remote endpoint is reach, and only an
    // administrator may widen it.
    return { kind: "rejected", reason: "remote_requires_admin" };
  }

  const allowed = allowedOperationIds(input.creatorRole, input.features);
  const within: string[] = [];
  const exceeding: string[] = [];

  for (const operation of new Set(input.draft.operationIds)) {
    if (allowed.has(operation)) within.push(operation);
    else exceeding.push(operation);
  }

  if (within.length === 0) {
    return {
      kind: "rejected",
      reason: "too_many_operations",
      detail: "None of the requested operations are within this role's ceiling."
    };
  }
  if (within.length > MAX_TOOLS_PER_AGENT * MAX_OPERATIONS_PER_TOOL) {
    return { kind: "rejected", reason: "too_many_operations" };
  }

  return { kind: "proposable", within, exceeding, acrossTools: within.length };
}

/**
 * Whether a stored grant still resolves against the current ceiling.
 *
 * A grant that no longer resolves is **dropped, not widened** (spec 10). This is the
 * check that runs at turn execution, so a role change or a disabled feature shrinks
 * every dependent agent without anyone having to revisit them.
 */
export function effectiveGrant(input: {
  readonly stored: readonly string[];
  readonly creatorRole: CapabilityRole;
  readonly features: readonly TenantFeature[];
}): readonly string[] {
  const allowed = allowedOperationIds(input.creatorRole, input.features);
  return input.stored.filter((operation) => allowed.has(operation));
}

/** Operations that were granted and no longer resolve. Surfaced, not hidden. */
export function droppedGrant(input: {
  readonly stored: readonly string[];
  readonly creatorRole: CapabilityRole;
  readonly features: readonly TenantFeature[];
}): readonly string[] {
  const allowed = allowedOperationIds(input.creatorRole, input.features);
  return input.stored.filter((operation) => !allowed.has(operation));
}

/**
 * Server-side prompt built from a stored agent.
 *
 * Included here rather than in the runtime so the operation list a turn sees is
 * provably the effective grant, not the original request.
 */
export function agentInstructions(agent: AgentRecordView, effective: readonly string[]): string {
  const lines = [
    agent.purpose.trim(),
    "",
    "You may only use these operations:",
    ...effective.map((operation) => `- ${operation}`),
    "",
    "Anything outside that list is not yours to do. Say so rather than working around it."
  ];
  return lines.filter((line) => line.length > 0).join("\n");
}
