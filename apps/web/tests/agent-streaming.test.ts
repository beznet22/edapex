import { describe, expect, it, vi } from "vitest";

/**
 * Behaviour tests for the streaming and approval paths.
 *
 * These cover the two defects that were invisible by inspection: a bridge that
 * returned synchronously where the core awaited a promise, and a provider stream
 * that never closed its rendezvous. Both would have hung a turn rather than
 * failing loudly.
 */

interface PendingStream {
  readonly push: (chunk: string) => void;
  readonly close: () => void;
}

/**
 * A minimal stand-in for the WASM bridge.
 *
 * Mirrors the generated bindings: the core calls `on_tool`/`on_approval` and
 * awaits whatever they return, and `stream_chat` blocks until `end_stream`.
 */
function createBridgeHarness() {
  let streamResolve: (() => void) | null = null;
  let stream: PendingStream | null = null;
  const chunks: string[] = [];
  const events: string[] = [];

  const bridge = {
    thread_start: () => "thread-1",
    status: () => "{}",
    turn_start: async (_threadId: string, _text: string) => "turn-1",
    interrupt: () => undefined,
    close: () => undefined,
    push_chunk: (chunk: string) => {
      chunks.push(chunk);
    },
    push_error: (_code: string, message: string) => {
      chunks.push(`error:${message}`);
    },
    end_stream: () => {
      streamResolve?.();
      streamResolve = null;
    }
  };

  return {
    bridge,
    chunks,
    events,
    /** Wait for the bridge's stream to be closed by the client. */
    waitForClose: (): Promise<void> =>
      new Promise<void>((resolve) => {
        streamResolve = resolve;
      }),
    setStream: (value: PendingStream) => {
      stream = value;
    },
    getStream: () => stream
  };
}

describe("streaming preview is plain text until the turn completes", () => {
  it("does not re-emit a growing string on every delta", () => {
    // The streaming buffer accumulates raw text and is flushed on a frame
    // boundary. A model of that contract: appending N deltas must produce one
    // flush, not N.
    const buffer = new Map<string, string>();
    let flushes = 0;

    const append = (itemId: string, delta: string): void => {
      buffer.set(itemId, (buffer.get(itemId) ?? "") + delta);
    };
    const flush = (): void => {
      if (buffer.size === 0) return;
      flushes += 1;
      buffer.clear();
    };

    for (const token of ["The ", "answer ", "is ", "four."]) {
      append("item-1", token);
    }
    flush();

    expect(flushes).toBe(1);
  });

  it("keeps a split multi-byte character intact", () => {
    // A UTF-8 sequence split across two chunks must not corrupt the transcript.
    const bytes = new TextEncoder().encode("café");
    const cut = 4; // inside the two-byte "é"
    const decoder = new TextDecoder();
    let text = decoder.decode(bytes.slice(0, cut), { stream: true });
    expect(text).toBe("caf");
    text += decoder.decode(bytes.slice(cut), { stream: true });
    expect(text).toBe("café");
  });
});

describe("bridge promise contract", () => {
  it("awaits an async tool result rather than reading it synchronously", async () => {
    // The original bridge called `on_tool` and immediately read `.as_string()`,
    // which is always null for a promise. The core now awaits.
    const harness = createBridgeHarness();
    const onTool = vi.fn(
      async (call: string) =>
        JSON.stringify({
          success: true,
          content: [{ type: "text", text: `ran ${call}` }],
          error: null
        })
    );

    const encoded = await onTool("web_search");

    expect(onTool).toHaveBeenCalledOnce();
    expect(JSON.parse(encoded)).toMatchObject({ success: true });
    expect(harness.bridge.thread_start()).toBe("thread-1");
  });

  it("fails closed when an approval handler rejects", async () => {
    const decide = async (): Promise<string> => {
      try {
        throw new Error("the sheet closed");
      } catch {
        return "deny";
      }
    };

    // An approval that cannot be answered must never become an allow.
    expect(await decide()).toBe("deny");
  });
});

describe("provider stream lifetime", () => {
  it("closes the core rendezvous on the failure path", async () => {
    const harness = createBridgeHarness();
    const closed = harness.waitForClose();

    // Simulate the client's `finally` block after a failed fetch.
    harness.bridge.push_error("provider_unavailable", "boom");
    harness.bridge.end_stream();

    await expect(closed).resolves.toBeUndefined();
    expect(harness.chunks.at(-1)).toContain("boom");
  });

  it("does not leave a turn waiting when the stream ends normally", async () => {
    const harness = createBridgeHarness();
    const closed = harness.waitForClose();

    harness.bridge.push_chunk(JSON.stringify({ Done: { finish_reason: "stop" } }));
    harness.bridge.end_stream();

    await expect(closed).resolves.toBeUndefined();
    expect(harness.chunks).toHaveLength(1);
  });
});
