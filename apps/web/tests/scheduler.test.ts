import { describe, expect, it, vi } from "vitest";

import { isDue, type RoutineView } from "@edapex/contracts";
import {
  nextDueAt,
  shouldTick,
  tick,
  TICK_INTERVAL_MS,
  type SchedulerDeps
} from "@/lib/scheduler";

/**
 * The scheduler.
 *
 * The happy path is one line; what matters is that a tick cannot double-fire, that
 * a refused claim runs nothing, and that a failure is recorded rather than silently
 * retried. Those are the behaviours a routine scheduler gets wrong.
 */

const NOW = 1_000_000;

function routine(overrides: Partial<RoutineView> = {}): RoutineView {
  return {
    id: "routine-1",
    workspaceId: "ws-1",
    agentId: "agent-1",
    title: "Morning brief",
    instructions: "Summarise",
    schedule: "0 8 * * *",
    enabled: true,
    nextRunAt: NOW - 60,
    lastRunAt: null,
    ...overrides
  };
}

function deps(overrides: Partial<SchedulerDeps> = {}): SchedulerDeps & {
  ran: string[];
  finished: { runId: string; status: string; error: string | null }[];
  marked: { routineId: string; at: number }[];
} {
  const ran: string[] = [];
  const finished: { runId: string; status: string; error: string | null }[] = [];
  const marked: { routineId: string; at: number }[] = [];

  return {
    ran,
    finished,
    marked,
    routines: async () => [routine()],
    claim: async () => ({ kind: "claimed", runId: "run-1", takeover: false }),
    run: async (candidate) => {
      ran.push(candidate.id);
      return { status: "succeeded" };
    },
    finish: async (runId, status, error) => {
      finished.push({ runId, status, error });
    },
    markRan: async (routineId, at) => {
      marked.push({ routineId, at });
    },
    now: () => NOW,
    ...overrides
  };
}

describe("tick", () => {
  it("runs a due routine and records success", async () => {
    const d = deps();
    const outcomes = await tick(d, "device-a");

    expect(outcomes).toEqual([{ kind: "ran", routineId: "routine-1", runId: "run-1" }]);
    expect(d.ran).toEqual(["routine-1"]);
    expect(d.finished).toEqual([{ runId: "run-1", status: "succeeded", error: null }]);
  });

  it("does nothing when nothing is due", async () => {
    const d = deps({ routines: async () => [routine({ nextRunAt: NOW + 60_000 })] });
    expect(await tick(d, "device-a")).toEqual([{ kind: "idle" }]);
    expect(d.ran).toEqual([]);
  });

  it("does nothing for a disabled routine", async () => {
    const d = deps({ routines: async () => [routine({ enabled: false })] });
    expect(await tick(d, "device-a")).toEqual([{ kind: "idle" }]);
  });

  it("does not run when the claim is refused", async () => {
    const d = deps({
      claim: async () => ({ kind: "refused", reason: "held_by_other" })
    });
    const outcomes = await tick(d, "device-a");

    expect(outcomes).toEqual([
      { kind: "skipped", routineId: "routine-1", reason: "held_by_other" }
    ]);
    expect(d.ran).toEqual([]);
    expect(d.finished).toEqual([]);
  });

  it("records a failure instead of retrying silently", async () => {
    const d = deps({
      run: async () => ({ status: "failed", error: "the connector timed out" })
    });
    const outcomes = await tick(d, "device-a");

    expect(outcomes).toEqual([
      { kind: "failed", routineId: "routine-1", error: "the connector timed out" }
    ]);
    // Recorded so the Tasks surface can show "Attempt 2 of 3 — reason".
    expect(d.finished).toEqual([
      { runId: "run-1", status: "failed", error: "the connector timed out" }
    ]);
  });

  it("advances the local cursor before running", async () => {
    const d = deps();
    await tick(d, "device-a");

    // Marked before the run completes: a hang must not cause a second start.
    expect(d.marked).toEqual([{ routineId: "routine-1", at: NOW + 300 }]);
  });

  it("processes several due routines sequentially", async () => {
    const order: string[] = [];
    const d = deps({
      routines: async () => [
        routine({ id: "a" }),
        routine({ id: "b" }),
        routine({ id: "c", nextRunAt: NOW + 10 })
      ],
      claim: async (id) => ({ kind: "claimed", runId: `run-${id}`, takeover: false }),
      run: async (candidate) => {
        order.push(candidate.id);
        return { status: "succeeded" };
      }
    });

    const outcomes = await tick(d, "device-a");
    expect(order).toEqual(["a", "b"]);
    expect(outcomes).toHaveLength(2);
  });

  it("reports idle rather than an empty list", async () => {
    const d = deps({ routines: async () => [] });
    expect(await tick(d, "device-a")).toEqual([{ kind: "idle" }]);
  });
});

describe("shouldTick", () => {
  it("skips a hidden document and an empty routine list", () => {
    // A background tab has no business asking the server anything.
    expect(shouldTick({ documentHidden: true, hasRoutines: true })).toBe(false);
    expect(shouldTick({ documentHidden: false, hasRoutines: false })).toBe(false);
    expect(shouldTick({ documentHidden: false, hasRoutines: true })).toBe(true);
  });
});

describe("nextDueAt", () => {
  it("is null when nothing is scheduled", () => {
    expect(nextDueAt([])).toBeNull();
    expect(nextDueAt([routine({ enabled: false })])).toBeNull();
    expect(nextDueAt([routine({ nextRunAt: null })])).toBeNull();
  });

  it("returns the earliest time", () => {
    expect(
      nextDueAt([
        routine({ id: "a", nextRunAt: 500 }),
        routine({ id: "b", nextRunAt: 100 }),
        routine({ id: "c", nextRunAt: 900 })
      ])
    ).toBe(100);
  });
});

describe("due-ness is local", () => {
  it("needs no server round trip to decide", () => {
    // The whole point of evaluating `isDue` against local rows: a hundred tenants
    // must not turn into a ping storm.
    expect(isDue({ enabled: true, nextRunAt: NOW - 1 }, NOW)).toBe(true);
  });

  it("checks at a bounded interval", () => {
    expect(TICK_INTERVAL_MS).toBeGreaterThan(0);
    expect(TICK_INTERVAL_MS).toBeLessThanOrEqual(5 * 60_000);
  });
});

describe("a skipped run is not a failure", () => {
  it("does not mark a refused claim as finished", async () => {
    const finish = vi.fn();
    const d = deps({
      claim: async () => ({ kind: "refused", reason: "already_done" }),
      finish
    });

    await tick(d, "device-a");
    expect(finish).not.toHaveBeenCalled();
  });
});

describe("waiting is not failure", () => {
  it("records a routine paused on a person as `waiting`", async () => {
    const d = deps({ run: async () => ({ status: "waiting" }) });
    const outcomes = await tick(d, "device-a");

    expect(outcomes).toEqual([
      { kind: "waiting", routineId: "routine-1", runId: "run-1" }
    ]);
    // Recorded as waiting, not failed. A routine that asked a question has done
    // what it should, and marking it broken would be a lie the Tasks surface shows.
    expect(d.finished).toEqual([{ runId: "run-1", status: "waiting", error: null }]);
  });

  it("still records a genuine failure as failed", async () => {
    const d = deps({ run: async () => ({ status: "failed", error: "no connection" }) });
    const outcomes = await tick(d, "device-a");

    expect(outcomes[0]).toMatchObject({ kind: "failed", error: "no connection" });
    expect(d.finished[0]).toMatchObject({ status: "failed" });
  });

  it("does not swallow a missing error message", async () => {
    const d = deps({ run: async () => ({ status: "failed" }) });
    await tick(d, "device-a");
    // A failure with no reason must still say something rather than record null.
    expect(d.finished[0]?.error).toBe("the routine did not complete");
  });
});
