import { describe, expect, it } from "vitest";

import { applyTurnEvent, canStop, initialTurn } from "./turn";

describe("workspace turn state machine", () => {
  it("restores history before becoming idle", () => {
    expect(initialTurn().state).toBe("restoring");
    const idle = applyTurnEvent(initialTurn(), { type: "restore_complete" });
    expect(idle.state).toBe("idle");
    expect(canStop(idle)).toBe(false);
  });

  it("shows history unavailable distinctly", () => {
    const unavailable = applyTurnEvent(initialTurn(), { type: "restore_unavailable" });
    expect(unavailable.state).toBe("history_unavailable");
  });

  it("distinguishes a local run from a followed run", () => {
    const local = applyTurnEvent(initialTurn(), { type: "run_started", local: true });
    expect(local.state).toBe("thinking");
    expect(canStop(local)).toBe(true);

    const followed = applyTurnEvent(initialTurn(), { type: "run_started", local: false });
    expect(followed.state).toBe("following");
    expect(canStop(followed)).toBe(false);
  });

  it("moves through tool and approval states", () => {
    const thinking = applyTurnEvent(initialTurn(), { type: "run_started", local: true });
    const tool = applyTurnEvent(thinking, { type: "tool_started" });
    const waiting = applyTurnEvent(tool, { type: "approval_requested" });
    const decided = applyTurnEvent(waiting, { type: "approval_decided" });
    const complete = applyTurnEvent(decided, { type: "run_completed" });

    expect(tool.state).toBe("tool_running");
    expect(waiting.state).toBe("waiting_for_person");
    expect(decided.state).toBe("thinking");
    expect(complete.state).toBe("completed");
  });

  it("keeps stopped and error distinct", () => {
    const thinking = applyTurnEvent(initialTurn(), { type: "run_started", local: true });
    expect(applyTurnEvent(thinking, { type: "run_stopped" }).state).toBe("stopped");
    expect(applyTurnEvent(thinking, { type: "run_failed" }).state).toBe("error");
  });

  it("updates queue counts without changing turn state", () => {
    const idle = applyTurnEvent(initialTurn(), { type: "restore_complete" });
    const changed = applyTurnEvent(idle, {
      type: "queue_changed",
      counts: { queueCount: 2, serverQueueCount: 1 }
    });
    expect(changed.state).toBe("idle");
    expect(changed.queueCount).toBe(2);
    expect(changed.serverQueueCount).toBe(1);
  });

  it("records the last seen timestamp", () => {
    const seen = applyTurnEvent(initialTurn(), { type: "seen", at: 1234 });
    expect(seen.lastSeenAt).toBe(1234);
  });
});
