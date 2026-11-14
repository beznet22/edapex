/**
 * Routine contracts.
 *
 * Routines run **on the device**, never on a Worker cron. The server holds state,
 * claim leases and cursors; nothing schedules itself. The trade is stated in the
 * UI rather than hidden here: a routine only fires while a device is open.
 */

/** A five-field cron subset: minute hour day-of-month month day-of-week. */
export const CRON_FIELDS = 5;

export interface RoutineView {
  readonly id: string;
  readonly workspaceId: string;
  readonly agentId: string;
  readonly title: string;
  readonly instructions: string;
  readonly schedule: string;
  readonly enabled: boolean;
  readonly nextRunAt: number | null;
  readonly lastRunAt: number | null;
}

export const RUN_STATUSES = ["running", "succeeded", "failed", "skipped", "waiting"] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export const RUN_SOURCES = ["schedule", "run_now", "trigger"] as const;
export type RunSource = (typeof RUN_SOURCES)[number];

export interface RoutineRunView {
  readonly id: string;
  readonly routineId: string;
  readonly startedAt: number;
  readonly finishedAt: number | null;
  readonly status: RunStatus;
  readonly error: string | null;
  readonly source: RunSource;
}

/**
 * Why a claim was refused.
 *
 * `held_by_other` and `already_done` are deliberately distinct: the first means
 * wait, the second means never — and a UI that shows the same message for both
 * teaches people to retry something that will never succeed.
 */
export const CLAIM_REFUSALS = [
  "held_by_other",
  "already_done",
  "lease_expired_takeover",
  "disabled"
] as const;

export type ClaimResult =
  | {
      readonly kind: "claimed";
      readonly routineId: string;
      readonly leaseUntil: number;
      /** True when this device took over an expired lease rather than being first. */
      readonly takeover: boolean;
    }
  | { readonly kind: "refused"; readonly reason: (typeof CLAIM_REFUSALS)[number] };

/** How long a claim is held before another device may take over. */
export const LEASE_SECONDS = 5 * 60;

/**
 * Whether a claim is still live.
 *
 * A claim with no `completedAt` and a lease in the past is *abandoned*, not held:
 * the device that made it disappeared, and refusing everyone would lose the run
 * entirely. This is the distinction a plain `INSERT OR IGNORE` cannot express.
 */
export function isLeaseLive(
  claim: { readonly leaseUntil: number; readonly completedAt: number | null },
  nowSeconds: number
): boolean {
  return claim.completedAt === null && claim.leaseUntil > nowSeconds;
}

/** Only a completed claim is permanent. */
export function isClaimFinal(claim: { readonly completedAt: number | null }): boolean {
  return claim.completedAt !== null;
}

/**
 * Parses a schedule into the fields it sets.
 *
 * A deliberately small subset. Full cron has six syntaxes and two day-of-week
 * conventions, and a routine that silently fires on the wrong day is worse than
 * one that refuses to parse. Returns `null` for anything not understood so the
 * caller can tell the person, rather than guessing.
 */
export function parseSchedule(schedule: string): readonly string[] | null {
  const fields = schedule.trim().split(/\s+/);
  if (fields.length !== CRON_FIELDS) return null;

  const valid = /^[\d*,\-/]+$/;
  return fields.every((field) => valid.test(field)) ? fields : null;
}

/**
 * Whether a routine is due, evaluated **locally**.
 *
 * No server round trip: due-ness is a function of rows the device already holds,
 * which is what keeps a hundred tenants from turning into a ping storm.
 */
export function isDue(routine: Pick<RoutineView, "enabled" | "nextRunAt">, nowSeconds: number): boolean {
  return routine.enabled && routine.nextRunAt !== null && routine.nextRunAt <= nowSeconds;
}

/** Runs that never finished and whose lease expired are re-claimable. */
export function isStaleRun(run: Pick<RoutineRunView, "status" | "startedAt">, nowSeconds: number): boolean {
  return run.status === "running" && run.startedAt + LEASE_SECONDS < nowSeconds;
}

/**
 * The routine only fires while a device is open. This is the copy the UI shows,
 * exported so the promise is written once rather than paraphrased per surface.
 */
export const ROUTINE_UNAVAILABLE_NOTICE =
  "Routines run while EdApex is open. A missed run is skipped, not caught up.";
