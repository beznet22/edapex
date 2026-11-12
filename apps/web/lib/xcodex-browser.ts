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

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

export interface OpenRouterSettings {
  readonly apiKey: string;
  readonly model: string;
}

export interface XcodexConfig {
  readonly model: string;
  readonly modelProvider: string;
  readonly runtime_mode?: "agent";
  readonly modelReasoningEffort: string | null;
  readonly personality: string | null;
  readonly modelProviders: Readonly<
    Record<
      string,
      {
        readonly name: string;
        readonly baseUrl: string;
        readonly envKey: string;
        readonly providerKind: "xrouter_browser";
        readonly wireApi: "responses";
        readonly metadata: { readonly xrouterProvider: "openrouter" };
      }
    >
  >;
  readonly env: Readonly<Record<string, string>>;
}

type XcodexSession = Readonly<Record<string, JsonValue>>;
type XcodexSessionMetadata = Readonly<Record<string, JsonValue>>;

interface XcodexUserConfig {
  readonly filePath: string;
  readonly version: string;
  readonly content: string;
}

interface XcodexStorage {
  loadSession(threadId: string): Promise<XcodexSession | null>;
  saveSession(session: XcodexSession): Promise<void>;
  deleteSession(threadId: string): Promise<void>;
  listSessions(): Promise<readonly XcodexSessionMetadata[]>;
  loadAuthState(): Promise<null>;
  saveAuthState(authState: null): Promise<void>;
  clearAuthState(): Promise<void>;
  loadConfig(): Promise<XcodexConfig>;
  saveConfig(config: XcodexConfig): Promise<void>;
  clearConfig(): Promise<void>;
  loadUserConfig(): Promise<XcodexUserConfig | null>;
  saveUserConfig(input: {
    filePath?: string | null;
    expectedVersion?: string | null;
    content: string;
  }): Promise<XcodexUserConfig>;
}

interface XcodexWorkspace {
  readFile(request: JsonValue): Promise<JsonValue>;
  listDir(request: JsonValue): Promise<JsonValue>;
  search(request: JsonValue): Promise<JsonValue>;
  applyPatch(request: JsonValue): Promise<JsonValue>;
}

interface XcodexApprovalRequest {
  readonly approvalId: string;
  readonly toolName: string;
  readonly reason: string;
  readonly approvalKind: string;
  readonly targetUrl: string | null;
  readonly origin: string;
}

interface XcodexApprovalResponse {
  readonly decision: "allow_once" | "allow_for_session" | "deny" | "abort";
}

interface XcodexThreadStartResponse {
  readonly thread: { readonly id: string };
}

interface XcodexTurnStartResponse {
  readonly turn: { readonly id: string };
}

interface XcodexRuntimeClient {
  threadStart(params: {
    readonly cwd: string;
    readonly model: string;
    readonly modelProvider: string;
    readonly approvalPolicy: "on-request";
    readonly sandbox: "workspace-write";
    readonly experimentalRawEvents: false;
    readonly persistExtendedHistory: true;
  }): Promise<XcodexThreadStartResponse>;
  turnStart(params: {
    readonly threadId: string;
    readonly input: readonly [{ readonly type: "text"; readonly text: string }];
  }): Promise<XcodexTurnStartResponse>;
  turnInterrupt(params: {
    readonly threadId: string;
    readonly turnId: string;
  }): Promise<unknown>;
  subscribeToNotifications(
    listener: (notification: { readonly method: string; readonly params: unknown }) => void
  ): () => void;
}

interface XcodexContext {
  readonly runtime: XcodexRuntimeClient;
  readonly loadConfig: () => Promise<XcodexConfig>;
  readonly saveConfig: (config: XcodexConfig) => Promise<void>;
}

interface XcodexRuntimeModule {
  readonly createBrowserCodexRuntimeContext: (options: {
    readonly codexHome?: string;
    readonly cwd: string;
    readonly storage: XcodexStorage;
    readonly workspace: XcodexWorkspace;
    readonly transport: {
      readonly loadRuntimeModule: () => Promise<unknown>;
      readonly loadXrouterRuntime: () => Promise<unknown>;
    };
    readonly requestBrowserToolApproval?: (
      request: XcodexApprovalRequest
    ) => Promise<XcodexApprovalResponse>;
    readonly telemetry?: { readonly initializePageTelemetry?: boolean };
  }) => Promise<XcodexContext>;
  readonly createLocalStorageWorkspaceAdapter: () => XcodexWorkspace;
  readonly DEFAULT_CODEX_CONFIG: XcodexConfig;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isFunction = (value: unknown): value is (...args: never[]) => unknown =>
  typeof value === "function";

const isInitializer = (
  value: unknown
): value is (input: { readonly module_or_path: string }) => Promise<void> =>
  typeof value === "function";

function isXcodexModule(value: unknown): value is XcodexRuntimeModule {
  if (!isRecord(value)) return false;
  return (
    isFunction(value.createBrowserCodexRuntimeContext) &&
    isFunction(value.createLocalStorageWorkspaceAdapter) &&
    isRecord(value.DEFAULT_CODEX_CONFIG)
  );
}

async function loadManifest(path: string): Promise<{
  readonly buildId: string;
  readonly entry: string;
  readonly wasm: string;
}> {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error(`Runtime manifest unavailable (${response.status})`);
  const body: unknown = await response.json();
  if (
    !isRecord(body) ||
    typeof body.buildId !== "string" ||
    typeof body.entry !== "string" ||
    typeof body.wasm !== "string"
  ) {
    throw new Error("Runtime manifest is invalid");
  }
  return { buildId: body.buildId, entry: body.entry, wasm: body.wasm };
}

async function loadWasmModule(manifestPath: string): Promise<unknown> {
  const manifest = await loadManifest(manifestPath);
  const entry = `${manifest.entry}?v=${encodeURIComponent(manifest.buildId)}`;
  const wasm = `${manifest.wasm}?v=${encodeURIComponent(manifest.buildId)}`;
  const key = `__edapexWasm_${manifest.buildId.replace(/[^a-zA-Z0-9]/g, "_")}`;
  const existing = (globalThis as Record<string, unknown>)[key];
  if (existing !== undefined) return existing;

  return await new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const eventName = `edapex:wasm-ready:${key}`;
    const timer = window.setTimeout(() => {
      script.remove();
      reject(new Error("WASM runtime did not initialize"));
    }, 20_000);
    const loaded = (): void => {
      window.clearTimeout(timer);
      const module = (globalThis as Record<string, unknown>)[key];
      if (module === undefined) {
        reject(new Error("WASM runtime module is missing"));
        return;
      }
      resolve(module);
    };
    script.type = "module";
    script.textContent = `import * as runtime from ${JSON.stringify(entry)}; await runtime.default({ module_or_path: ${JSON.stringify(wasm)} }); globalThis[${JSON.stringify(key)}] = runtime; globalThis.dispatchEvent(new Event(${JSON.stringify(eventName)}));`;
    script.onerror = () => {
      window.clearTimeout(timer);
      reject(new Error("Could not load the WASM runtime"));
    };
    globalThis.addEventListener(eventName, loaded, { once: true });
    document.head.appendChild(script);
  });
}

const loadRuntimeModule = (): Promise<unknown> =>
  loadWasmModule("/xcodex/manifest.json");

const loadXrouterRuntime = (): Promise<unknown> =>
  loadWasmModule("/xrouter-browser/manifest.json");

function loadXcodexModule(): Promise<XcodexRuntimeModule> {
  const existing = (globalThis as { __edapexXcodexRuntime?: unknown }).__edapexXcodexRuntime;
  if (existing !== undefined) {
    if (!isXcodexModule(existing)) return Promise.reject(new Error("xcodex runtime bundle is invalid"));
    return Promise.resolve(existing);
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const timer = window.setTimeout(() => {
      script.remove();
      reject(new Error("xcodex runtime bundle did not load"));
    }, 20_000);
    const loaded = (): void => {
      window.clearTimeout(timer);
      const runtime = (globalThis as { __edapexXcodexRuntime?: unknown }).__edapexXcodexRuntime;
      if (!isXcodexModule(runtime)) {
        reject(new Error("xcodex runtime bundle is invalid"));
        return;
      }
      resolve(runtime);
    };
    script.type = "module";
    script.textContent = `import * as runtime from "/xcodex/current/xcodex-runtime.js"; globalThis.__edapexXcodexRuntime = runtime; globalThis.dispatchEvent(new Event("edapex:xcodex-ready"));`;
    script.onerror = () => {
      window.clearTimeout(timer);
      reject(new Error("Could not load the xcodex runtime bundle"));
    };
    globalThis.addEventListener("edapex:xcodex-ready", loaded, { once: true });
    document.head.appendChild(script);
  });
}

class MemoryXcodexStorage implements XcodexStorage {
  private readonly sessions = new Map<string, XcodexSession>();
  private configValue: XcodexConfig;
  private readonly userConfig: XcodexUserConfig = {
    filePath: "/workspace/.codex/config.toml",
    version: "0",
    content: ""
  };

  constructor(config: XcodexConfig) {
    this.configValue = config;
  }

  async loadSession(threadId: string): Promise<XcodexSession | null> {
    return this.sessions.get(threadId) ?? null;
  }

  async saveSession(session: XcodexSession): Promise<void> {
    const id = session.id;
    if (typeof id !== "string") return;
    this.sessions.set(id, session);
  }

  async deleteSession(threadId: string): Promise<void> {
    this.sessions.delete(threadId);
  }

  async listSessions(): Promise<readonly XcodexSessionMetadata[]> {
    return [...this.sessions.values()];
  }

  async loadAuthState(): Promise<null> {
    return null;
  }

  async saveAuthState(): Promise<void> {}

  async clearAuthState(): Promise<void> {}

  async loadConfig(): Promise<XcodexConfig> {
    return this.configValue;
  }

  async saveConfig(config: XcodexConfig): Promise<void> {
    this.configValue = config;
  }

  async clearConfig(): Promise<void> {}

  async loadUserConfig(): Promise<XcodexUserConfig> {
    return this.userConfig;
  }

  async saveUserConfig(input: {
    readonly filePath?: string | null;
    readonly expectedVersion?: string | null;
    readonly content: string;
  }): Promise<XcodexUserConfig> {
    return {
      filePath: input.filePath ?? this.userConfig.filePath,
      version: String(Number(this.userConfig.version) + 1),
      content: input.content
    };
  }
}

const openRouterConfig = (
  template: XcodexConfig,
  settings: OpenRouterSettings
): XcodexConfig => ({
  ...template,
  model: settings.model,
  modelProvider: "openrouter",
  modelReasoningEffort: "medium",
  personality: "pragmatic",
  modelProviders: {
    openrouter: {
      name: "OpenRouter",
      baseUrl: "https://openrouter.ai/api/v1",
      envKey: "OPENROUTER_API_KEY",
      providerKind: "xrouter_browser",
      wireApi: "responses",
      metadata: { xrouterProvider: "openrouter" }
    }
  },
  env: {
    OPENROUTER_API_KEY: settings.apiKey
  }
});

interface PendingApproval {
  readonly messageId: string;
  readonly resolve: (decision: XcodexApprovalResponse) => void;
}

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

export class OpenRouterXcodexAdapter implements WorkspaceRuntimeAdapter {
  private state: WorkspaceRuntimeState = createRuntimeState();
  private readonly listeners = new Set<Listener>();
  private context: XcodexContext | null = null;
  private threadId: string | null = null;
  private turnId: string | null = null;
  private connected = false;
  private readonly pendingApprovals = new Map<string, PendingApproval>();

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

  async connect(settings: OpenRouterSettings): Promise<void> {
    const module = await loadXcodexModule();
    const config = openRouterConfig(module.DEFAULT_CODEX_CONFIG, settings);
    const storage = new MemoryXcodexStorage(config);
    const workspace = module.createLocalStorageWorkspaceAdapter();
    const context = await module.createBrowserCodexRuntimeContext({
      codexHome: "/workspace/.codex",
      cwd: "/workspace",
      storage,
      workspace,
      transport: { loadRuntimeModule, loadXrouterRuntime },
      telemetry: { initializePageTelemetry: false },
      requestBrowserToolApproval: async (request) => {
        return await new Promise<XcodexApprovalResponse>((resolve) => {
          const messageId = `approval-${request.approvalId}`;
          const approval: ApprovalPart = {
            kind: "approval",
            approvalRequestId: request.approvalId,
            status: "pending",
            title: request.toolName,
            description: request.reason,
            risk: request.approvalKind === "sensitive_read" ? "read" : "write"
          };
          this.state = {
            ...this.state,
            messages: [
              ...this.state.messages,
              {
                id: messageId,
                role: "assistant",
                createdAt: Date.now(),
                parts: [approval]
              }
            ],
            turn: { ...this.state.turn, state: "waiting_for_person" }
          };
          this.pendingApprovals.set(request.approvalId, { messageId, resolve });
          this.emit();
        });
      }
    });

    const thread = await context.runtime.threadStart({
      cwd: "/workspace",
      model: settings.model,
      modelProvider: "openrouter",
      approvalPolicy: "on-request",
      sandbox: "workspace-write",
      experimentalRawEvents: false,
      persistExtendedHistory: true
    });
    this.context = context;
    this.threadId = thread.thread.id;
    this.connected = true;
    context.runtime.subscribeToNotifications((notification) => {
      this.onNotification(notification);
    });
    this.state = { ...this.state, turn: { ...this.state.turn, state: "idle" } };
    this.emit();
  }

  restoreComplete(): void {
    if (this.connected) return;
    this.state = {
      ...this.state,
      turn: { ...this.state.turn, state: "idle" }
    };
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
    const result = reduceRuntime(this.state, {
      type: "queue",
      action: { type: "remove", id }
    });
    this.state = result.state;
    this.emit();
  }

  restoreUnavailable(): void {
    this.state = {
      ...this.state,
      turn: { ...this.state.turn, state: "history_unavailable" }
    };
    this.emit();
  }

  stop(): void {
    if (this.context === null || this.threadId === null || this.turnId === null) return;
    void this.context.runtime
      .turnInterrupt({ threadId: this.threadId, turnId: this.turnId })
      .catch(() => undefined);
    this.state = {
      ...this.state,
      turn: { ...this.state.turn, state: "stopped", stoppable: false }
    };
    this.emit();
  }

  decideApproval(
    _messageId: string,
    approvalRequestId: string,
    decision: "allowed" | "declined"
  ): void {
    const pending = this.pendingApprovals.get(approvalRequestId);
    if (pending === undefined) return;
    pending.resolve({
      decision: decision === "allowed" ? "allow_once" : "deny"
    });
    this.pendingApprovals.delete(approvalRequestId);
    this.state = {
      ...this.state,
      messages: this.state.messages.map((message) =>
        message.id === pending.messageId
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
    if (this.context === null || this.threadId === null) return;
    this.state = {
      ...this.state,
      messages: [...this.state.messages, userMessage(message)],
      turn: { ...this.state.turn, state: "thinking", stoppable: true }
    };
    this.emit();
    try {
      const turn = await this.context.runtime.turnStart({
        threadId: this.threadId,
        input: [{ type: "text", text: message.text }]
      });
      this.turnId = turn.turn.id;
    } catch {
      this.state = {
        ...this.state,
        turn: { ...this.state.turn, state: "error", stoppable: false }
      };
      this.emit();
    }
  }

  private onNotification(notification: {
    readonly method: string;
    readonly params: unknown;
  }): void {
    const params = isRecord(notification.params) ? notification.params : null;
    if (params === null) return;
    switch (notification.method) {
      case "turn/started":
        this.state = {
          ...this.state,
          turn: { ...this.state.turn, state: "thinking", stoppable: true }
        };
        break;
      case "item/agentMessage/delta": {
        const itemId = typeof params.itemId === "string" ? params.itemId : null;
        const delta = typeof params.delta === "string" ? params.delta : "";
        if (itemId === null || delta.length === 0) return;
        this.appendAgentText(itemId, delta);
        break;
      }
      case "item/completed": {
        const item = isRecord(params.item) ? params.item : null;
        if (item !== null && item.type === "agentMessage") {
          this.finalizeAgentText(item);
        }
        break;
      }
      case "turn/completed": {
        const turn = isRecord(params.turn) ? params.turn : null;
        const status = turn !== null && typeof turn.status === "string" ? turn.status : "completed";
        this.state = {
          ...this.state,
          turn: {
            ...this.state.turn,
            state: status === "failed" ? "error" : status === "interrupted" ? "stopped" : "completed",
            stoppable: false
          }
        };
        this.drainNext();
        break;
      }
      case "error":
        this.state = {
          ...this.state,
          turn: { ...this.state.turn, state: "error", stoppable: false }
        };
        break;
      default:
        return;
    }
    this.emit();
  }

  private appendAgentText(itemId: string, delta: string): void {
    const existing = this.state.messages.find((message) => message.id === itemId);
    if (existing === undefined) {
      this.state = {
        ...this.state,
        messages: [
          ...this.state.messages,
          {
            id: itemId,
            role: "assistant",
            createdAt: Date.now(),
            parts: [{ kind: "text", text: delta }]
          }
        ]
      };
      return;
    }
    this.state = {
      ...this.state,
      messages: this.state.messages.map((message) =>
        message.id === itemId
          ? {
              ...message,
              parts: message.parts.map((part) =>
                part.kind === "text" ? { ...part, text: part.text + delta } : part
              )
            }
          : message
      )
    };
  }

  private finalizeAgentText(item: Record<string, unknown>): void {
    const itemId = typeof item.id === "string" ? item.id : null;
    const text = typeof item.text === "string" ? item.text : null;
    if (itemId === null || text === null) return;
    const existing = this.state.messages.find((message) => message.id === itemId);
    if (existing === undefined) {
      this.state = {
        ...this.state,
        messages: [
          ...this.state.messages,
          {
            id: itemId,
            role: "assistant",
            createdAt: Date.now(),
            parts: [{ kind: "text", text }]
          }
        ]
      };
      return;
    }
    this.state = {
      ...this.state,
      messages: this.state.messages.map((message) =>
        message.id === itemId
          ? { ...message, parts: [{ kind: "text", text }] }
          : message
      )
    };
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
