import { describe, expect, it } from "vitest";

import {
  compareTasks,
  deriveTaskState,
  needsInputCount,
  needsPerson,
  NO_SIGNALS,
  retryView,
  TASK_STATE_PRECEDENCE,
  type TaskSignals
} from "../src/tasks";
import {
  decideClaim,
  isPlausibleLocalDate,
  briefKey,
  BRIEF_LEASE_SECONDS,
  shouldSendGreeting,
  greetingVariant,
  replyChips,
  setupProgress,
  MAX_REPLY_CHIPS,
  type BriefClaim,
  type ReplyChip
} from "../src/notifications";
import {
  isClaimFinal,
  isDue,
  isLeaseLive,
  isStaleRun,
  parseSchedule,
  LEASE_SECONDS,
  ROUTINE_UNAVAILABLE_NOTICE
} from "../src/routines";

/**
 * The pure decisions behind proactive work.
 *
 * These are the functions where a bug loses a day's work or shows the wrong state,
 * so they are tested behaviourally rather than by asserting their shape.
 */

describe("deriveTaskState", () => {
  const signals = (overrides: Partial<TaskSignals>): TaskSignals => ({ ...NO_SIGNALS, ...overrides });

  it("prefers a waiting person over everything", () => {
    // The person is what the task is waiting for, so it must never be hidden
    // behind a spinner.
    expect(deriveTaskState(signals({ openQuestion: true, running: true }))).toBe("needs_you");
  });

  it("reports blocked when an approval is pending", () => {
    expect(deriveTaskState(signals({ blockedOnApproval: true, running: true }))).toBe("blocked");
  });

  it("reports a failure before a run", () => {
    expect(deriveTaskState(signals({ failedAfterRetries: true, running: true }))).toBe("didnt_work");
  });

  it("reports running", () => {
    expect(deriveTaskState(signals({ running: true }))).toBe("running");
  });

  it("reports done only when resolved", () => {
    expect(deriveTaskState(signals({ resolved: true }))).toBe("done");
  });

  it("treats silence as not completed, not success", () => {
    // An unfinished task with no signals is not done. Assuming success from
    // absence is how a silent failure reads as a success.
    expect(deriveTaskState(NO_SIGNALS)).toBe("not_completed");
  });

  it("resolved beats a finished-unresolved run", () => {
    expect(deriveTaskState(signals({ resolved: true, finishedUnresolved: true }))).toBe("done");
  });

  it("declares precedence in the same order it applies", () => {
    expect(TASK_STATE_PRECEDENCE[0]).toBe("needs_you");
    expect(TASK_STATE_PRECEDENCE.at(-1)).toBe("done");
  });
});

describe("needsPerson", () => {
  it("counts only the states a person can act on", () => {
    expect(needsPerson("needs_you")).toBe(true);
    expect(needsPerson("blocked")).toBe(true);
    expect(needsPerson("running")).toBe(false);
    expect(needsPerson("didnt_work")).toBe(false);
  });

  it("derives the badge from the same rule as the list", () => {
    expect(needsInputCount(["needs_you", "blocked", "done", "running"])).toBe(2);
  });
});

describe("triage", () => {
  it("orders what is stopping work now ahead of what is old", () => {
    const items = [
      { state: "done" as const, createdAt: 1 },
      { state: "needs_you" as const, createdAt: 900 },
      { state: "blocked" as const, createdAt: 800 },
      { state: "running" as const, createdAt: 2 }
    ];
    expect([...items].sort(compareTasks).map((item) => item.state)).toEqual([
      "needs_you",
      "blocked",
      "running",
      "done"
    ]);
  });

  it("breaks ties by age, oldest first", () => {
    const items = [
      { state: "needs_you" as const, createdAt: 500 },
      { state: "needs_you" as const, createdAt: 100 }
    ];
    expect([...items].sort(compareTasks).map((item) => item.createdAt)).toEqual([100, 500]);
  });
});

describe("retryView", () => {
  it("is silent before any attempt", () => {
    expect(retryView({ attempts: 0, maxAttempts: 3, lastError: null })).toBeNull();
  });

  it("shows the attempt rather than hiding it", () => {
    expect(retryView({ attempts: 2, maxAttempts: 3, lastError: "connector timed out" })).toEqual({
      attempt: 2,
      of: 3,
      reason: "connector timed out"
    });
  });

  it("never reports more attempts than the cap", () => {
    expect(retryView({ attempts: 9, maxAttempts: 3, lastError: null })?.attempt).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// The dedupe that could lose a day
// ---------------------------------------------------------------------------

describe("brief claim", () => {
  const claim = (overrides: Partial<BriefClaim> = {}): BriefClaim => ({
    key: "brief:ws-1:user-1:2026-11-14",
    claimedByDevice: "device-a",
    claimedAt: 1_000,
    leaseUntil: 1_000 + BRIEF_LEASE_SECONDS,
    completedAt: null,
    ...overrides
  });

  it("lets the first device claim", () => {
    expect(decideClaim(null, 1_000)).toEqual({ kind: "claimed", takeover: false });
  });

  it("refuses a second device while the lease is live", () => {
    expect(decideClaim(claim(), 1_100)).toEqual({ kind: "held_by_other" });
  });

  it("is permanent once completed", () => {
    const completed = claim({ completedAt: 1_200 });
    // Even long after, and even though the lease has expired.
    expect(decideClaim(completed, 999_999)).toEqual({ kind: "already_complete" });
  });

  it("allows takeover when the claimant died", () => {
    // The failure this exists for: a device claimed and then crashed. Without
    // takeover the day stays claimed and no device can ever produce the brief.
    expect(decideClaim(claim({ leaseUntil: 1_100 }), 1_200)).toEqual({
      kind: "claimed",
      takeover: true
    });
  });

  it("distinguishes held from done, because one resolves and one never will", () => {
    const held = decideClaim(claim(), 1_100);
    const done = decideClaim(claim({ completedAt: 1_200 }), 1_100);
    expect(held.kind).not.toBe(done.kind);
  });

  it("makes only completion final", () => {
    expect(isClaimFinal(claim())).toBe(false);
    expect(isClaimFinal(claim({ completedAt: 1_200 }))).toBe(true);
    expect(isLeaseLive({ leaseUntil: 2_000, completedAt: null }, 1_500)).toBe(true);
    expect(isLeaseLive({ leaseUntil: 1_400, completedAt: null }, 1_500)).toBe(false);
    // A completed claim is not "live" — it is finished, which is stronger.
    expect(isLeaseLive({ leaseUntil: 2_000, completedAt: 1_200 }, 1_500)).toBe(false);
  });

  it("keys a brief per person per local day", () => {
    expect(
      briefKey({ workspaceId: "ws-1", userId: "u-1", localDate: "2026-11-14" })
    ).toBe("brief:ws-1:u-1:2026-11-14");
  });
});

describe("local date plausibility", () => {
  const now = Date.UTC(2026, 10, 14, 12, 0, 0);

  it("accepts today", () => {
    expect(isPlausibleLocalDate("2026-11-14", now)).toBe(true);
  });

  it("accepts the neighbouring day for timezones", () => {
    expect(isPlausibleLocalDate("2026-11-13", now)).toBe(true);
    expect(isPlausibleLocalDate("2026-11-15", now)).toBe(true);
  });

  it("rejects a claim for a distant day", () => {
    // Claiming tomorrow's key would yield a second brief today.
    expect(isPlausibleLocalDate("2026-11-20", now)).toBe(false);
    expect(isPlausibleLocalDate("2026-11-01", now)).toBe(false);
  });

  it("rejects a malformed date", () => {
    expect(isPlausibleLocalDate("14-11-2026", now)).toBe(false);
    expect(isPlausibleLocalDate("not a date", now)).toBe(false);
  });
});

describe("first-day greeting", () => {
  const base = {
    greetingSentBefore: false,
    composerHasContent: false,
    hasSentMessage: false,
    threadExists: false
  };

  it("sends on a genuinely fresh account", () => {
    expect(shouldSendGreeting(base)).toBe(true);
  });

  it("loses to a person who has started typing", () => {
    expect(shouldSendGreeting({ ...base, composerHasContent: true })).toBe(false);
  });

  it("loses to a person who already sent", () => {
    expect(shouldSendGreeting({ ...base, hasSentMessage: true })).toBe(false);
  });

  it("does not repeat", () => {
    expect(shouldSendGreeting({ ...base, greetingSentBefore: true })).toBe(false);
  });

  it("does not appear above an existing thread", () => {
    expect(shouldSendGreeting({ ...base, threadExists: true })).toBe(false);
  });

  it("chooses its variant from connector state", () => {
    expect(greetingVariant(true)).toBe("mail_connected");
    expect(greetingVariant(false)).toBe("no_mail");
  });
});

describe("reply chips", () => {
  const chip = (index: number): ReplyChip => ({
    id: `c-${index}`,
    label: `Chip ${index}`,
    text: `text ${index}`
  });

  it("caps at four", () => {
    expect(replyChips([0, 1, 2, 3, 4, 5].map(chip))).toHaveLength(MAX_REPLY_CHIPS);
  });

  it("preserves source order so emphasis is decided by the caller", () => {
    expect(replyChips([2, 0, 1].map(chip)).map((entry) => entry.id)).toEqual(["c-2", "c-0", "c-1"]);
  });

  it("carries composer text rather than an action", () => {
    // A chip is a shortcut for typing; it must not encode a send.
    const [first] = replyChips([chip(0)]);
    expect(first).toHaveProperty("text");
    expect(first).not.toHaveProperty("send");
    expect(first).not.toHaveProperty("action");
  });
});

describe("setup checklist", () => {
  it("derives every step from real state", () => {
    const progress = setupProgress({
      resolvedAnyTask: true,
      hasConnectedAccount: false,
      hasRoutine: true,
      hasRunRoutine: false
    });
    expect(progress.doneCount).toBe(2);
    expect(progress.complete).toBe(false);
    expect(progress.steps.map((step) => step.done)).toEqual([true, false, true, false]);
  });

  it("disappears once complete rather than showing a 100% bar", () => {
    const progress = setupProgress({
      resolvedAnyTask: true,
      hasConnectedAccount: true,
      hasRoutine: true,
      hasRunRoutine: true
    });
    expect(progress.complete).toBe(true);
  });
});

describe("routines", () => {
  it("parses a five-field schedule", () => {
    expect(parseSchedule("0 8 * * 1-5")).toHaveLength(5);
  });

  it("refuses a shape it does not understand rather than guessing", () => {
    // A routine that silently fires on the wrong day is worse than one that
    // refuses to parse.
    expect(parseSchedule("0 8 * *")).toBeNull();
    expect(parseSchedule("every morning")).toBeNull();
    expect(parseSchedule("0 8 * * MON")).toBeNull();
  });

  it("is due only when enabled and past its time", () => {
    expect(isDue({ enabled: true, nextRunAt: 900 }, 1_000)).toBe(true);
    expect(isDue({ enabled: false, nextRunAt: 900 }, 1_000)).toBe(false);
    expect(isDue({ enabled: true, nextRunAt: 1_100 }, 1_000)).toBe(false);
    expect(isDue({ enabled: true, nextRunAt: null }, 1_000)).toBe(false);
  });

  it("treats a run whose lease expired as re-claimable", () => {
    expect(isStaleRun({ status: "running", startedAt: 1_000 - LEASE_SECONDS - 1 }, 1_000)).toBe(true);
    expect(isStaleRun({ status: "running", startedAt: 1_000 }, 1_000)).toBe(false);
    expect(isStaleRun({ status: "succeeded", startedAt: 1 }, 1_000)).toBe(false);
  });

  it("states the availability trade once so it is not paraphrased per surface", () => {
    expect(ROUTINE_UNAVAILABLE_NOTICE).toContain("while EdApex is open");
    expect(ROUTINE_UNAVAILABLE_NOTICE).toContain("not caught up");
  });
});
