import type { AgentConnectSettings, AgentToolCall } from "@edapex/host/agent/transport";
import type { SqlExecutor } from "./browser-sqlite";

export interface InfinitySession {
  root_thread_id(): string;
  /** Stages the session reached in the worker, with worker-side timestamps. */
  debug_trace(): string;
  debug_note(text: string): void;
  enqueue_text(commandId: string, dedupId: string, text: string): void;
  push_chunk(streamId: number, chunks: string): void;
  push_error(streamId: number, code: string, message: string): void;
  end_stream(streamId: number): void;
  interrupt(turnId: string): Promise<void>;
  close(): Promise<void>;
}

export interface SessionStore {
  view(): string;
  /** Read-only: does the engine actually have FTS5 and the derived table? */
  fts_available(): boolean;
  queue_message(commandId: string, dedupId: string, text: string): string;
  mark_sent(commandId: string): string;
  assistant_message(turnId: string, replyTo: string, text: string): string;
  truncate(fromEventId: string, truncationId: string): string;
  restore_truncation(truncationId: string): string;
  release(): void;
}

export interface InfinityWasm {
  default(options: { module_or_path: string }): Promise<unknown>;
  WasmSession: {
    connect(
      settings: string,
      rootThreadId: string,
      onRequest: (requestJson: string, streamId: number) => void,
      onEvent: (eventJson: string) => void,
      onTool: (callJson: string) => Promise<string>,
      onApproval: (requestJson: string) => Promise<string>
    ): Promise<InfinitySession>;
  };
  BrowserSessionStore: new (
    executor: SqlExecutor,
    masterKey: Uint8Array,
    options: string
  ) => SessionStore;
  SseFramer: new () => {
    push(bytes: Uint8Array): string;
    finish(): string;
  };
  parseSseData(data: string): string;
}

let cached: Promise<InfinityWasm> | null = null;

export function loadInfinityWasm(): Promise<InfinityWasm> {
  if (cached === null) {
    cached = (async () => {
      const url = new URL("/agent-runtime/edapex_agent_wasm.js", globalThis.location.origin);
      const candidate: unknown = await import(/* @vite-ignore */ url.href);
      if (!isInfinityWasm(candidate)) {
        throw new Error("agent-runtime/infinity: unsupported wasm module");
      }
      await candidate.default({ module_or_path: "/agent-runtime/edapex_agent_wasm_bg.wasm" });
      return candidate;
    })();
  }
  return cached;
}

function isInfinityWasm(value: unknown): value is InfinityWasm {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as { readonly [key: string]: unknown };
  // wasm-bindgen exports the class itself, so it is a function, not an object.
  const session = candidate.WasmSession;
  const hasSession = (typeof session === "function" || (typeof session === "object" && session !== null))
    && "connect" in session;
  return hasSession
    && typeof candidate.parseSseData === "function"
    && typeof candidate.default === "function";
}

export function toolResult(call: AgentToolCall, result: { success: boolean; text: string }): string {
  return JSON.stringify({
    callId: call.callId,
    success: result.success,
    content: result.text.length > 0 ? [{ type: "text", text: result.text }] : [],
    error: result.success ? null : {
      code: "permission_denied",
      message: result.text,
      retryable: false
    }
  });
}

export function settingsJson(settings: AgentConnectSettings): string {
  return JSON.stringify(settings);
}
