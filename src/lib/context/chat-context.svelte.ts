// @/src/lib/hooks/chat-context.svelte.ts
import { goto, replaceState } from "$app/navigation";
import type { ChatThread } from "$lib/types/chat-types";
import type { AuthUser } from "$lib/types/auth-types";
import type {
  AgentWorkflow,
  xUIMessage,
  xUIMessagePart,
  StreamDataPart,
} from "$lib/types/chat-types";
import { Chat } from "@ai-sdk/svelte";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls, lastAssistantMessageIsCompleteWithApprovalResponses, type ChatStatus } from "ai";
import { getContext, setContext } from "svelte";
import { ChatHistory } from "./chat-history.svelte";
import type { ClassSection } from "$lib/types/result-types";
import type { ClassStudent } from "$lib/server/repository/student.repo";

import { SelectedClass, SelectedModel } from "./sync.svelte";
import { ThreadData, deriveDocumentId, deriveInitialTitle, getDocumentStream, patchDocumentStream, type DocumentStreamEntry } from "./thread-data.svelte";
import type { LanguageModelUsage } from "$lib/components/ai-elements/context/context-context.svelte.js";
import { categorizeAIError, type FriendlyAiError } from "$lib/errors/friendly-ai-error";
import { InspectorContext } from "./inspector-context.svelte";

const CHAT_CONTEXT_KEY = Symbol("chat-context");
const CHAT_USAGE_KEY = Symbol("chat-usage-state");
const CHAT_RATELIMIT_KEY = Symbol("chat-ratelimit-state");

/**
 * Tracks cumulative token usage across the conversation. Updated from the
 * stream's `onFinish` callback (end-of-message) and from `data-usage` parts.
 * Exposed via context so the ChatComposer can render the context indicator.
 */
export class ChatUsageState {
  #value = $state<LanguageModelUsage>({
    inputTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    cachedInputTokens: 0
  });

  get value(): LanguageModelUsage {
    return this.#value;
  }

  accumulate(usage: Partial<LanguageModelUsage> | null | undefined): void {
    if (!usage) return;
    this.#value = {
      inputTokens: (this.#value.inputTokens ?? 0) + (usage.inputTokens ?? 0),
      outputTokens: (this.#value.outputTokens ?? 0) + (usage.outputTokens ?? 0),
      reasoningTokens: (this.#value.reasoningTokens ?? 0) + (usage.reasoningTokens ?? 0),
      cachedInputTokens: (this.#value.cachedInputTokens ?? 0) + (usage.cachedInputTokens ?? 0)
    };
  }

  reset(): void {
    this.#value = {
      inputTokens: 0,
      outputTokens: 0,
      reasoningTokens: 0,
      cachedInputTokens: 0
    };
  }

  setContext(): void {
    setContext(CHAT_USAGE_KEY, this);
  }

  static fromContext(): ChatUsageState {
    const existing = getContext<ChatUsageState>(CHAT_USAGE_KEY);
    if (existing) return existing;
    return new ChatUsageState();
  }
}

export const chatUsage = new ChatUsageState();
export interface ActiveRateLimit {
  providerId: string;
  retryAfterSeconds: number;
  resetAt: string;
  startedAt: number;
}

export class RateLimitState {
  #active = $state<ActiveRateLimit | null>(null);

  get active(): ActiveRateLimit | null {
    return this.#active;
  }

  set active(v: ActiveRateLimit | null) {
    this.#active = v;
  }

  start(providerId: string, retryAfterSeconds: number, resetAt: string): void {
    this.#active = {
      providerId,
      retryAfterSeconds,
      resetAt,
      startedAt: Date.now()
    };
  }

  clear(): void {
    this.#active = null;
  }

  setContext(): void {
    setContext(CHAT_RATELIMIT_KEY, this);
  }

  static fromContext(): RateLimitState {
    const existing = getContext<RateLimitState>(CHAT_RATELIMIT_KEY);
    if (existing) return existing;
    // Fallback for components rendered outside the chat layout (e.g. the
    // root +layout.svelte that mounts the settings modal). Returns a
    // zero-state holder; the consumer should not rely on it being the
    // shared instance.
    return new RateLimitState();
  }
}

/** Shared singleton — kept for symmetry with `chatUsage`. */
export const rateLimit = new RateLimitState();

export type MentionPayload = {
  category: string;
  id: number;
  name: string;
  parentContext?: string;
};

export type InitChat = {
  initialMessages?: xUIMessage[];
  api?: string;
  chatData?: ChatThread;
  chatId?: string;
  selectedClass: SelectedClass;
};

/**
 * Ordered per-block durations (seconds) for an assistant message.
 * Reads the single durable `data-reasoningMeta` part written after the stream
 * lands. Messages without this part (older turns or failed persists) get no
 * measured duration and fall back to static "Thought for a few seconds" copy.
 */
function getReasoningDurations(parts: xUIMessagePart[]): number[] {
  for (const p of parts) {
    if (p.type !== 'data-reasoningMeta') continue;
    const raw = (p as { data?: { durations?: unknown } }).data?.durations;
    if (!Array.isArray(raw)) continue;
    return raw.filter(
      (d): d is number => typeof d === 'number' && Number.isFinite(d) && d >= 0
    );
  }
  return [];
}

export class ChatContext {
  // Reactive state using Svelte 5 runes
  user = $state<AuthUser | undefined>(undefined);
  studentData = $state<ClassStudent | undefined>(undefined);
  usage: ChatUsageState | undefined = undefined;
  rateLimit: RateLimitState | undefined = undefined;
  /** Structured, UI-ready error from the last failed turn. Drives the
   *  inline `<ErrorAlert>` rendered next to the failed assistant message. */
  lastError = $state<FriendlyAiError | null>(null);
  openPanel = $state<boolean>(false);

  get error() {
    return this.client?.error;
  }
  get runInfo(): { runId: string } | null {
    return this.threadData.runInfo;
  }
  pendingMentions = $state<MentionPayload[]>([]);
  fileReferences = $state<
    {
      key: string;
      name: string;
      type: "file" | "dir";
      mimeType?: string;
      fileId?: string;
      contentHash?: string;
    }[]
  >([]);
  #selectedModel = SelectedModel.fromContext();
  get modelOverride() {
    return this.#selectedModel.value;
  }

  // Chat properties
  client: Chat<xUIMessage>;
  messages: xUIMessage[];
  lastMessage?: xUIMessage;
  parts?: xUIMessagePart[];
  status: ChatStatus;
  threadData: ThreadData;
  get chatData() {
    return this.threadData.chatData;
  }
  set chatData(v) {
    this.threadData.chatData = v;
  }
  chatHistory = ChatHistory.fromContext();
  #selectedClass: SelectedClass;
  #inspector: InspectorContext | undefined;
  #autoOpenedToolCallIds = new Set<string>();
  #streamDocumentPartsReceived = 0;
  // #selectedAgent removed

  constructor({ initialMessages, api, chatData, chatId, selectedClass }: InitChat) {
    try {
      this.#inspector = InspectorContext.fromContext();
    } catch { }

    this.usage = new ChatUsageState();
    this.usage.setContext();
    // Reset cumulative usage when (re)constructing the chat context
    chatUsage.reset();

    this.rateLimit = new RateLimitState();
    this.rateLimit.setContext();
    // Wipe any active rate limit from a previous chat context so the banner
    // doesn't bleed across chat switches.
    rateLimit.clear();

    const effectiveId = chatId ?? chatData?.threadId;
    this.client = $derived(
      new Chat<xUIMessage>({
        id: effectiveId,
        messages: initialMessages,
        sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
        transport: new DefaultChatTransport({
          api,
          prepareSendMessagesRequest: this.#prepareSendMessagesRequest.bind(this),
        }),
        onFinish: this.#onFinish.bind(this),
        onData: this.#onData.bind(this),
        onError: this.#onError.bind(this),
        onToolCall: this.#onToolCall.bind(this),
      }),
    );

    this.threadData = $state(new ThreadData(chatData));
    this.status = $derived(this.client.status);
    this.messages = $derived(this.client?.messages ?? []);
    this.lastMessage = $derived(this.messages.at(-1));
    this.#selectedClass = selectedClass;
  }

  get selectedClass() {
    return this.#selectedClass.data;
  }

  set selectedClass(v: ClassSection | null) {
    this.#selectedClass.data = v;
  }

  get loading() {
    return this.status === "streaming" || this.status === "submitted";
  }

  #prepareSendMessagesRequest = ({ messages, id }: { messages: xUIMessage[]; id?: string }) => {
    this.threadData.resetReceived();
    this.lastError = null;
    const api = "/api/chat";
    const body: Record<string, any> = {
      messages,
      threadId: id,
      data: this.studentData as any,
      selectedClass: this.selectedClass,
      modelOverride: this.modelOverride,
      fileReferences: this.fileReferences.length > 0 ? [...this.fileReferences] : undefined,
    };

    if (this.pendingMentions.length > 0) {
      body.mentions = this.pendingMentions;
      this.pendingMentions = [];
    }
    if (this.fileReferences.length > 0) {
      this.fileReferences = [];
    }

    return { body, api };
  };

  #onFinish = async (msg: { message: { metadata?: Record<string, unknown> } } | undefined) => {
    if (msg?.message?.metadata) {
      chatUsage.accumulate(msg.message.metadata as Partial<LanguageModelUsage>);
    }

    this.rateLimit?.clear();
    this.lastError = null;
    if (this.chatData?.threadId) {
      const targetPath = `/chat/${this.chatData.threadId}`;

      if (!this.threadData.receivedDataChat) {
        return;
      }

      if (window.location.pathname === targetPath) {
        return;
      }
      goto(targetPath, {
        replaceState: true,
      });
    }
  };

  #onData = (part: StreamDataPart) => {
    this.threadData.handlePart(part)

    switch (part.type) {
      case "data-usage":
        let usage = (part as { data?: LanguageModelUsage }).data;
        chatUsage.accumulate(usage);
        break;
      case "data-rateLimit":
        let rateLimitData = (part as {
          data?: { providerId: string; retryAfterSeconds: number; resetAt?: string };
        }).data;
        if (rateLimitData?.providerId && typeof rateLimitData.retryAfterSeconds === "number") {
          const resetAt =
            rateLimitData.resetAt ?? new Date(Date.now() + rateLimitData.retryAfterSeconds * 1000).toISOString();
          this.rateLimit?.start(rateLimitData.providerId, rateLimitData.retryAfterSeconds, resetAt);
          rateLimit.start(rateLimitData.providerId, rateLimitData.retryAfterSeconds, resetAt);
        }
        break;
      case "data-error":
        // Server-categorized error. Trust the discriminator; only re-categorize
        // if the data isn't a FriendlyAiError (defense-in-depth).
        const data = (part as { data?: FriendlyAiError | { kind: string } }).data;
        if (data && typeof data === "object" && "kind" in data) {
          this.lastError = data as FriendlyAiError;
        }
        break;
      case "data-streamDocument":
        const d = (part as { data?: { documentId?: string; phase?: 'start' | 'delta' | 'end'; delta?: string } }).data;
        this.#streamDocumentPartsReceived++;
        if (!d?.documentId) return;
        if (d.phase !== 'delta' || typeof d.delta !== 'string') return;
        const prev = getDocumentStream(d.documentId);
        patchDocumentStream(d.documentId, {
          status: prev?.status === 'processing' ? 'streaming' : (prev?.status ?? 'streaming'),
          content: (prev?.content ?? '') + d.delta,
          deltaCount: (prev?.deltaCount ?? 0) + 1
        });
        if (!this.#autoOpenedToolCallIds.has(d.documentId)) {
          this.#autoOpenedToolCallIds.add(d.documentId);
          this.#inspector?.openChatArtifact(d.documentId);
        }
        break;

    }
  };

  #onError = (error: Error) => {
    // Categorize server-side / transport errors that didn't come through
    // a `data-error` stream part (initial connection failure, abort,
    // network drop). `chat.error` is also exposed for components that
    // prefer to read it directly.
    const target: unknown = (() => {
      try {
        return JSON.parse(error.message);
      } catch {
        return error;
      }
    })();
    this.lastError = categorizeAIError(target);
    console.error("[chat] error categorized", {
      kind: this.lastError.kind,
      name: (target as Error | null)?.name,
      message: (target as Error | null)?.message
    });
  };

  #onToolCall = ({ toolCall }: { toolCall: { dynamic?: boolean; toolName: string; toolCallId: string; input?: unknown } }) => {
    if (toolCall.toolName !== "streamDocument") return;
    const input = (toolCall.input ?? {}) as {
      contentHash?: string;
      fileName?: string;
    };
    const documentId = deriveDocumentId(input);
    patchDocumentStream(documentId, {
      format: 'marksheet',
      title: input.fileName ? deriveInitialTitle(input.fileName) : 'Document',
      ...(input.fileName !== undefined ? { fileName: input.fileName } : {}),
      status: 'processing',
      content: '',
      deltaCount: 0
    });
  };

  scrollToBottom = () => {
    // implement smooth scroll to bottom
    const container = document.querySelector(".conversation-container");
    if (container) {
      container.scrollTo({
        top: container.scrollHeight,
        behavior: "smooth",
      });
    }
  };

  /**
   * Maps each `reasoning` UI part index → durable duration (seconds).
   *
   * Prefers `data-reasoningMeta.durations` (ordered by occurrence). Falls back
   * to legacy per-block `data-reasoning` done parts when meta is absent so
   * older threads still show measured times when they were successfully saved.
   */
  buildReasoningDurationMap = (parts: xUIMessagePart[]): Map<number, number> => {
    const map = new Map<number, number>();
    const durations = getReasoningDurations(parts);
    if (durations.length === 0) return map;

    let i = 0;
    parts.forEach((p, idx) => {
      if (p.type !== 'reasoning') return;
      const d = durations[i++];
      if (typeof d === 'number' && Number.isFinite(d) && d >= 0) {
        map.set(idx, d);
      }
    });
    return map;
  };


  setContext = () => {
    setContext(CHAT_CONTEXT_KEY, this);
  };

  static fromContext(): ChatContext {
    return getContext<ChatContext>(CHAT_CONTEXT_KEY);
  }
}

export function useChat(): ChatContext {
  return ChatContext.fromContext();
}
