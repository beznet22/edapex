/**
 * Device-side scheduler.
 *
 * Routines run **while this device is open**. There is no Worker cron, and there
 * must not be: spec 41 rejects per-routine fan-out because a hundred tenants would
 * exceed the account-wide D1 write cap, and one documented incident already
 * reached 148,861 writes in a day.
 *
 * The consequence is stated in the UI, not hidden: a routine that came due while
 * nobody had EdApex open is **skipped**, not caught up. That is the trade this
 * design accepts, and `ROUTINE_UNAVAILABLE_NOTICE` is the sentence users see.
 *
 * Two properties matter more than the happy path:
 *
 * 1. **A tick must not double-fire.** `isDue` is evaluated against a locally
 *    advanced cursor, and the server claim is the authority. If the claim is
 *    refused, nothing runs.
 * 2. **A failure is recorded, not retried silently.** The run is finished as
 *    `failed` with its reason, because the Tasks surface shows retry attempts and
 *    a silent retry would make that display a lie.
 */

import { isDue, LEASE_SECONDS, type RoutineView } from "@edapex/contracts";

export type RoutineOutcome =
  | { readonly kind: "idle" }
  | { readonly kind: "ran"; readonly routineId: string; readonly runId: string }
  | { readonly kind: "waiting"; readonly routineId: string; readonly runId: string }
  | { readonly kind: "skipped"; readonly routineId: string; readonly reason: string }
  | { readonly kind: "failed"; readonly routineId: string; readonly error: string };

/** What the scheduler needs from the outside world. Narrow on purpose. */
export interface SchedulerDeps {
  readonly routines: () => Promise<readonly RoutineView[]>;
  readonly claim: (routineId: string, deviceId: string) => Promise<
    | { readonly kind: "claimed"; readonly runId: string; readonly takeover: boolean }
    | { readonly kind: "refused"; readonly reason: string }
  >;
  /**
   * Runs the turn and reports how it settled.
   *
   * `waiting` is deliberately distinct from `failed`: a routine that stopped for
   * an approval has done what it should, and recording it as broken would mark a
   * task failed because it asked a question.
   */
  readonly run: (routine: RoutineView) => Promise<{
    readonly status: "succeeded" | "waiting" | "failed";
    readonly error?: string;
  }>;
  readonly finish: (
    runId: string,
    status: "succeeded" | "failed" | "skipped" | "waiting",
    error: string | null
  ) => Promise<void>;
  /** Locally advanced so a single tick cannot fire the same routine twice. */
  readonly markRan: (routineId: string, atSeconds: number) => Promise<void>;
  readonly now: () => number;
}

/**
 * One scheduling tick.
 *
 * Returns the outcomes so a caller can show them; a scheduler that swallows its
 * results is untestable and unexplainable. Processes due routines sequentially —
 * two routines writing to the same transcript concurrently would interleave turns.
 */
export async function tick(
  deps: SchedulerDeps,
  deviceId: string
): Promise<readonly RoutineOutcome[]> {
  const now = deps.now();
  const routines = await deps.routines();
  const due = routines.filter((routine) => isDue(routine, now));

  const outcomes: RoutineOutcome[] = [];

  for (const routine of due) {
    const claim = await deps.claim(routine.id, deviceId);

    if (claim.kind === "refused") {
      // `held_by_other` and `already_done` are different answers: one resolves in
      // minutes, the other never will. Neither is a failure.
      outcomes.push({ kind: "skipped", routineId: routine.id, reason: claim.reason });
      continue;
    }

    // Advance the local cursor *before* running. If the turn hangs, the next tick
    // must not start the same routine again; the server lease covers the rest.
    await deps.markRan(routine.id, now + LEASE_SECONDS);

    const result = await deps.run(routine);

    if (result.status === "succeeded") {
      await deps.finish(claim.runId, "succeeded", null);
      outcomes.push({ kind: "ran", routineId: routine.id, runId: claim.runId });
      continue;
    }

    if (result.status === "waiting") {
      // Paused on a person. The server accepts `waiting`, so it is recorded as
      // that rather than as a failure with a misleading error.
      await deps.finish(claim.runId, "waiting", result.error ?? null);
      outcomes.push({ kind: "waiting", routineId: routine.id, runId: claim.runId });
      continue;
    }

    const error = result.error ?? "the routine did not complete";
    await deps.finish(claim.runId, "failed", error);
    outcomes.push({ kind: "failed", routineId: routine.id, error });
  }

  if (outcomes.length === 0) outcomes.push({ kind: "idle" });
  return outcomes;
}

/** How often an open device checks for due work. */
export const TICK_INTERVAL_MS = 60_000;

/**
 * Whether a tick is worth running at all.
 *
 * Cheap guard so a background tab, a hidden window and a device with no routines
 * do not each cause a network round trip every minute.
 */
export function shouldTick(input: {
  readonly documentHidden: boolean;
  readonly hasRoutines: boolean;
}): boolean {
  return !input.documentHidden && input.hasRoutines;
}

/**
 * The next time anything is due, or `null` when nothing is scheduled.
 *
 * Used to sleep instead of polling: with no routines there is no reason to ask the
 * server anything, which is the difference between a scheduler and a heartbeat.
 */
export function nextDueAt(routines: readonly RoutineView[]): number | null {
  const times = routines
    .filter((routine) => routine.enabled && routine.nextRunAt !== null)
    .map((routine) => routine.nextRunAt as number);
  return times.length === 0 ? null : Math.min(...times);
}
