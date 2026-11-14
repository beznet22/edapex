import { describe, expect, it } from "vitest";

import type { QueuedMessage } from "@edapex/contracts";

import { emptyQueue, MAX_QUEUED_MESSAGES, reduceQueue } from "./queue";

const message = (id: string, text: string): QueuedMessage => ({
  id,
  text,
  attachmentIds: [],
  attachmentNames: [],
  createdAt: 1
});

describe("chat queue", () => {
  it("parks a message while the turn is busy", () => {
    const result = reduceQueue(emptyQueue(), {
      type: "submit",
      message: message("a", "first"),
      busy: true
    });
    expect(result.drain).toBeNull();
    expect(result.state.queued.map((entry) => entry.id)).toEqual(["a"]);
  });

  it("sends immediately when the turn is idle", () => {
    const result = reduceQueue(emptyQueue(), {
      type: "submit",
      message: message("a", "first"),
      busy: false
    });
    expect(result.state.queued).toEqual([]);
    expect(result.drain?.message.id).toBe("a");
  });

  it("drains one queued message as a distinct turn in creation order", () => {
    const first = reduceQueue(emptyQueue(), {
      type: "park",
      message: message("a", "first")
    });
    const second = reduceQueue(first.state, {
      type: "park",
      message: message("b", "second")
    });
    const drained = reduceQueue(second.state, { type: "settle" });
    expect(drained.drain?.message.id).toBe("a");
    expect(drained.state.queued.map((entry) => entry.id)).toEqual(["b"]);

    const next = reduceQueue(drained.state, { type: "settle" });
    expect(next.drain?.message.id).toBe("b");
    expect(next.state.queued).toEqual([]);
  });

  it("does not drain twice after settling", () => {
    const parked = reduceQueue(emptyQueue(), {
      type: "park",
      message: message("a", "first")
    });
    const drained = reduceQueue(parked.state, { type: "settle" });
    const again = reduceQueue(drained.state, { type: "settle" });
    expect(drained.drain).not.toBeNull();
    expect(again.drain).toBeNull();
  });

  it("restores failed messages ahead of anything parked since", () => {
    const current = reduceQueue(emptyQueue(), {
      type: "park",
      message: message("new", "newer")
    });
    const restored = reduceQueue(current.state, {
      type: "restore",
      messages: [message("old", "older")]
    });
    expect(restored.state.queued.map((entry) => entry.id)).toEqual(["old", "new"]);
  });

  it("removes a queued message without draining", () => {
    const parked = reduceQueue(emptyQueue(), {
      type: "park",
      message: message("a", "first")
    });
    const result = reduceQueue(parked.state, { type: "remove", id: "a" });
    expect(result.state.queued).toEqual([]);
    expect(result.drain).toBeNull();
  });

  it("bounds the queue", () => {
    let state = emptyQueue();
    for (let index = 0; index < MAX_QUEUED_MESSAGES + 3; index += 1) {
      state = reduceQueue(state, {
        type: "park",
        message: message(String(index), `message ${index}`)
      }).state;
    }
    expect(state.queued).toHaveLength(MAX_QUEUED_MESSAGES);
  });

  it("drains a queued message with its own attachments", () => {
    const parked = reduceQueue(emptyQueue(), {
      type: "park",
      message: {
        ...message("a", "see attached"),
        attachmentIds: ["file-1"]
      }
    });
    const result = reduceQueue(parked.state, { type: "settle" });
    expect(result.drain?.message.attachmentIds).toEqual(["file-1"]);
  });
});
