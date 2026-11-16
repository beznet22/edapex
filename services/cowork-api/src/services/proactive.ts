import { decideClaim, isPlausibleLocalDate, type BriefClaimResult } from "@edapex/contracts";

import type { AppContext } from "../env";

/** The Hono context for one request. */
type Context = import("hono").Context<AppContext>;

/**
 * Brief and routine claims.
 *
 * The server answers one question: may this device do the work? It never produces
 * a brief and never schedules a routine — routines run on the device, and there is
 * deliberately no `scheduled` handler anywhere in this Worker.
 *
 * The dedupe shape is the load-bearing part. A single "done" flag cannot tell
 * "another device is working" from "the device that claimed it crashed", and with
 * only a flag a crash would claim the day permanently. Lease and completion are
 * therefore separate columns; see `0003_proactive.sql`.
 */

interface ClaimRow {
  claimed_by_device: string;
  claimed_at: number;
  lease_until: number;
  completed_at: number | null;
}

const BRIEF_LEASE_SECONDS = 5 * 60;
const ROUTINE_LEASE_SECONDS = 5 * 60;

export async function claimBrief(
  context: Context,
  input: {
    readonly workspaceId: string;
    readonly localDate: string;
    readonly deviceId: string;
    readonly nowMilliseconds: number;
  }
): Promise<{ readonly ok: true; readonly result: BriefClaimResult } | { readonly ok: false; readonly status: 400 | 403; readonly message: string }> {
  if (!isPlausibleLocalDate(input.localDate, input.nowMilliseconds)) {
    // A device may not claim tomorrow's key to get a second brief today.
    return {
      ok: false,
      status: 400,
      message: "The local date must be today within one day of UTC."
    };
  }

  const now = Math.floor(input.nowMilliseconds / 1000);
  const userId = context.get("userId");

  const existing = await context.env.AGENT_DB.prepare(
    "SELECT claimed_by_device, claimed_at, lease_until, completed_at \
     FROM brief_claims WHERE workspace_id = ? AND user_id = ? AND local_date = ?"
  )
    .bind(input.workspaceId, userId, input.localDate)
    .first<ClaimRow>();

  const decision = decideClaim(
    existing === null
      ? null
      : {
          key: "",
          claimedByDevice: existing.claimed_by_device,
          claimedAt: existing.claimed_at,
          leaseUntil: existing.lease_until,
          completedAt: existing.completed_at
        },
    now
  );

  if (decision.kind !== "claimed") return { ok: true, result: decision };

  // Takeover rewrites the lease; first claim inserts. Both are the same statement
  // because the completion column is never touched here — only `complete` sets it.
  await context.env.AGENT_DB.prepare(
    "INSERT INTO brief_claims \
     (workspace_id, user_id, local_date, claimed_by_device, claimed_at, lease_until, completed_at) \
     VALUES (?, ?, ?, ?, ?, ?, NULL) \
     ON CONFLICT (workspace_id, user_id, local_date) DO UPDATE SET \
       claimed_by_device = excluded.claimed_by_device, \
       claimed_at = excluded.claimed_at, \
       lease_until = excluded.lease_until \
     WHERE brief_claims.completed_at IS NULL"
  )
    .bind(
      input.workspaceId,
      userId,
      input.localDate,
      input.deviceId,
      now,
      now + BRIEF_LEASE_SECONDS
    )
    .run();

  return { ok: true, result: decision };
}

/** Marks the brief produced. Only the claiming device may do this. */
export async function completeBrief(
  context: Context,
  input: {
    readonly workspaceId: string;
    readonly localDate: string;
    readonly deviceId: string;
    readonly briefId: string;
  }
): Promise<boolean> {
  const result = await context.env.AGENT_DB.prepare(
    "UPDATE brief_claims SET completed_at = ?, brief_id = ? \
     WHERE workspace_id = ? AND user_id = ? AND local_date = ? \
       AND claimed_by_device = ? AND completed_at IS NULL"
  )
    .bind(
      Math.floor(Date.now() / 1000),
      input.briefId,
      input.workspaceId,
      context.get("userId"),
      input.localDate,
      input.deviceId
    )
    .run();

  return (result.meta.changes ?? 0) > 0;
}

/** Claims a due routine. Returns `null` when nothing is due. */
export async function claimRoutine(
  context: Context,
  input: {
    readonly routineId: string;
    readonly deviceId: string;
    readonly nowSeconds: number;
    readonly source: "schedule" | "run_now" | "trigger";
  }
): Promise<{ readonly kind: "claimed"; readonly runId: string; readonly takeover: boolean } | { readonly kind: "refused"; readonly reason: string }> {
  const routine = await context.env.AGENT_DB.prepare(
    "SELECT id, workspace_id, enabled, next_run_at FROM routines WHERE id = ?"
  )
    .bind(input.routineId)
    .first<{ id: string; workspace_id: string; enabled: number; next_run_at: number | null }>();

  if (routine === null) return { kind: "refused", reason: "unknown_routine" };
  if (routine.enabled !== 1) return { kind: "refused", reason: "disabled" };

  const leaseUntil = input.nowSeconds + ROUTINE_LEASE_SECONDS;

  // A live run blocks; an expired one does not. `finished_at IS NULL` plus a past
  // lease means the executing device disappeared, and refusing everyone would
  // lose the run entirely.
  const live = await context.env.AGENT_DB.prepare(
    "SELECT id FROM routine_runs \
     WHERE routine_id = ? AND finished_at IS NULL AND lease_until > ? LIMIT 1"
  )
    .bind(input.routineId, input.nowSeconds)
    .first<{ id: string }>();

  if (live !== null) return { kind: "refused", reason: "held_by_other" };

  const stale = await context.env.AGENT_DB.prepare(
    "SELECT id FROM routine_runs \
     WHERE routine_id = ? AND finished_at IS NULL AND lease_until <= ? LIMIT 1"
  )
    .bind(input.routineId, input.nowSeconds)
    .first<{ id: string }>();

  const runId = crypto.randomUUID();

  if (stale !== null) {
    await context.env.AGENT_DB.prepare(
      "UPDATE routine_runs SET device_id = ?, started_at = ?, lease_until = ?, attempts = attempts + 1, source = ? \
       WHERE id = ?"
    )
      .bind(input.deviceId, input.nowSeconds, leaseUntil, input.source, stale.id)
      .run();
    return { kind: "claimed", runId: stale.id, takeover: true };
  }

  await context.env.AGENT_DB.prepare(
    "INSERT INTO routine_runs \
     (id, routine_id, workspace_id, device_id, started_at, lease_until, status, source, attempts) \
     VALUES (?, ?, ?, ?, ?, ?, 'running', ?, 1)"
  )
    .bind(
      runId,
      input.routineId,
      routine.workspace_id,
      input.deviceId,
      input.nowSeconds,
      leaseUntil,
      input.source
    )
    .run();

  return { kind: "claimed", runId, takeover: false };
}

/** Records the outcome. A failure is stored, not swallowed. */
export async function finishRoutine(
  context: Context,
  input: {
    readonly runId: string;
    readonly status: "succeeded" | "failed" | "skipped" | "waiting";
    readonly error: string | null;
    readonly nowSeconds: number;
  }
): Promise<boolean> {
  const result = await context.env.AGENT_DB.prepare(
    "UPDATE routine_runs SET finished_at = ?, status = ?, error = ? WHERE id = ? AND finished_at IS NULL"
  )
    .bind(input.nowSeconds, input.status, input.error, input.runId)
    .run();

  return (result.meta.changes ?? 0) > 0;
}

export const proactive = {
  claimBrief,
  completeBrief,
  claimRoutine,
  finishRoutine
};

