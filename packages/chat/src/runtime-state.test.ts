import { describe, expect, it } from "vitest";

import type { QueuedMessage } from "@edapex/contracts";

import { createRuntimeState, reduceRuntime } from "./runtime-state";

const message = (id: string, text: string): QueuedMessage => ({
  id,
  text,
  attachmentIds: [],
  attachmentNames: [],
  createdAt: 1
});

describe("workspace runtime projection", () => {
  it("restores history before idle", () => {
    const initial = createRuntimeState();
    const restored = reduceRuntime(initial, {
      type: "history",
      messages: [
        {
          id: "m1",
          role: "assistant",
          createdAt: 1,
          parts: [{ kind: "text", text: "hello" }]
        }
      ]
    });
    const idle = reduceRuntime(restored.state, {
      type: "turn",
      event: { type: "restore_complete" }
    });
    expect(restored.state.turn.state).toBe("restoring");
    expect(restored.state.messages).toHaveLength(1);
    expect(idle.state.turn.state).toBe("idle");
  });

  it("tracks a followed run separately from a local run", () => {
    const initial = createRuntimeState();
    const local = reduceRuntime(initial, {
      type: "turn",
      event: { type: "run_started", local: true }
    });
    const followed = reduceRuntime(initial, {
      type: "turn",
      event: { type: "run_started", local: false }
    });
    expect(local.state.turn.state).toBe("thinking");
    expect(local.state.turn.stoppable).toBe(true);
    expect(followed.state.turn.state).toBe("following");
    expect(followed.state.turn.stoppable).toBe(false);
  });

  it("counts queued messages and drains them on settle", () => {
    const initial = createRuntimeState();
    const parked = reduceRuntime(initial, {
      type: "queue",
      action: { type: "park", message: message("a", "first") }
    });
    const second = reduceRuntime(parked.state, {
      type: "queue",
      action: { type: "park", message: message("b", "second") }
    });
    const drained = reduceRuntime(second.state, {
      type: "queue",
      action: { type: "settle" }
    });
    expect(second.state.turn.queueCount).toBe(2);
    expect(drained.state.turn.queueCount).toBe(0);
    expect(drained.drain?.messages.map((entry) => entry.id)).toEqual(["a", "b"]);
  });

  it("restores the queue after a failed drain", () => {
    const initial = createRuntimeState();
    const parked = reduceRuntime(initial, {
      type: "queue",
      action: { type: "park", message: message("a", "first") }
    });
    const drained = reduceRuntime(parked.state, {
      type: "queue",
      action: { type: "settle" }
    });
    const restored = reduceRuntime(drained.state, {
      type: "queue",
      action: { type: "restore", messages: drained.drain?.messages ?? [] }
    });
    expect(restored.state.turn.queueCount).toBe(1);
    expect(restored.drain).toBeNull();
  });
});
