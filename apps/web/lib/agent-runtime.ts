"use client";

import {
  createRuntimeState,
  reduceQueue,
  reduceRuntime,
  type WorkspaceRuntimeAdapter,
  type WorkspaceRuntimeState
} from "@edapex/chat";
import type {
  ApprovalPart,
  ChatMessage,
  ChatMessagePart,
  QueuedMessage,
  WorkspaceRuntimeView
} from "@edapex/contracts";

import { NativeAgentClient, type NativeAgentSettings } from "@/lib/native-agent";

type Listener = () => void;

const busy = (state: WorkspaceRuntimeState): boolean =>
  state.turn.state === "thinking" ||
  state.turn.state === "following" ||
  state.turn.state === "tool_running" ||
  state.turn.state === "waiting_for_person";

const userMessage = (message: QueuedMessage): ChatMessage => ({
  id: message.id,
  role: "user",
  createdAt: message.createdAt,
  parts: [
    { kind: "text", text: message.text },
    ...message.attachmentNames.map((fileName, index) => ({
      kind: "attachment" as const,
      attachmentId: message.attachmentIds[index] ?? `${message.id}-${index}`,
      fileName,
      contentType: "application/octet-stream"
    }))
  ]
});

/**
 * The workspace runtime on top of the shared agent core.
 *
 * Streaming correctness is the point of this class. Text deltas arrive at token
 * rate, and the previous implementation rebuilt the entire message array and
 * re-parsed Markdown for every single delta. Here the growing text lives in a
 * mutable slot keyed by item id and is flushed to React on an animation frame,
 * so a token burst costs one render instead of one per token.
 */
export class NativeAgentAdapter implements WorkspaceRuntimeAdapter {
  private state: WorkspaceRuntimeState = createRuntimeState();
  private readonly listeners = new Set<Listener>();
  private client: NativeAgentClient | null = null;
  private connected = false;

  /** Streaming text, keyed by item id, not yet flushed into `state`. */
  private readonly streaming = new Map<string, string>();
  private frame: number | null = null;
  private readonly pendingApprovals = new Map<string, (allowed: boolean) => void>();

  get view(): WorkspaceRuntimeView {
    return {
      state: this.state.turn.state,
      connected: this.connected,
      turn: this.state.turn
    };
  }

  get messages(): readonly ChatMessage[] {
    return this.state.messages;
  }

  get queue(): readonly QueuedMessage[] {
    return this.state.queue.queued;
  }

  getSnapshot = (): WorkspaceRuntimeState => this.state;

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  async connect(settings: NativeAgentSettings): Promise<void> {
    const client = new NativeAgentClient(settings, {
      onEvent: (event) => this.onAgentEvent(event),
      onTool: (call) => this.runTool(call),
      onApproval: (request) =>
        new Promise<boolean>((resolve) => {
          this.pendingApprovals.set(request.approvalRequestId, resolve);
          this.showApproval(request);
        })
    });

    await client.connect();
    this.client = client;
    this.connected = true;
    this.state = { ...this.state, turn: { ...this.state.turn, state: "idle" } };
    this.emit();
  }

  restoreComplete(): void {
    if (this.connected) return;
    this.state = { ...this.state, turn: { ...this.state.turn, state: "idle" } };
    this.emit();
  }

  restoreUnavailable(): void {
    this.state = { ...this.state, turn: { ...this.state.turn, state: "history_unavailable" } };
    this.emit();
  }

  send(text: string, attachmentNames: readonly string[]): void {
    const trimmed = text.trim();
    if (!this.connected || trimmed.length === 0) return;

    const message: QueuedMessage = {
      id: crypto.randomUUID(),
      text: trimmed,
      attachmentIds: attachmentNames.map(() => crypto.randomUUID()),
      attachmentNames,
      createdAt: Date.now()
    };

    const result = reduceRuntime(this.state, {
      type: "queue",
      action: { type: "submit", message, busy: busy(this.state) }
    });
    this.state = result.state;
    if (result.drain !== null) {
      void this.startTurn(result.drain.message);
    }
    this.emit();
  }

  removeQueued(id: string): void {
    this.state = reduceRuntime(this.state, {
      type: "queue",
      action: { type: "remove", id }
    }).state;
    this.emit();
  }

  stop(): void {
    if (!this.view.turn.stoppable) return;
    void this.client?.stop();
    this.flushStreaming();
    this.state = { ...this.state, turn: { ...this.state.turn, state: "stopped", stoppable: false } };
    this.emit();
  }

  decideApproval(
    messageId: string,
    approvalRequestId: string,
    decision: "allowed" | "declined"
  ): void {
    const resolve = this.pendingApprovals.get(approvalRequestId);
    if (resolve === undefined) return;
    resolve(decision === "allowed");
    this.pendingApprovals.delete(approvalRequestId);

    this.state = {
      ...this.state,
      messages: this.state.messages.map((message) =>
        message.id === messageId
          ? {
              ...message,
              parts: message.parts.map((part) =>
                part.kind === "approval" && part.approvalRequestId === approvalRequestId
                  ? { ...part, status: decision }
                  : part
              )
            }
          : message
      )
    };
    this.emit();
  }

  private async startTurn(message: QueuedMessage): Promise<void> {
    if (this.client === null) return;
    this.state = {
      ...this.state,
      messages: [...this.state.messages, userMessage(message)],
      turn: { ...this.state.turn, state: "thinking", stoppable: true }
    };
    this.emit();
    try {
      await this.client.startTurn(message.text);
    } catch (cause) {
      this.state = { ...this.state, turn: { ...this.state.turn, state: "error", stoppable: false } };
      this.emit();
      throw cause;
    }
  }

  private onAgentEvent(event: { readonly type: string; [key: string]: unknown }): void {
    switch (event.type) {
      case "turn_started":
        this.setTurn("thinking", true);
        break;
      case "message_delta": {
        const itemId = String(event.itemId);
        const delta = String(event.delta);
        this.appendStreaming(itemId, delta);
        break;
      }
      case "tool_started":
        this.flushStreaming();
        this.setTurn("tool_running", true);
        break;
      case "tool_completed":
        this.setTurn("following", true);
        break;
      case "approval_requested":
        this.setTurn("waiting_for_person", true);
        break;
      case "approval_resolved":
        this.setTurn("following", true);
        break;
      case "turn_completed": {
        this.flushStreaming();
        const status = String(event.status);
        this.finishTurn(
          status === "error" ? "error" : status === "stopped" ? "stopped" : "completed"
        );
        break;
      }
      case "interrupted":
        this.flushStreaming();
        this.finishTurn("stopped");
        break;
      case "error": {
        this.flushStreaming();
        this.finishTurn("error");
        break;
      }
      default:
        return;
    }
    this.scheduleFlush();
  }

  /**
   * Accumulate a delta without touching React state.
   *
   * This is the hot path: it runs once per token and must stay allocation-light.
   */
  private appendStreaming(itemId: string, delta: string): void {
    const current = this.streaming.get(itemId) ?? "";
    this.streaming.set(itemId, current + delta);
  }

  /** Coalesce every delta since the last frame into a single state update. */
  private scheduleFlush(): void {
    if (this.frame !== null) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      this.flushStreaming();
      this.emit();
    });
  }

  /**
   * Write accumulated text into the message list.
   *
   * Called on a frame boundary and whenever the turn changes state, so the last
   * tokens of a turn are never stranded in the buffer.
   */
  private flushStreaming(): void {
    if (this.streaming.size === 0) return;

    const pending = new Map(this.streaming);
    this.streaming.clear();

    const existing = new Map(this.state.messages.map((message) => [message.id, message]));
    let changed = false;

    for (const [itemId, text] of pending) {
      const message = existing.get(itemId);
      if (message === undefined) {
        existing.set(itemId, {
          id: itemId,
          role: "assistant",
          createdAt: Date.now(),
          parts: [{ kind: "text", text }]
        });
        changed = true;
        continue;
      }
      existing.set(itemId, {
        ...message,
        parts: message.parts.map((part) =>
          part.kind === "text" ? { ...part, text: part.text + text } : part
        )
      });
      changed = true;
    }

    if (!changed) return;
    this.state = { ...this.state, messages: [...existing.values()] };
  }

  private showApproval(request: {
    readonly approvalRequestId: string;
    readonly title: string;
    readonly description: string;
    readonly risk: "read" | "write" | "destructive";
  }): void {
    const approval: ApprovalPart = {
      kind: "approval",
      approvalRequestId: request.approvalRequestId,
      status: "pending",
      title: request.title,
      description: request.description,
      risk: request.risk
    };
    this.state = {
      ...this.state,
      messages: [
        ...this.state.messages,
        {
          id: `approval-${request.approvalRequestId}`,
          role: "assistant",
          createdAt: Date.now(),
          parts: [approval]
        }
      ],
      turn: { ...this.state.turn, state: "waiting_for_person", stoppable: true }
    };
    this.emit();
  }

  private async runTool(call: {
    readonly callId: string;
    readonly tool: string;
    readonly arguments: unknown;
  }): Promise<{ success: boolean; text: string }> {
    const result = await this.client?.executeTool(call);
    return result ?? { success: false, text: "The workspace runtime is not connected." };
  }

  private setTurn(state: WorkspaceRuntimeState["turn"]["state"], stoppable: boolean): void {
    this.state = { ...this.state, turn: { ...this.state.turn, state, stoppable } };
  }

  private finishTurn(state: WorkspaceRuntimeState["turn"]["state"]): void {
    this.state = { ...this.state, turn: { ...this.state.turn, state, stoppable: false } };
    this.drainNext();
  }

  private drainNext(): void {
    const next = reduceQueue(this.state.queue, { type: "settle" });
    this.state = {
      ...this.state,
      queue: next.state,
      turn: { ...this.state.turn, queueCount: next.state.queued.length }
    };
    if (next.drain !== null) {
      void this.startTurn(next.drain.message);
    }
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

export type { ChatMessagePart };
