"use client";

import type { AgentEvent } from "@edapex/contracts";

import { apiBase } from "@/lib/api";

/**
 * Browser transport for the shared agent core.
 *
 * The core is compiled to WebAssembly from `crates/agent-wasm` and carries no
 * HTTP stack of its own. This module supplies the two things the core cannot do
 * in a browser: fetch the provider stream, and reach the EdApex tool endpoints.
 *
 * Provider credentials never reach this file. The model call goes through the
 * `sms-api`'s `/api/v1/agent/model/*` passthrough, which forwards to
 * `model-router`. The browser never holds a provider key.
 */

export interface NativeAgentSettings {
  readonly workspaceId: string;
  readonly model: string;
  readonly mobileSafeTools: boolean;
}

interface AgentBridge {
  readonly thread_start: () => string;
  readonly status: () => string;
  readonly turn_start: (threadId: string, text: string) => Promise<string>;
  readonly interrupt: (threadId: string, turnId: string) => void;
  readonly push_chunk: (chunk: string) => void;
  readonly push_error: (code: string, message: string) => void;
  readonly end_stream: () => void;
  readonly close: () => void;
}

interface AgentWasmModule {
  readonly default: (input: { module_or_path: string }) => Promise<unknown>;
  readonly WasmAgent: new (
    settings: string,
    onRequest: (request: string) => void,
    onEvent: (event: string) => void,
    // A promise is accepted: the Rust side awaits it.
    onTool: (call: string) => string | Promise<string>,
    onApproval: (request: string) => string | Promise<string>
  ) => AgentBridge;
  readonly SseFramer: new () => {
    readonly push: (bytes: Uint8Array) => string;
    readonly finish: () => string;
  };
  readonly parseSseData: (data: string) => string;
}

export interface AgentCallbacks {
  readonly onEvent: (event: AgentEvent) => void;
  readonly onTool: (call: {
    readonly callId: string;
    readonly tool: string;
    readonly arguments: unknown;
  }) => Promise<{ readonly success: boolean; readonly text: string }>;
  readonly onApproval: (request: {
    readonly approvalRequestId: string;
    readonly title: string;
    readonly description: string;
    readonly risk: "read" | "write" | "destructive";
  }) => Promise<boolean>;
}

const RUNTIME_PATH = "/agent-runtime/edapex_agent_wasm.js";
const RUNTIME_WASM = "/agent-runtime/edapex_agent_wasm_bg.wasm";

let modulePromise: Promise<AgentWasmModule> | null = null;

/**
 * Load the WASM runtime once per page.
 *
 * The bundle is imported dynamically so it stays out of the initial JS payload;
 * a cold start pays for it only when the person actually opens a workspace.
 *
 * The specifier is built with `new URL` at runtime rather than passed as a const:
 * `agent-runtime/` lives in `public/`, and a statically-analysable specifier is
 * rewritten by Vite into a module-graph id, which fails with "this file is in
 * /public and ... should not be imported from source code". `@vite-ignore` alone
 * does not help, because the const's literal value is inlined before the comment
 * is consulted.
 */
async function loadAgentModule(): Promise<AgentWasmModule> {
  if (modulePromise !== null) return modulePromise;
  modulePromise = (async () => {
    const specifier = new URL(RUNTIME_PATH, window.location.origin).href;
    const module = (await import(/* @vite-ignore */ specifier)) as AgentWasmModule;
    await module.default({ module_or_path: RUNTIME_WASM });
    return module;
  })();
  return modulePromise;
}

export class NativeAgentClient {
  private bridge: AgentBridge | null = null;
  private readonly settings: NativeAgentSettings;
  private readonly callbacks: AgentCallbacks;
  private threadId: string | null = null;
  private turnId: string | null = null;

  constructor(settings: NativeAgentSettings, callbacks: AgentCallbacks) {
    this.settings = settings;
    this.callbacks = callbacks;
  }

  get thread(): string | null {
    return this.threadId;
  }

  async connect(): Promise<void> {
    const module = await loadAgentModule();
    this.bridge = new module.WasmAgent(
      JSON.stringify(this.settings),
      (request) => void this.streamProvider(request),
      (event) => this.emit(event),
      // The core awaits whatever these return, so a plain promise is enough: a
      // browser tool call and a human approval are both asynchronous round trips.
      (call) => this.callTool(call),
      (request) => this.callApproval(request)
    );
    this.threadId = this.bridge.thread_start();
  }

  /**
   * Start a turn.
   *
   * Resolves as soon as the turn is **accepted**, not when it finishes. Events
   * arrive through `onEvent` while it runs, and `turn_completed` marks the end —
   * so the UI can render progress and Stop has something to cancel.
   */
  async startTurn(text: string): Promise<void> {
    const bridge = this.bridge;
    if (bridge === null || this.threadId === null) {
      throw new Error("The agent runtime is not connected.");
    }
    this.turnId = await bridge.turn_start(this.threadId, text);
  }

  async stop(): Promise<void> {
    const bridge = this.bridge;
    if (bridge === null || this.threadId === null || this.turnId === null) return;
    bridge.interrupt(this.threadId, this.turnId);
    this.turnId = null;
  }

  dispose(): void {
    this.bridge?.close();
    this.bridge = null;
  }

  async executeTool(call: {
    readonly callId: string;
    readonly tool: string;
    readonly arguments: unknown;
  }): Promise<{ readonly success: boolean; readonly text: string }> {
    const endpoint =
      call.tool === "web_search"
        ? "/api/v1/agent/web/search"
        : call.tool === "web_fetch"
          ? "/api/v1/agent/web/fetch"
          : null;
    if (endpoint === null) {
      return { success: false, text: "That tool is not available in the browser workspace." };
    }
    try {
      const response = await fetch(`${apiBase()}${endpoint}`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(call.arguments)
      });
      if (!response.ok) {
        return { success: false, text: `The tool failed (${response.status}).` };
      }
      return { success: true, text: await response.text() };
    } catch {
      return { success: false, text: "The tool could not reach the network." };
    }
  }

  /**
   * Fetch the provider stream and feed it into the core.
   *
   * Parsing happens in Rust (`fallback` used only if the WASM framer is absent),
   * so the browser and the native hosts share one SSE implementation.
   */
  private async streamProvider(requestJson: string): Promise<void> {
    const bridge = this.bridge;
    if (bridge === null) return;

    try {
      const response = await fetch(`${apiBase()}/api/v1/agent/model/chat/completions`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: requestJson
      });

      if (!response.ok || response.body === null) {
        bridge.push_error("provider_unavailable", `The model proxy returned ${response.status}.`);
        return;
      }

      const reader = response.body.getReader();
      const module = await loadAgentModule();
      const framer = new module.SseFramer();

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const events: readonly string[] = JSON.parse(framer.push(value));
        for (const data of events) {
          for (const chunk of JSON.parse(module.parseSseData(data))) {
            bridge.push_chunk(JSON.stringify(chunk));
          }
        }
      }

      const trailing: string | null = JSON.parse(framer.finish());
      if (trailing !== null) {
        for (const chunk of JSON.parse(module.parseSseData(trailing))) {
          bridge.push_chunk(JSON.stringify(chunk));
        }
      }
      bridge.push_chunk(JSON.stringify({ Done: { finish_reason: null } }));
    } catch (cause) {
      bridge.push_error(
        "provider_unavailable",
        cause instanceof Error ? cause.message : "The model stream failed."
      );
    } finally {
      // Always release the core's rendezvous, including on the error path.
      bridge.end_stream();
    }
  }

  /**
   * Tool calls, in the shape the WASM bridge expects.
   *
   * The bridge returns a `DynamicToolResult` JSON string. A parse failure on the
   * core side becomes a failed result, never a silently empty one.
   */
  private callTool(callJson: string): Promise<string> {
    return (async () => {
      try {
        const call = JSON.parse(callJson) as {
          readonly callId: string;
          readonly tool: string;
          readonly arguments: unknown;
        };
        const result = await this.callbacks.onTool(call);
        return JSON.stringify({
          success: result.success,
          content: result.text.length > 0 ? [{ type: "text", text: result.text }] : [],
          error: result.success
            ? null
            : {
                code: "unsupported_capability",
                message: result.text,
                retryable: false
              }
        });
      } catch {
        return JSON.stringify({
          success: false,
          content: [],
          error: { code: "internal_error", message: "The tool failed.", retryable: true }
        });
      }
    })();
  }

  /** Approvals resolve to a decision string; anything unrecognised fails closed. */
  private callApproval(requestJson: string): Promise<string> {
    return (async () => {
      try {
        const request = JSON.parse(requestJson) as {
          readonly approvalRequestId: string;
          readonly title: string;
          readonly description: string;
          readonly risk: "read" | "write" | "destructive";
        };
        const allowed = await this.callbacks.onApproval(request);
        return allowed ? "allow_once" : "deny";
      } catch {
        return "deny";
      }
    })();
  }

  private emit(eventJson: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(eventJson);
    } catch {
      return;
    }
    // Validate at the boundary so a malformed event cannot reach the reducer.
    //
    // A hand-written guard rather than the Zod schema: the producer is our own
    // Rust core, which serialises `AgentEvent` through serde, so this is an
    // in-process boundary rather than an untrusted peer. Pulling Zod onto the
    // initial path cost ~30 KB gzip against a 150 KB budget.
    if (!isAgentEvent(parsed)) return;
    this.callbacks.onEvent(parsed);
  }

}

/** Fields each event variant cannot do without. */
const REQUIRED_EVENT_FIELDS: Readonly<Record<string, readonly string[]>> = {
  connected: [],
  turn_started: ["threadId", "turnId"],
  message_delta: ["threadId", "turnId", "itemId", "delta"],
  reasoning_delta: ["threadId", "turnId", "itemId", "delta"],
  tool_started: ["threadId", "turnId", "toolCallId", "name", "summary"],
  tool_completed: ["threadId", "turnId", "toolCallId", "name", "status"],
  approval_requested: [
    "threadId",
    "turnId",
    "approvalRequestId",
    "title",
    "description",
    "risk",
    "decisions"
  ],
  approval_resolved: ["threadId", "turnId", "approvalRequestId", "decision"],
  turn_completed: ["threadId", "turnId", "status"],
  interrupted: ["threadId", "turnId", "reason"],
  error: ["error"]
};

/**
 * Structural guard for the event union.
 *
 * Rejects anything whose tag is unknown or whose required fields are absent, so
 * the reducer only ever receives a well-formed event.
 */
function isAgentEvent(value: unknown): value is AgentEvent {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  const type = record.type;
  if (typeof type !== "string") return false;

  const required = REQUIRED_EVENT_FIELDS[type];
  if (required === undefined && type !== "error") return false;

  for (const field of required ?? []) {
    if (!(field in record)) return false;
  }

  // `error` carries a nested object; everything else is string or array shaped,
  // which the reducer tolerates as long as the discriminator and fields exist.
  if (type === "error") {
    const error = record.error;
    return typeof error === "object" && error !== null && "code" in error;
  }
  return true;
}
