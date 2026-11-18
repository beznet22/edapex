"use client";

import { agentEventSchema, sessionViewSchema } from "@edapex/contracts";
import type {
  AgentApprovalRequest,
  AgentToolCall,
  ConnectHandlers
} from "@edapex/host/agent/transport";
import { toolResult } from "./infinity-wasm";
import { failureOf } from "../worker/agent-lifecycle";
import type { AgentFailure } from "../worker/agent-lifecycle";
import type { AgentConnect, AgentRequest, AgentResponse } from "../worker/agent.worker";

interface Settings {
  readonly workspaceId: string;
  readonly model: string;
  readonly mobileSafeTools: boolean;
}

interface PendingRequest {
  readonly resolve: () => void;
  readonly reject: (error: Error) => void;
}

export interface ConnectOutcome {
  /** False when another tab owns this session; the UI shows a locked state. */
  readonly owned: boolean;
  readonly failure?: AgentFailure;
}

/**
 * The page's handle on its own dedicated agent worker.
 *
 * The worker owns storage and execution; this class owns only the message
 * protocol, request correlation and the tool/approval round trips the worker
 * cannot perform itself (they need the authenticated page).
 */
export class InfinityBrowserClient {
  private readonly worker: Worker;
  private readonly pending = new Map<string, PendingRequest>();
  private currentTurnId: string | null = null;
  private rootId = "";
  private closed = false;
  private failure: AgentFailure | null = null;

  constructor(
    private readonly settings: Settings,
    private readonly handlers: ConnectHandlers,
    workerName = "edapex-infinity-agent"
  ) {
    void workerName;
    this.worker = new Worker(new URL("../worker/agent.worker.ts", import.meta.url), {
      type: "module",
      name: "edapex-infinity-agent"
    });
    this.worker.onmessage = (event: MessageEvent<AgentResponse>) => this.onMessage(event.data);
    this.worker.onerror = (event) => {
      this.rejectAll(reasonOf(event.message, "runtime_error"));
    };
    this.worker.onmessageerror = () => {
      this.rejectAll("channel_unavailable: the agent worker failed to answer");
    };
  }

  /** Latest structured failure, for a UI that renders the locked/error state. */
  get error(): AgentFailure | null {
    return this.failure;
  }

  async connect(): Promise<ConnectOutcome> {
    this.rootId = readOrCreate(`edapex.infinity.thread.${this.settings.workspaceId}`);
    const clientId = readOrCreate("edapex.infinity.client");
    let masterKey: number[];
    try {
      masterKey = dataKey(this.settings.workspaceId);
    } catch (cause) {
      return { owned: false, failure: failureOf(cause, "storage_corrupted") };
    }
    const connect: AgentConnect = {
      rootThreadId: this.rootId,
      sessionId: this.rootId,
      workspaceId: this.settings.workspaceId,
      model: this.settings.model,
      deviceId: "browser",
      clientId,
      masterKey
    };
    try {
      await this.request({ id: crypto.randomUUID(), type: "connect", connect });
      return { owned: true };
    } catch (cause) {
      const failure = this.failure;
      if (failure?.code === "lease_locked") return { owned: false, failure };
      throw cause;
    }
  }

  async executeTool(call: AgentToolCall): Promise<{ success: boolean; text: string }> {
    return this.handlers.onTool(call);
  }

  async startTurn(text: string): Promise<void> {
    if (this.closed) throw new Error("runtime_error: the agent session is closed");
    if (this.rootId.length === 0 || text.trim().length === 0) {
      throw new Error("invalid_input: connect the session and enter a message");
    }
    const commandId = crypto.randomUUID();
    this.currentTurnId = commandId;
    await this.request({ id: crypto.randomUUID(), type: "enqueue", commandId, dedupId: commandId, text });
  }

  async stop(): Promise<void> {
    if (this.currentTurnId === null) return;
    const turnId = this.currentTurnId;
    this.currentTurnId = null;
    await this.request({ id: crypto.randomUUID(), type: "interrupt", turnId });
  }

  /** Closes storage in the worker, which releases ownership, then stops it. */
  async dispose(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    try {
      await this.request({ id: crypto.randomUUID(), type: "shutdown" });
    } finally {
      this.rejectAll("cancelled: the agent session closed");
      this.worker.terminate();
    }
  }

  private onMessage(message: AgentResponse): void {
    switch (message.type) {
      case "diagnostics":
        this.traceResolvers.get(message.id)?.({ trace: message.trace, fts: message.fts });
        this.traceResolvers.delete(message.id);
        return;
      case "snapshot":
        this.restore(message.view);
        return;
      case "events":
        for (const raw of message.events) this.emit(raw);
        return;
      case "agent_tool":
        void this.runTool(message.payload, message.callId);
        return;
      case "agent_approval":
        void this.approve(message.payload, message.callId);
        return;
      case "runtime_ready":
        this.handlers.onEvent({ type: "connected", threadId: message.threadId });
        return;
      case "runtime_error":
        this.failure = message.failure;
        this.handlers.onEvent({
          type: "error",
          threadId: this.rootId || null,
          turnId: this.currentTurnId,
          error: { code: "internal_error", message: message.failure.message, retryable: message.failure.retryable }
        });
        return;
      case "connected":
        if (this.restore(message.view)) this.settle(message.id, null);
        else this.settle(message.id, new Error("storage_corrupted: the saved session view was invalid"));
        return;
      case "lease_locked":
      case "initialization_failed":
        this.failure = message.failure;
        this.settle(message.id, new Error(`${message.failure.code}: ${message.failure.message}`));
        return;
      default:
        if ("turnId" in message && typeof message.turnId === "string") this.currentTurnId = message.turnId;
        this.settle(message.id, null);
    }
  }

  /**
   * The worker's own record of how far the session got. A worker's console does
   * not reach the page, so this is the only way to see a stalled turn.
   */
  async debugTrace(): Promise<string> {
    return (await this.debugDiagnostics()).trace;
  }

  /** The worker's trace plus whether its Wasm engine has FTS5. */
  async debugDiagnostics(): Promise<{ trace: string; fts: boolean }> {
    const id = crypto.randomUUID();
    const reply = new Promise<{ trace: string; fts: boolean }>((resolve) => {
      this.traceResolvers.set(id, resolve);
      setTimeout(() => {
        this.traceResolvers.delete(id);
        resolve({ trace: "[]", fts: false });
      }, 5_000);
    });
    this.worker.postMessage({ type: "diagnostics", id } satisfies AgentRequest);
    return reply;
  }

  private readonly traceResolvers = new Map<string, (reply: { trace: string; fts: boolean }) => void>();

  private request(input: AgentRequest): Promise<void> {
    return new Promise((resolve, reject) => {
      this.pending.set(input.id, { resolve, reject });
      this.worker.postMessage(input);
    });
  }

  private settle(id: string, error: Error | null): void {
    const request = this.pending.get(id);
    if (request === undefined) return;
    this.pending.delete(id);
    if (error === null) request.resolve();
    else request.reject(error);
  }

  private rejectAll(message: string): void {
    const error = new Error(message);
    for (const request of this.pending.values()) request.reject(error);
    this.pending.clear();
  }

  private emit(raw: unknown): void {
    if (typeof raw !== "string") {
      console.error("[infinity] non-string event", raw);
      return;
    }
    let decoded: unknown;
    try {
      decoded = JSON.parse(raw);
    } catch (cause) {
      console.error("[infinity] undecodable event", raw, cause);
      return;
    }
    const parsed = agentEventSchema.safeParse(decoded);
    if (!parsed.success) {
      console.error("[infinity] rejected event", raw, parsed.error.issues);
      return;
    }
    if (parsed.data.type === "turn_started") this.currentTurnId = parsed.data.turnId;
    this.handlers.onEvent(parsed.data);
  }

  private restore(raw: string): boolean {
    const view = sessionViewSchema.safeParse(JSON.parse(raw));
    if (!view.success) return false;
    this.handlers.onEvent({ type: "session_snapshot", view: view.data });
    return true;
  }

  private async runTool(raw: string, callId: string): Promise<void> {
    try {
      const call: unknown = JSON.parse(raw);
      if (!isToolCall(call)) throw new Error("The tool call was malformed");
      const result = await this.handlers.onTool(call);
      this.worker.postMessage({ type: "tool", id: crypto.randomUUID(), callId, result: toolResult(call, result) } satisfies AgentRequest);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "The tool failed";
      const call: AgentToolCall = { callId: "unavailable", tool: "unknown", arguments: null };
      this.worker.postMessage({ type: "tool", id: crypto.randomUUID(), callId, result: toolResult(call, { success: false, text: message }) } satisfies AgentRequest);
    }
  }

  private async approve(raw: string, callId: string): Promise<void> {
    const request: unknown = JSON.parse(raw);
    const allowed = isApprovalRequest(request) && await this.handlers.onApproval(request);
    this.worker.postMessage({
      type: "approval", id: crypto.randomUUID(), callId, decision: allowed ? "allow_once" : "deny"
    } satisfies AgentRequest);
  }
}

function reasonOf(message: string, code: AgentFailure["code"]): string {
  return `${code}: ${message.length > 0 ? message : "the agent worker failed"}`;
}

function isToolCall(value: unknown): value is AgentToolCall {
  return typeof value === "object" && value !== null && "callId" in value && "tool" in value && "arguments" in value
    && typeof value.callId === "string" && typeof value.tool === "string";
}

function isApprovalRequest(value: unknown): value is AgentApprovalRequest {
  return typeof value === "object" && value !== null
    && "approvalRequestId" in value && typeof value.approvalRequestId === "string"
    && "title" in value && typeof value.title === "string"
    && "description" in value && typeof value.description === "string"
    && "risk" in value && (value.risk === "read" || value.risk === "write" || value.risk === "destructive");
}

function readOrCreate(key: string): string {
  const current = localStorage.getItem(key);
  if (current !== null && current.length > 0) return current;
  const created = crypto.randomUUID();
  localStorage.setItem(key, created);
  return created;
}

/** A local data-encryption key, never a bearer token or provider credential. */
function dataKey(workspaceId: string): number[] {
  const key = `edapex.infinity.key.${workspaceId}`;
  const stored = localStorage.getItem(key);
  if (stored !== null) {
    if (!/^[0-9a-f]{64}$/.test(stored)) {
      throw new Error("storage_corrupted: the local data key is unreadable");
    }
    return Array.from(stored.match(/.{2}/g) ?? [], (byte) => Number.parseInt(byte, 16));
  }
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  localStorage.setItem(key, Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join(""));
  return Array.from(bytes);
}
