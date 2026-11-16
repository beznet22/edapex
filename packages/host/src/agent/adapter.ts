"use client";

import {
  createRuntimeState,
  reduceQueue,
  reduceRuntime,
  type WorkspaceRuntimeAdapter,
  type WorkspaceRuntimeState
} from "@edapex/chat";
import type {
  ChatMessage,
  ChatMessagePart,
  QueuedMessage,
  WorkspaceRuntimeView
} from "@edapex/contracts";

import { StreamingBuffer } from "./streaming-buffer";
import { waitForSettlement } from "./turn-settlement";
import {
  turnTransition,
  withApprovalDecision,
  withPendingApproval,
  type AgentApproval,
  type AgentEvent
} from "./turn-events";
import {
  startTransportTurn,
  type AgentApprovalRequest,
  type AgentConnectSettings,
  type AgentToolCall,
  type AgentTransport,
  type ConnectedTransport
} from "./transport";

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
  /**
   * Not private: `waitForSettlement` reads it, and that module exists so the settlement
   * rules are testable without constructing a transport. Widening the field is the price
   * of that, and it is cheaper than a getter that exists only for one caller.
   */
  state: WorkspaceRuntimeState = createRuntimeState();
  private readonly listeners = new Set<Listener>();
  /**
   * Who carries the turn. Injected, not discovered (`docs/system.md` →
   * "transport (host-injected)"). This class used to import the web app's transport
   * selection, which is the one thing that stopped a second host reusing it.
   */
  private readonly host: AgentTransport;
  private connection: ConnectedTransport | null = null;
  private connected = false;

  private readonly streaming = new StreamingBuffer();
  private frame: number | null = null;
  private readonly pendingApprovals = new Map<string, (allowed: boolean) => void>();

  constructor(host: AgentTransport) {
    this.host = host;
  }

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

  async connect(settings: AgentConnectSettings): Promise<void> {
    const transport = await this.host.connect(settings, {
      onEvent: (event) => this.onAgentEvent(event),
      onTool: (call) => this.runTool(call),
      onApproval: (request) =>
        new Promise<boolean>((resolve) => {
          this.pendingApprovals.set(request.approvalRequestId, resolve);
          this.showApproval(request);
        })
    });

    this.connection = transport;
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

  /**
   * Sends a message and resolves when the turn settles.
   *
   * `send` is fire-and-forget, which is right for a composer but useless to a scheduler:
   * it needs to know whether the work finished, is waiting on a person, or failed.
   */
  async sendAndWait(
    text: string,
    timeoutMs = 5 * 60_000
  ): Promise<{ readonly status: "succeeded" | "waiting" | "failed"; readonly error?: string }> {
    if (!this.connected) return { status: "failed", error: "the agent runtime is not connected" };
    return await waitForSettlement(
      { state: this.state, subscribe: this.subscribe, send: (value) => this.send(value, []) },
      text,
      timeoutMs
    );
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
    this.connection?.disconnect();
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

    this.state = withApprovalDecision(this.state, messageId, approvalRequestId, decision);
    this.emit();
  }

  private async startTurn(message: QueuedMessage): Promise<void> {
    if (this.connection === null) return;
    this.state = {
      ...this.state,
      messages: [...this.state.messages, userMessage(message)],
      turn: { ...this.state.turn, state: "thinking", stoppable: true }
    };
    this.emit();
    try {
      await this.host.startTurn(this.connection, message.text);
    } catch (cause) {
      this.state = { ...this.state, turn: { ...this.state.turn, state: "error", stoppable: false } };
      this.emit();
      throw cause;
    }
  }

  private onAgentEvent(event: AgentEvent): void {
    if (event.type === "message_delta") {
      this.streaming.append(String(event.itemId), String(event.delta));
      this.scheduleFlush();
      return;
    }

    const next = turnTransition(event);
    if (next === null) return;

    if (next.flushFirst) this.flushStreaming();

    if (next.state === "completed" || next.state === "stopped" || next.state === "error") {
      // Settling a turn drains the queue, which `setTurn` must not do: a queue that
      // advances while the turn is still running would start the next message early.
      this.finishTurn(next.state);
    } else {
      this.setTurn(next.state, next.stoppable);
    }
    this.scheduleFlush();
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
    const messages = this.streaming.flush(this.state.messages, Date.now());
    if (messages === this.state.messages) return;
    this.state = { ...this.state, messages };
  }

  private showApproval(request: AgentApproval): void {
    this.state = withPendingApproval(this.state, request);
    this.emit();
  }

  private async runTool(call: {
    readonly callId: string;
    readonly tool: string;
    readonly arguments: unknown;
  }): Promise<{ success: boolean; text: string }> {
    const result = await this.connection?.client?.executeTool(call);
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
