/**
 * Agent persistence.
 *
 * The invariant this file exists to enforce: **an agent's grant is always a subset of
 * its creator's current ceiling.** Without it, creating an agent is privilege
 * escalation — a teacher mints an agent, grants it `admin_issues.apply`, and holds
 * admin authority through a proxy.
 *
 * Three consequences shape the code:
 *
 * 1. **Nothing caches "valid".** The ceiling depends on the creator's role and on the
 *    tenant feature mask, both of which change. A stored boolean would be true when it
 *    was written and false a week later, with no event in between.
 * 2. **Re-validation happens on read, not only on write.** A feature disabled after
 *    creation must shrink the agent's effective grant immediately, so `toView` filters
 *    through today's ceiling rather than returning what was stored.
 * 3. **Writes are rejected, not trimmed.** Spec 10 requires the proposal to report what
 *    exceeds the ceiling. Silently dropping an operation leaves the creator believing
 *    they granted it.
 */

import {
  allowedOperationIds,
  proposeAgent,
  type AgentProposal,
  type CapabilityRole,
  type TenantFeature
} from "@edapex/contracts";

import type { AppContext } from "../../env";

/** The Hono context for one request. `AppContext` is the bindings, not the context. */
type Context = import("hono").Context<AppContext>;

export interface AgentRow {
  readonly id: string;
  readonly workspace_id: string;
  readonly created_by: string;
  readonly name: string;
  readonly purpose: string;
  readonly model: string;
  readonly channel_id: string | null;
  readonly kind: string;
  readonly creator_role: string | null;
  readonly ceiling_snapshot: string;
  readonly created_at: number;
  readonly updated_at: number;
  readonly deleted_at: number | null;
}

export interface AgentView {
  readonly id: string;
  readonly name: string;
  readonly purpose: string;
  readonly model: string;
  readonly kind: "local" | "remote";
  readonly createdBy: string;
  readonly createdAt: number;
  readonly updatedAt: number;
  /** Operations the agent may actually use **now**, after today's ceiling. */
  readonly operations: readonly string[];
  /** Stored operations that no longer resolve. Shown so a shrink is visible. */
  readonly revokedByPolicy: readonly string[];
  readonly ceilingSnapshot: readonly string[];
}

export interface CreateAgentInput {
  readonly workspaceId: string;
  readonly creatorId: string;
  readonly creatorRole: CapabilityRole;
  readonly creatorIsAdmin: boolean;
  readonly features: readonly TenantFeature[];
  readonly name: string;
  readonly purpose: string;
  readonly model: string;
  readonly kind: "local" | "remote";
  readonly operationIds: readonly string[];
  readonly channelId?: string | null;
}

export type CreateAgentResult =
  | { readonly kind: "created"; readonly agent: AgentView }
  | { readonly kind: "rejected"; readonly reason: CreateRejection };

export type CreateRejection =
  | { readonly code: "not_proposable"; readonly proposal: AgentProposal }
  | { readonly code: "name_taken" };

/**
 * Ceiling ids are compared as a set on read, so the snapshot is stored as JSON text
 * rather than a delimited string — an operation id containing a comma would otherwise
 * split into two.
 */
const CAPABILITY_ROLES = ["admin", "teacher", "parent", "student"] as const;

function isCapabilityRole(value: string | null): value is CapabilityRole {
  return value !== null && (CAPABILITY_ROLES as readonly string[]).includes(value);
}

function parseSnapshot(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is string => typeof entry === "string");
  } catch {
    // A corrupt snapshot must not widen the agent. Empty means "no recorded ceiling",
    // and validation against today's ceiling still runs on read.
    return [];
  }
}

/**
 * Reads one agent and projects it through **today's** ceiling.
 *
 * `revokedByPolicy` is the difference between stored and effective. It is surfaced
 * rather than hidden because a teacher who granted twelve operations and now sees
 * nine needs to know which three and why, not a silently shorter list.
 */
export async function toView(
  context: Context,
  row: AgentRow,
  ceiling: ReadonlySet<string>
): Promise<AgentView> {
  const stored = await context.env.AGENT_DB.prepare(
    "SELECT operation_id FROM agent_grants WHERE workspace_id = ? AND agent_id = ? AND revoked_at IS NULL"
  )
    .bind(row.workspace_id, row.id)
    .all<{ operation_id: string }>();

  const storedIds = stored.results.map((entry) => entry.operation_id);
  const effective = effectiveGrantFrom(storedIds, ceiling);
  const effectiveSet = new Set(effective);

  return {
    id: row.id,
    name: row.name,
    purpose: row.purpose,
    model: row.model,
    kind: row.kind === "remote" ? "remote" : "local",
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    operations: effective,
    revokedByPolicy: storedIds.filter((id) => !effectiveSet.has(id)),
    ceilingSnapshot: parseSnapshot(row.ceiling_snapshot)
  };
}

/** Preserves stored order while dropping anything outside the ceiling. */
function effectiveGrantFrom(
  stored: readonly string[],
  ceiling: ReadonlySet<string>
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of stored) {
    if (!ceiling.has(id) || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * The set of operations a role may use right now.
 *
 * `allowedOperationIds`, not `effectiveGrant`: with an empty `stored` list the latter
 * returns an empty set, which made every ceiling empty and silently stripped every
 * agent's grants on read. That is the kind of bug that looks like "the agent has no
 * permissions" rather than "the code is wrong", so it belongs in one named place.
 */
function ceilingOf(role: CapabilityRole, features: readonly TenantFeature[]): ReadonlySet<string> {
  return allowedOperationIds(role, features);
}

/**
 * Creates an agent, or explains why it cannot exist.
 *
 * Validation runs through `proposeAgent` rather than inline checks so the client and
 * the server reject for the same reasons — a preview that says "proposable" and a
 * server that answers 403 is worse than either alone.
 */
export async function createAgent(
  context: Context,
  input: CreateAgentInput
): Promise<CreateAgentResult> {
  const proposal = proposeAgent({
    draft: {
      name: input.name,
      purpose: input.purpose,
      model: input.model,
      operationIds: input.operationIds
    },
    kind: input.kind,
    creatorRole: input.creatorRole,
    features: input.features,
    creatorIsAdmin: input.creatorIsAdmin
  });

  if (proposal.kind !== "proposable") {
    return { kind: "rejected", reason: { code: "not_proposable", proposal } };
  }

  const existing = await context.env.AGENT_DB.prepare(
    "SELECT id FROM agents WHERE workspace_id = ? AND lower(name) = lower(?) AND deleted_at IS NULL"
  )
    .bind(input.workspaceId, input.name.trim())
    .first<{ id: string }>();

  if (existing !== null) {
    return { kind: "rejected", reason: { code: "name_taken" } };
  }

  const now = Date.now();
  const id = crypto.randomUUID();
  const ceiling = ceilingOf(input.creatorRole, input.features);

  // One batch, so a failed grant insert cannot leave an agent with no permissions
  // that nonetheless appears in the list.
  const statements = [
    context.env.AGENT_DB.prepare(
      `INSERT INTO agents (id, workspace_id, created_by, name, purpose, model, channel_id, kind, creator_role, ceiling_snapshot, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      id,
      input.workspaceId,
      input.creatorId,
      input.name.trim(),
      input.purpose.trim(),
      input.model,
      input.channelId ?? null,
      input.kind,
      input.creatorRole,
      JSON.stringify([...ceiling].sort()),
      now,
      now
    ),
    ...proposal.within.map((operation) =>
      context.env.AGENT_DB.prepare(
        `INSERT INTO agent_grants (agent_id, workspace_id, operation_id, granted_by, granted_at)
         VALUES (?, ?, ?, ?, ?)`
      ).bind(id, input.workspaceId, operation, input.creatorId, now)
    )
  ];

  await context.env.AGENT_DB.batch(statements);

  return {
    kind: "created",
    agent: {
      id,
      name: input.name.trim(),
      purpose: input.purpose.trim(),
      model: input.model,
      kind: input.kind,
      createdBy: input.creatorId,
      createdAt: now,
      updatedAt: now,
      operations: proposal.within,
      revokedByPolicy: [],
      ceilingSnapshot: [...ceiling].sort()
    }
  };
}

/** Lists live agents in a workspace, projected through today's ceiling. */
export async function listAgents(
  context: Context,
  input: {
    readonly workspaceId: string;
    readonly creatorRole: CapabilityRole;
    readonly features: readonly TenantFeature[];
  }
): Promise<AgentView[]> {
  const rows = await context.env.AGENT_DB.prepare(
    "SELECT * FROM agents WHERE workspace_id = ? AND deleted_at IS NULL ORDER BY created_at DESC"
  )
    .bind(input.workspaceId)
    .all<AgentRow>();

  const ceiling = ceilingOf(input.creatorRole, input.features);
  return Promise.all(rows.results.map((row) => toView(context, row, ceiling)));
}

export async function getAgent(
  context: Context,
  input: {
    readonly workspaceId: string;
    readonly agentId: string;
    readonly creatorRole: CapabilityRole;
    readonly features: readonly TenantFeature[];
  }
): Promise<AgentView | null> {
  const row = await context.env.AGENT_DB.prepare(
    "SELECT * FROM agents WHERE workspace_id = ? AND id = ? AND deleted_at IS NULL"
  )
    .bind(input.workspaceId, input.agentId)
    .first<AgentRow>();

  if (row === null) return null;
  return toView(context, row, ceilingOf(input.creatorRole, input.features));
}

/**
 * Replaces an agent's grants.
 *
 * **The ceiling is the creator's, not the actor's.** Spec 10 states it as
 * `agent.effectiveGrant ⊆ capabilityManifest(creator.role, features)`, and that
 * distinction is load-bearing: an administrator editing a teacher's agent can only
 * grant what the *teacher* holds, otherwise the administrator has built a channel that
 * hands admin operations to someone who could not otherwise use them. Narrowing is the
 * only direction a mutation may move.
 *
 * Revokes and inserts in one batch: a partial failure would leave the agent holding the
 * union of the old and new grants, which is wider than either.
 */
export async function setAgentGrants(
  context: Context,
  input: {
    readonly workspaceId: string;
    readonly agentId: string;
    readonly actorId: string;
    /** The role of the user who *created* the agent. Resolved by the caller. */
    readonly creatorRole: CapabilityRole;
    readonly creatorIsAdmin: boolean;
    readonly features: readonly TenantFeature[];
    readonly operationIds: readonly string[];
  }
): Promise<CreateAgentResult> {
  const row = await context.env.AGENT_DB.prepare(
    "SELECT * FROM agents WHERE workspace_id = ? AND id = ? AND deleted_at IS NULL"
  )
    .bind(input.workspaceId, input.agentId)
    .first<AgentRow>();

  if (row === null) {
    return { kind: "rejected", reason: { code: "not_proposable", proposal: { kind: "rejected", reason: "no_operations" } } };
  }

  // The stored creator role wins. A null role means the row predates the column, so
  // fall back to the actor — which can only narrow, never widen, because the actor's
  // ceiling is by definition their own.
  const ceilingRole = isCapabilityRole(row.creator_role) ? row.creator_role : input.creatorRole;

  const proposal = proposeAgent({
    draft: {
      name: row.name,
      purpose: row.purpose,
      model: row.model,
      operationIds: input.operationIds
    },
    kind: row.kind === "remote" ? "remote" : "local",
    creatorRole: ceilingRole,
    features: input.features,
    creatorIsAdmin: input.creatorIsAdmin
  });

  if (proposal.kind !== "proposable") {
    return { kind: "rejected", reason: { code: "not_proposable", proposal } };
  }

  const now = Date.now();
  const ceiling = ceilingOf(ceilingRole, input.features);

  await context.env.AGENT_DB.batch([
    context.env.AGENT_DB.prepare(
      "UPDATE agent_grants SET revoked_at = ? WHERE workspace_id = ? AND agent_id = ? AND revoked_at IS NULL"
    ).bind(now, input.workspaceId, input.agentId),
    ...proposal.within.map((operation) =>
      context.env.AGENT_DB.prepare(
        `INSERT INTO agent_grants (agent_id, workspace_id, operation_id, granted_by, granted_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT (agent_id, operation_id)
         DO UPDATE SET revoked_at = NULL, granted_by = excluded.granted_by, granted_at = excluded.granted_at`
      ).bind(input.agentId, input.workspaceId, operation, input.actorId, now)
    ),
    context.env.AGENT_DB.prepare(
      "UPDATE agents SET updated_at = ?, ceiling_snapshot = ? WHERE workspace_id = ? AND id = ?"
    ).bind(now, JSON.stringify([...ceiling].sort()), input.workspaceId, input.agentId)
  ]);

  const updated = await getAgent(context, {
    workspaceId: input.workspaceId,
    agentId: input.agentId,
    creatorRole: input.creatorRole,
    features: input.features
  });

  if (updated === null) {
    throw new Error("Agent disappeared between update and read");
  }
  return { kind: "created", agent: updated };
}

/** Soft delete. History rows keep referring to the agent, so the row stays. */
export async function deleteAgent(
  context: Context,
  input: { readonly workspaceId: string; readonly agentId: string }
): Promise<void> {
  await context.env.AGENT_DB.prepare(
    "UPDATE agents SET deleted_at = ? WHERE workspace_id = ? AND id = ? AND deleted_at IS NULL"
  )
    .bind(Date.now(), input.workspaceId, input.agentId)
    .run();
}
