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

type Listener = () => void;

const isBusy = (state: WorkspaceRuntimeState): boolean =>
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
      attachmentId: message.attachmentIds[index] ?? `${message.id}-attachment-${index}`,
      fileName,
      contentType: "application/octet-stream"
    }))
  ],
  queueState: "sending"
});

/**
 * The local shell adapter. It owns the same queue/turn projection the future
 * xcodex adapter will feed. It starts disconnected because no local runtime is
 * shipped in 10B; sending and stopping remain no-ops until an adapter claims
 * the connection.
 */
export class PreviewRuntimeAdapter implements WorkspaceRuntimeAdapter {
  private state: WorkspaceRuntimeState = createRuntimeState();
  private readonly listeners = new Set<Listener>();
  private connected = false;

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
    return () => {
      this.listeners.delete(listener);
    };
  };

  setConnected(connected: boolean): void {
    this.connected = connected;
    this.emit();
  }

  restoreComplete(): void {
    this.dispatch({ type: "turn", event: { type: "restore_complete" } });
  }

  restoreUnavailable(): void {
    this.dispatch({ type: "turn", event: { type: "restore_unavailable" } });
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
      action: { type: "submit", message, busy: isBusy(this.state) }
    });
    this.state = result.state;
    if (result.drain !== null) {
      this.beginTurn(result.drain.message);
    }
    this.emit();
  }

  stop(): void {
    if (!this.view.turn.stoppable) return;
    this.dispatch({ type: "turn", event: { type: "run_stopped" } });
    this.drainNext();
  }

  decideApproval(
    messageId: string,
    approvalRequestId: string,
    decision: "allowed" | "declined"
  ): void {
    const messages = this.state.messages.map((message) => {
      if (message.id !== messageId) return message;
      const parts: readonly ChatMessagePart[] = message.parts.map((part) =>
        part.kind === "approval" && part.approvalRequestId === approvalRequestId
          ? { ...part, status: decision }
          : part
      );
      return { ...message, parts };
    });
    this.state = { ...this.state, messages };
    this.dispatch({
      type: "turn",
      event:
        decision === "allowed"
          ? { type: "approval_decided" }
          : { type: "run_completed" }
    });
  }

  removeQueued(id: string): void {
    this.dispatch({ type: "queue", action: { type: "remove", id } });
  }

  private beginTurn(message: QueuedMessage): void {
    this.state = {
      ...reduceRuntime(this.state, {
        type: "message",
        message: userMessage(message)
      }).state,
      turn: {
        ...this.state.turn,
        state: "thinking",
        stoppable: true
      }
    };
  }

  private drainNext(): void {
    const next = reduceQueue(this.state.queue, { type: "settle" });
    this.state = {
      ...this.state,
      queue: next.state,
      turn: {
        ...this.state.turn,
        queueCount: next.state.queued.length
      }
    };
    if (next.drain !== null) {
      this.beginTurn(next.drain.message);
    }
    this.emit();
  }

  private dispatch(event: Parameters<typeof reduceRuntime>[1]): void {
    this.state = reduceRuntime(this.state, event).state;
    this.emit();
  }

  private emit(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}
