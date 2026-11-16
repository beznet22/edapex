import { describe, it, expect, beforeEach } from "vitest";
import { getLogBuffer, resetLogBufferForTests, type LogEntry } from "$lib/server/telegram/log-buffer";

function entry(message: string, level: LogEntry["level"] = "info"): LogEntry {
  return { ts: Date.now(), level, source: "test", message };
}

describe("log-buffer", () => {
  beforeEach(() => {
    resetLogBufferForTests();
  });

  it("push + snapshot returns the same entry", () => {
    const buf = getLogBuffer();
    const e = entry("hello");
    buf.push(e);
    const snap = buf.snapshot();
    expect(snap).toHaveLength(1);
    expect(snap[0]?.message).toBe("hello");
  });

  it("caps the buffer at 200 entries; oldest are dropped", () => {
    const buf = getLogBuffer();
    for (let i = 0; i < 250; i++) {
      buf.push(entry(`msg-${i}`));
    }
    expect(buf.size()).toBe(200);
    const snap = buf.snapshot();
    // The first 50 were dropped; the first remaining is msg-50.
    expect(snap[0]?.message).toBe("msg-50");
    expect(snap[snap.length - 1]?.message).toBe("msg-249");
  });

  it("clear empties the buffer", () => {
    const buf = getLogBuffer();
    buf.push(entry("one"));
    buf.push(entry("two"));
    expect(buf.size()).toBe(2);
    buf.clear();
    expect(buf.size()).toBe(0);
    expect(buf.snapshot()).toEqual([]);
  });

  it("snapshot is a copy, not a live reference", () => {
    const buf = getLogBuffer();
    buf.push(entry("first"));
    const snap = buf.snapshot();
    buf.push(entry("second"));
    expect(snap).toHaveLength(1);
    expect(buf.size()).toBe(2);
  });
});
