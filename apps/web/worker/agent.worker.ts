/**
 * The browser's single authoritative execution environment.
 *
 * One dedicated worker per tab owns the whole runtime: the Web Lock, the OPFS
 * database, its access handles, the projection store, and the Infinity session.
 * A dedicated worker is required rather than chosen — `createSyncAccessHandle()`
 * is exposed nowhere else, and a shared worker cannot construct this one.
 *
 * Order matters and is enforced by the state machine: no database is opened
 * before the lock is held, and the lock is not released until storage is closed.
 */

/// <reference lib="webworker" />

import { agentEventSchema } from "@edapex/contracts";
import type { AgentEvent } from "@edapex/contracts";
import { apiBase } from "@edapex/host/api";
import { openBrowserSqlite, poolDirectoryFor } from "../lib/browser-sqlite";
import type { SqlExecutor } from "../lib/browser-sqlite";
import { loadInfinityWasm, settingsJson } from "../lib/infinity-wasm";
import type { InfinitySession, SessionStore } from "../lib/infinity-wasm";
import {
  failureOf,
  type AgentFailure,
  type AgentLifecycleState
} from "./agent-lifecycle";
import { acquireExclusiveLease, type Lease } from "./agent-lease";

export interface AgentConnect {
  readonly workspaceId: string;
  readonly sessionId: string;
  readonly rootThreadId: string;
  readonly deviceId: string;
  readonly clientId: string;
  readonly model: string;
  readonly masterKey: readonly number[];
}

export type AgentRequest =
  | { readonly id: string; readonly type: "connect"; readonly connect: AgentConnect }
  | { readonly id: string; readonly type: "enqueue"; readonly commandId: string; readonly dedupId: string; readonly text: string }
  | { readonly id: string; readonly type: "tool"; readonly callId: string; readonly result: string }
  | { readonly id: string; readonly type: "approval"; readonly callId: string; readonly decision: string }
  | { readonly id: string; readonly type: "interrupt"; readonly turnId: string }
  | { readonly id: string; readonly type: "shutdown" }
  | { readonly id: string; readonly type: "diagnostics" };

export type AgentResponse =
  | { readonly type: "connected"; readonly id: string; readonly view: string }
  | { readonly type: "runtime_ready"; readonly threadId: string }
  | { readonly type: "lease_locked"; readonly id: string; readonly failure: AgentFailure }
  | { readonly type: "initialization_failed"; readonly id: string; readonly failure: AgentFailure }
  | { readonly type: "runtime_error"; readonly failure: AgentFailure }
  | { readonly type: "accepted"; readonly id: string; readonly turnId?: string }
  | { readonly type: "shutdown_complete"; readonly id: string }
  | { readonly type: "snapshot"; readonly view: string }
  | { readonly type: "agent_tool"; readonly callId: string; readonly payload: string }
  | { readonly type: "agent_approval"; readonly callId: string; readonly payload: string }
  | { readonly type: "events"; readonly events: readonly string[] }
  | { readonly type: "diagnostics"; readonly id: string; readonly trace: string; readonly fts: boolean };

type Database = SqlExecutor & { readonly persistent: true; dispose(): Promise<void> };

class Runtime {
  private state: AgentLifecycleState = "created";
  private lease: Lease | null = null;
  private database: Database | null = null;
  private store: SessionStore | null = null;
  private core: InfinitySession | null = null;
  private readonly callbacks = new Map<string, (value: string) => void>();
  private readonly turns = new Map<string, { replyTo: string; text: string }>();

  trace(): string {
    return this.core?.debug_trace() ?? "[]";
  }

  /** Read-only evidence that this Wasm engine really has FTS5. */
  ftsAvailable(): boolean {
    try {
      return this.store?.fts_available() ?? false;
    } catch {
      return false;
    }
  }
  private readonly outgoing: string[] = [];
  private frame: ReturnType<typeof setTimeout> | null = null;
  private work: Promise<void> = Promise.resolve();
  private connect: Promise<void> | null = null;

  get lifecycle(): AgentLifecycleState {
    return this.state;
  }

  async start(config: AgentConnect): Promise<string> {
    // A second connect must not re-open storage: it reports the existing view.
    if (this.state === "ready" && this.store !== null) return this.store.view();
    if (this.connect !== null) {
      await this.connect;
      return this.store?.view() ?? "";
    }
    this.connect = this.initialize(config);
    try {
      await this.connect;
    } finally {
      this.connect = null;
    }
    return this.store?.view() ?? "";
  }

  private async initialize(config: AgentConnect): Promise<void> {
    this.state = "connecting";
    this.state = "acquiring_lease";
    const outcome = await acquireExclusiveLease(poolDirectoryFor(config.sessionId));
    if (outcome.kind === "unavailable") {
      this.state = "failed";
      throw new LockedError(outcome.reason);
    }
    this.lease = outcome.lease;

    try {
      this.state = "initializing";
      this.database = await openBrowserSqlite({ identity: config.sessionId });
      const wasm = await loadInfinityWasm();
      this.store = new wasm.BrowserSessionStore(
        this.database,
        Uint8Array.from(config.masterKey),
        JSON.stringify(config)
      );
      const view = this.store.view();
      this.core = await wasm.WasmSession.connect(
        settingsJson({ workspaceId: config.workspaceId, model: config.model, mobileSafeTools: false }),
        config.rootThreadId,
        (request, streamId) => {
          void this.stream(request, streamId).catch((cause: unknown) => {
            this.note(`stream.failed=${cause instanceof Error ? cause.message : String(cause)}`);
            this.core?.push_error(streamId, failureOf(cause, "runtime_error").code, failureOf(cause, "runtime_error").message);
            this.core?.end_stream(streamId);
          });
        },
        (event) => this.onEvent(event),
        (call) => this.ask("agent_tool", call),
        (approval) => this.ask("agent_approval", approval)
      );
      this.resume(view);
      this.state = "ready";
    } catch (cause) {
      const original = failureOf(cause, "initialization_failed");
      // A failed initialization must not strand the lock on an unusable runtime.
      // Cleanup must never replace the error that explains the failure.
      try {
        await this.closeStorage();
      } catch {
        // Reported through `original` below.
      }
      throw new InitializationError(original);
    }
  }

  private resume(view: string): void {
    const parsed: unknown = JSON.parse(view);
    if (typeof parsed !== "object" || parsed === null || !("queue" in parsed) || !Array.isArray(parsed.queue)) return;
    for (const entry of parsed.queue) {
      if (!isQueueItem(entry)) continue;
      this.turns.set(entry.commandId, { replyTo: entry.eventId, text: "" });
      this.core?.enqueue_text(entry.commandId, entry.dedupId, entry.text);
    }
  }

  async enqueue(commandId: string, dedupId: string, text: string): Promise<void> {
    if (this.state !== "ready" || this.store === null) throw new StateError();
    const view = this.store.queue_message(commandId, dedupId, text);
    this.resume(view);
  }

  async interrupt(turnId: string): Promise<void> {
    if (this.state !== "ready") throw new StateError();
    await this.core?.interrupt(turnId);
  }

  answer(callId: string, value: string): void {
    this.callbacks.get(callId)?.(value);
    this.callbacks.delete(callId);
  }

  async shutdown(): Promise<void> {
    if (this.state === "closed" || this.state === "shutting_down") return;
    this.state = "shutting_down";
    try {
      await this.core?.close();
    } finally {
      this.core = null;
      for (const pending of this.callbacks.values()) pending("deny");
      this.callbacks.clear();
      await this.closeStorage();
      this.state = "closed";
    }
  }

  /** Closes storage, then releases ownership — in that order, always. */
  private async closeStorage(): Promise<void> {
    try {
      this.store?.release?.();
    } catch {
      // Releasing an application-level marker must not block handle cleanup.
    }
    this.store = null;
    try {
      await this.database?.dispose();
    } finally {
      this.database = null;
      const lease = this.lease;
      this.lease = null;
      if (lease !== null) await lease.release();
    }
  }

  private ask(type: "agent_tool" | "agent_approval", payload: string): Promise<string> {
    const callId = crypto.randomUUID();
    const response = new Promise<string>((resolve) => { this.callbacks.set(callId, resolve); });
    post({ type, callId, payload });
    return response;
  }

  private onEvent(raw: string): void {
    this.note("worker.onEvent");
    this.outgoing.push(raw);
    if (this.frame === null) {
      this.frame = setTimeout(() => {
        const events = this.outgoing.splice(0);
        this.frame = null;
        this.note(`worker.postEvents=${events.length}`);
        post({ type: "events", events });
      }, 16);
    }
    const parsed = agentEventSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return;
    const event: AgentEvent = parsed.data;
    this.work = this.work.then(() => this.record(event)).catch(() => undefined);
  }

  private async record(event: AgentEvent): Promise<void> {
    if (this.store === null) return;
    switch (event.type) {
      case "turn_started":
        this.store.mark_sent(event.turnId);
        break;
      case "message_delta": {
        const turn = this.turns.get(event.turnId);
        if (turn !== undefined) turn.text += event.delta;
        break;
      }
      case "turn_completed": {
        if (event.status !== "completed") return;
        const turn = this.turns.get(event.turnId);
        if (turn === undefined) return;
        this.store.assistant_message(event.turnId, turn.replyTo, turn.text);
        this.turns.delete(event.turnId);
        // The transcript is durable, so the surface gets the stored view rather
        // than accumulating deltas it would lose on reload.
        post({ type: "snapshot", view: this.store.view() });
        break;
      }
      default: break;
    }
  }

  private note(text: string): void {
    this.core?.debug_note(text);
  }

  private async stream(request: string, streamId: number): Promise<void> {
    const wasm = await loadInfinityWasm();
    const response = await fetch(`${apiBase()}/api/v1/agent/model/chat/completions`, {
      method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: request
    });
    this.note(`stream.status=${response.status} body=${response.body === null ? "null" : "set"}`);
    if (!response.ok || response.body === null) {
      const failure = failureOf(`provider_unavailable: the model proxy returned ${response.status}`, "runtime_error");
      this.core?.push_error(streamId, failure.code, failure.message);
      this.core?.end_stream(streamId);
      return;
    }
    const framer = new wasm.SseFramer();
    try {
      const reader = response.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done || value === undefined) break;
        this.note(`stream.read=${value.byteLength}`);
        const events: unknown = JSON.parse(framer.push(value));
        this.note(`stream.events=${Array.isArray(events) ? events.length : "not-array"}`);
        if (!Array.isArray(events)) continue;
        for (const data of events) {
          if (typeof data !== "string") continue;
          const chunks: unknown = JSON.parse(wasm.parseSseData(data));
          this.note(`stream.chunks=${Array.isArray(chunks) ? chunks.length : "not-array"}`);
          if (!Array.isArray(chunks)) continue;
          for (const chunk of chunks) this.core?.push_chunk(streamId, JSON.stringify(chunk));
        }
      }
      const final: unknown = JSON.parse(framer.finish());
      if (typeof final === "string") {
        const chunks: unknown = JSON.parse(wasm.parseSseData(final));
        if (Array.isArray(chunks)) {
          for (const chunk of chunks) this.core?.push_chunk(streamId, JSON.stringify(chunk));
        }
      }
      this.core?.push_chunk(streamId, JSON.stringify({ Done: { finish_reason: null } }));
    } finally {
      this.core?.end_stream(streamId);
    }
  }
}

class LockedError extends Error {
  constructor(readonly reason: AgentFailure) { super(reason.message); }
}

class InitializationError extends Error {
  constructor(readonly reason: AgentFailure) { super(reason.message); }
}

class StateError extends Error {
  constructor() {
    super("runtime_error: the agent runtime is not ready");
  }
}

const runtime = new Runtime();

self.onmessage = (event: MessageEvent<AgentRequest>) => {
  const request = event.data;
  void (async () => {
    try {
      switch (request.type) {
        case "connect":
          try {
            const view = await runtime.start(request.connect);
            post({ type: "connected", id: request.id, view });
            post({ type: "runtime_ready", threadId: request.connect.rootThreadId });
          } catch (cause) {
            if (cause instanceof LockedError) {
              post({ type: "lease_locked", id: request.id, failure: cause.reason });
            } else if (cause instanceof InitializationError) {
              post({ type: "initialization_failed", id: request.id, failure: cause.reason });
            } else {
              post({ type: "initialization_failed", id: request.id, failure: failureOf(cause, "initialization_failed") });
            }
          }
          return;
        case "enqueue":
          await runtime.enqueue(request.commandId, request.dedupId, request.text);
          post({ type: "accepted", id: request.id, turnId: request.commandId });
          return;
        case "interrupt":
          await runtime.interrupt(request.turnId);
          post({ type: "accepted", id: request.id });
          return;
        case "tool":
        case "approval":
          runtime.answer(request.callId, request.type === "tool" ? request.result : request.decision);
          return;
        case "diagnostics": {
          post({ type: "diagnostics", id: request.id, trace: runtime.trace(), fts: runtime.ftsAvailable() });
          return;
        }
        case "shutdown":
          try {
            await runtime.shutdown();
          } finally {
            post({ type: "shutdown_complete", id: request.id });
            self.close();
          }
          return;
        default:
          post({ type: "runtime_error", failure: failureOf("runtime_error: unknown request", "runtime_error") });
      }
    } catch (cause) {
      post({ type: "runtime_error", failure: failureOf(cause, "runtime_error") });
    }
  })();
};

function post(response: AgentResponse): void {
  self.postMessage(response);
}

function isQueueItem(value: unknown): value is { commandId: string; eventId: string; dedupId: string; text: string } {
  return typeof value === "object" && value !== null
    && "commandId" in value && "eventId" in value && "dedupId" in value && "text" in value
    && typeof value.commandId === "string" && typeof value.eventId === "string"
    && typeof value.dedupId === "string" && typeof value.text === "string";
}
