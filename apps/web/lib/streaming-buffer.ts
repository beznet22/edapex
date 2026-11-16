import type { ChatMessage } from "@edapex/contracts";

/**
 * Streaming text, coalesced into message state.
 *
 * This is the hot path of the whole runtime: `append` runs once per token, and
 * `flush` is the only thing that touches the message array. Keeping the buffer and the
 * reducer together is what makes the cost obvious — a token burst is one render, not one
 * per token — and it is why this is not part of the adapter class: the adapter would
 * grow a second reason to change.
 *
 * The buffer is mutable and deliberately not React state. Text lives in a slot keyed by
 * item id until a frame boundary writes it into the immutable message list.
 */
export class StreamingBuffer {
  private readonly pending = new Map<string, string>();

  /** Accumulate a delta. Must stay allocation-light — it runs per token. */
  append(itemId: string, delta: string): void {
    this.pending.set(itemId, (this.pending.get(itemId) ?? "") + delta);
  }

  get size(): number {
    return this.pending.size;
  }

  /**
   * Write everything buffered into the message list.
   *
   * Returns the same array reference when nothing changed, so the caller can skip a
   * render without comparing messages itself.
   */
  flush(messages: readonly ChatMessage[], now: number): readonly ChatMessage[] {
    if (this.pending.size === 0) return messages;

    const pending = new Map(this.pending);
    this.pending.clear();

    const existing = new Map(messages.map((message) => [message.id, message]));

    for (const [itemId, text] of pending) {
      const message = existing.get(itemId);
      if (message === undefined) {
        existing.set(itemId, {
          id: itemId,
          role: "assistant",
          createdAt: now,
          parts: [{ kind: "text", text }]
        });
        continue;
      }
      existing.set(itemId, {
        ...message,
        parts: message.parts.map((part) =>
          part.kind === "text" ? { ...part, text: part.text + text } : part
        )
      });
    }

    return [...existing.values()];
  }
}
