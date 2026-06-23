// @/src/lib/hooks/chat-context.svelte.ts
import { goto, replaceState } from "$app/navigation";
import type { ChatThread } from "$lib/types/chat-types";
import type { AuthUser } from "$lib/types/auth-types";
import type {
  AgentWorkflow,
  CreateDocumentPart,
  GeneratePDFPart,
  xUIMessage,
  xUIMessagePart,
  StreamDataPart,
} from "$lib/types/chat-types";
import { Chat } from "@ai-sdk/svelte";
import { DefaultChatTransport, type ChatStatus } from "ai";
import { getContext, setContext } from "svelte";
import { ChatHistory } from "./chat-history.svelte";
import type { ClassSection } from "$lib/types/result-types";
import type { ClassStudent } from "$lib/server/repository/student.repo";

import { SelectedClass, SelectedModel } from "./sync.svelte";
import { ThreadData } from "./thread-data.svelte";
import type { LanguageModelUsage } from "$lib/components/ai-elements/context/context-context.svelte.js";
import { categorizeAIError, type FriendlyAiError } from "$lib/errors/friendly-ai-error";

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
		// Fallback for components rendered outside the chat layout (e.g. the
		// root +layout.svelte that mounts the settings modal). Returns a
		// zero-state holder; the consumer should not rely on it being the
		// shared instance.
		return new ChatUsageState();
	}
}

/** Shared singleton used by the indicator + accumulator without a context lookup. */
export const chatUsage = new ChatUsageState();

/**
 * Tracks the active rate limit surfaced by the workflow's auto-retry loop.
 * Updated from the stream's `data-rateLimit` parts and cleared on
 * `#onFinish` so the banner only persists for the in-flight message.
 * Per-chat-context (see `setContext` in the chat context constructor), with
 * a module-level singleton kept for symmetry with `chatUsage` — components
 * should prefer `RateLimitState.fromContext()` so they read the active
 * chat's state.
 */
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

export type PendingGateOption = {
  id: string;
  label: string;
  icon?: string;
};

export type PendingGate = {
  runId: string;
  stepId: string;
  question: string;
  options: PendingGateOption[];
  allowFreeText: boolean;
};

export type InitChat = {
  initialMessages?: xUIMessage[];
  api?: string;
  chatData?: ChatThread;
  selectedClass: SelectedClass;
};

export class ChatContext {
  // Reactive state using Svelte 5 runes
  user = $state<AuthUser | undefined>(undefined);
  studentData = $state<ClassStudent | undefined>(undefined);
  usage: ChatUsageState | undefined = undefined;
  rateLimit: RateLimitState | undefined = undefined;
  /** Structured, UI-ready error from the last failed turn. Drives the
   *  inline `<ErrorAlert>` rendered next to the failed assistant message. */
  lastError = $state<FriendlyAiError | null>(null);
  openedDocumentId = $state<string | undefined>(undefined);
  openPanel = $state<boolean>(false);
  docPart = $state<CreateDocumentPart | GeneratePDFPart | undefined>(undefined);
  docState = $derived(this.docPart?.status);
  get error() {
    return this.client?.error;
  }
  get activeWorkflows() {
    return this.threadData.activeWorkflows;
  }
  set activeWorkflows(v) {
    this.threadData.activeWorkflows = v;
  }
  get pendingConfirmation() {
    return this.threadData.pendingConfirmation;
  }
  set pendingConfirmation(v) {
    this.threadData.pendingConfirmation = v;
  }
  get runInfo(): { runId: string } | null {
    return this.threadData.runInfo;
  }
  get awaitingValidation(): string | null {
    return this.threadData.pendingAwaitingValidation;
  }
  pendingMentions = $state<MentionPayload[]>([]);
  pendingGate = $state<PendingGate | null>(null);
  /** workflow runId from data-runInfo (set by chat route prepend) */
  activeRunId = $state<string | null>(null);
  /** artifactId currently in validation flow (set by data-awaitValidation) */
  pendingValidationArtifactId = $state<string | null>(null);
  /** validation errors (set by data-validationErrors) */
  pendingValidationErrors = $state<{ artifactId: string; errors: Array<{ path: string; message: string }> } | null>(null);
  /** last validation outcome (set by data-validationResult) */
  lastValidationOutcome = $state<{ artifactId: string; status: 'success' | 'errors' } | null>(null);
  /** last committed artifact (set by data-committed) — persists for chat lifetime per D15 */
  lastCommittedArtifactId = $state<string | null>(null);
  /** per-keystroke edit tracking for ValidateFab mode derivation */
  editContent = $state<string>('');
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
  // #selectedAgent removed

  constructor({ initialMessages, api, chatData, selectedClass }: InitChat) {
    this.usage = new ChatUsageState();
    this.usage.setContext();
    // Reset cumulative usage when (re)constructing the chat context
    chatUsage.reset();

    this.rateLimit = new RateLimitState();
    this.rateLimit.setContext();
    // Wipe any active rate limit from a previous chat context so the banner
    // doesn't bleed across chat switches.
    rateLimit.clear();

    this.client = $derived(
      new Chat<xUIMessage>({
        id: chatData?.threadId,
        messages: initialMessages,
        transport: new DefaultChatTransport({
          api,
          prepareSendMessagesRequest: this.#prepareSendMessagesRequest.bind(this),
        }),
        onFinish: this.#onFinish.bind(this),
        onData: this.#onData.bind(this),
        onError: this.#onError.bind(this),
      }),
    );

    this.threadData = new ThreadData(chatData);
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
    // Reset the data-chat received flag at the start of each new stream
    this.threadData.resetReceived();
    // Clear any prior turn's error so a new send doesn't render the old alert
    this.lastError = null;
    // Clear any pending gate from a prior turn so the ActionBar doesn't
    // linger on the new stream (it represents a previous suspended workflow).
    this.pendingGate = null;

    const api = "/api/chat";
    const lastMessage = messages.at(-1);

    const body: Record<string, any> = {
      messages: this.user ? [lastMessage] : messages,
      threadId: id,
      data: this.studentData as any,
      selectedClass: this.selectedClass,
      modelOverride: this.modelOverride,
      fileReferences: this.fileReferences.length > 0 ? [...this.fileReferences] : undefined,
    };

    // Include @mention tags if any were selected for this message
    if (this.pendingMentions.length > 0) {
      body.mentions = this.pendingMentions;
      this.pendingMentions = [];
    }

    // Clear file references after capturing them in the payload
    if (this.fileReferences.length > 0) {
      this.fileReferences = [];
    }

    return { body, api };
  };

  #onFinish = async (msg: { message: { metadata?: Record<string, unknown> } } | undefined) => {
    // Accumulate token usage from the finished message's metadata
    if (msg?.message?.metadata) {
      chatUsage.accumulate(msg.message.metadata as Partial<LanguageModelUsage>);
    }

    this.rateLimit?.clear();
    this.lastError = null;

    this.activeWorkflows = [];
    this.pendingConfirmation = null;
    this.pendingGate = null;

    // Only navigate if we have a valid chatId AND conditions require it:
    // - Skip goto() if no data-chat event was received during stream (URL was already correct)
    // - Skip goto() if replaceState already updated the URL to /chat/[chatId]
    // - Otherwise call goto() (e.g., user navigated away during stream)
    if (this.chatData?.threadId) {
      const targetPath = `/chat/${this.chatData.threadId}`;

      if (!this.threadData.receivedDataChat) {
        // No data-chat event received — URL was already correct before stream started
        return;
      }

      if (window.location.pathname === targetPath) {
        // replaceState already handled the URL update — skip to avoid duplicate history entry
        return;
      }

      // URL doesn't match (user navigated away during stream) — redirect back
      goto(targetPath, {
        replaceState: true,
      });
    }
  };

  #onData = (part: StreamDataPart) => {
    this.threadData.handlePart(part);
    // Accumulate usage from streamed `data-usage` parts emitted by the
    // workflow's assistant-step onFinish. End-of-message guarantee matches
    // the user's preference (no live-streaming counts).
    if (part.type === "data-usage") {
      const data = (part as { data?: LanguageModelUsage }).data;
      chatUsage.accumulate(data);
    } else if (part.type === "data-rateLimit") {
      const data = (part as {
        data?: { providerId: string; retryAfterSeconds: number; resetAt?: string };
      }).data;
      if (data?.providerId && typeof data.retryAfterSeconds === "number") {
        const resetAt =
          data.resetAt ?? new Date(Date.now() + data.retryAfterSeconds * 1000).toISOString();
        this.rateLimit?.start(data.providerId, data.retryAfterSeconds, resetAt);
        rateLimit.start(data.providerId, data.retryAfterSeconds, resetAt);
      }
    } else if (part.type === "data-error") {
      // Server-categorized error. Trust the discriminator; only re-categorize
      // if the data isn't a FriendlyAiError (defense-in-depth).
      const data = (part as { data?: FriendlyAiError | { kind: string } }).data;
      if (data && typeof data === "object" && "kind" in data) {
        this.lastError = data as FriendlyAiError;
      }
    } else if (part.type === "data-selectOption") {
      const data = (part as { data?: { options?: PendingGateOption[]; promptText?: string; runId?: string; stepId?: string } }).data;
      if (data?.options && data.promptText && data.runId && data.stepId) {
        this.pendingGate = {
          runId: data.runId,
          stepId: data.stepId,
          question: data.promptText,
          options: data.options,
          allowFreeText: true
        };
      }
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

  getDocumentPart = () => {
    if (this.docPart) return this.docPart;
    this.docPart = this.messages
      .flatMap((m) => m.parts ?? [])
      .filter(
        (p) =>
          (p.type === "data-createDocument" || p.type === "data-generatePDF") &&
          p.id === this.openedDocumentId,
      )
      .findLast(
        (p) => p.type === "data-createDocument" || p.type === "data-generatePDF",
      )?.data;

    return this.docPart;
  };

  setDocumentPart = (id?: string) => {
    if (!id) return;
    return (e: MouseEvent) => {
      e.preventDefault();
      this.docPart = this.messages
        .flatMap((m) => m.parts ?? [])
        .filter(
          (p) =>
            (p.type === "data-createDocument" || p.type === "data-generatePDF") &&
            p.id === id,
        )
        .findLast(
          (p) => p.type === "data-createDocument" || p.type === "data-generatePDF",
        )?.data;
      this.openedDocumentId = id;
    };
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

  setPendingGate = (gate: PendingGate | null): void => {
    this.pendingGate = gate;
  };

  resumePendingGate = (selection: { selectedOptionId: string; freeTextAnswer?: string }): void => {
    const gate = this.pendingGate;
    if (!gate) return;
    this.client.sendMessage(
      { text: "" },
      {
        body: {
          runId: gate.runId,
          stepId: gate.stepId,
          resumeData: {
            selectedOptionId: selection.selectedOptionId,
            freeTextAnswer: selection.freeTextAnswer,
          },
        },
      },
    );
    this.pendingGate = null;
  };

  resumeWorkflow(artifactId: string): void {
    if (!this.activeRunId) {
      console.warn('[ChatContext] resumeWorkflow called but activeRunId is not set');
      return;
    }
    if (!artifactId) {
      console.warn('[ChatContext] resumeWorkflow called with empty artifactId');
      return;
    }
    this.pendingValidationArtifactId = artifactId;

    this.client.sendMessage(
      { text: '' },
      {
        body: {
          threadId: this.chatData?.threadId,
          runId: this.activeRunId,
          step: 'awaitValidation',
          resumeData: { artifactId },
          selectedClass: this.selectedClass,
          mentions: [],
          fileReferences: []
        }
      }
    );
  }

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
