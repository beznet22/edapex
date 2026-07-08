import { replaceState } from "$app/navigation";
import type { ChatThread, StreamDataPart } from "$lib/types/chat-types";
import { toast } from "svelte-sonner";
import { ChatHistory } from "./chat-history.svelte";

/**
 * Transient per-document streaming status. The lifecycle is:
 *   'processing' — tool call received, no streaming chunks yet
 *   'streaming'  — at least one data-streamDocument delta has arrived
 *   'success'    — tool returned output-available (mirrored from toolPart.state; may also be set directly)
 *   'error'      — tool returned output-error
 *
 * NOTE: 'success' and 'error' come from toolPart.state (read in ArtifactViewer),
 * but we keep the union complete so chat-context.svelte.ts can patch any state
 * if needed.
 */
export type DocumentStreamStatus = 'processing' | 'streaming' | 'success' | 'error';

/**
 * Per-document streaming entry held in `documentStreams`. Holds ONLY transient
 * streaming state (accumulated markdown + initial title + coarse status).
 * Final artifact metadata (artifactId, filePath, contentHash, studentId,
 * errorText) lives on the tool part in chat.messages — it is read directly
 * from there via $derived.by in ArtifactViewer. Do NOT add metadata fields
 * here; that would create a dual source of truth.
 */
export type DocumentStreamEntry = {
  toolCallId: string;
  format: 'marksheet' | 'transcript';
  title: string;
  fileName?: string;
  status: DocumentStreamStatus;
  content: string;
  deltaCount: number;
};

/**
 * Derives a deterministic documentId from the marksheet tool input. Mirrors
 * `deriveDocumentId` in src/lib/server/mastra/tools/operations/reporting/stream-document.ts
 * — both client and server produce the same key for the same contentHash,
 * so `data-streamDocument` chunks (server) and tool-part inputs (client)
 * reconcile without needing a toolCallId round-trip.
 */
export function deriveDocumentId(input: { contentHash?: string }): string {
  return `marksheet-${input.contentHash ?? 'unknown'}`;
}

/**
 * Derives the working title from the uploaded filename. Strips the last
 * extension and sanitizes special characters to produce a filesystem-safe
 * display name (e.g., "adakole.jpg.jpeg" → "adakole"). Mirrors the title
 * derivation in `stream-document.ts`'s `deriveInitialFilename` so the
 * streaming entry's title (set in `#onToolCall`) matches the tool output's
 * `title` field — important so ShimmerArtifactCard shows the same title
 * during streaming as ArtifactViewer does after streaming completes.
 */
export function deriveInitialTitle(fileName: string): string {
  const baseName = fileName.replace(/\.[^.]+$/, '');
  return baseName.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40);
}

/**
 * Module-level reactive document-stream store, keyed by toolCallId (= the
 * server's `documentId` from `data-streamDocument` parts).
 *
 * Lives at module scope — NOT on ChatContext, NOT on ThreadData — because
 * ArtifactViewer is mounted in WorkspaceSidebar (a sibling of SharedChatView,
 * both rendered by `(chat)/+layout.svelte`). Svelte's `setContext()` only
 * propagates down, so `useChat()` in ArtifactViewer returns undefined and
 * any state held on a context-provided instance is unreachable. A module-
 * level `$state` is a free export: any importer sees the same reactive
 * proxy regardless of component tree position.
 *
 * Write paths: `ChatContext.#onToolCall` (initial entry on tool-call),
 *              `ChatContext.#onData` (delta accumulation, status transition)
 * Read paths:  `chat.svelte`'s `inlineDocumentStreams` (Shimmer card),
 *              `ArtifactViewer`'s `entry` $derived.by (workspace panel)
 */
export const documentStreams = $state<Record<string, DocumentStreamEntry>>({});

/**
 * Read access for the streaming entry. Tracked via the module-level
 * `$state` proxy above; returns null when no stream is registered for
 * the given toolCallId.
 */
export function getDocumentStream(toolCallId: string): DocumentStreamEntry | null {
  return documentStreams[toolCallId] ?? null;
}

/**
 * Patch the streaming entry for `toolCallId`. Inserts a fresh entry
 * (status 'processing', empty content) when none exists; otherwise
 * merges the patch into the existing entry. The mutation targets the
 * proxy in place — Svelte 5's deep-reactive proxy tracks per-key reads
 * and triggers per-key writes.
 */
export function patchDocumentStream(
  toolCallId: string,
  patch: Partial<DocumentStreamEntry>
): void {
  const prev = documentStreams[toolCallId];
  if (prev) {
    documentStreams[toolCallId] = { ...prev, ...patch };
  } else {
    documentStreams[toolCallId] = {
      toolCallId,
      format: patch.format ?? 'marksheet',
      title: patch.title ?? 'Document',
      status: patch.status ?? 'processing',
      content: patch.content ?? '',
      deltaCount: patch.deltaCount ?? 0,
      ...(patch.fileName !== undefined ? { fileName: patch.fileName } : {})
    };
  }
}

export class ThreadData {
  chatData = $state<ChatThread | undefined>(undefined);
  receivedDataChat = $state(false);
  activeWorkflows = $state<{ id: string; name: string; status: string; steps?: any; output?: any }[]>([]);
  pendingConfirmation = $state<{
    type: "mutation" | "navigation";
    confidence: number;
    threshold: number;
    reasoning: string;
    originalMessage: string;
  } | null>(null);
  runInfo = $state<{ runId: string } | null>(null);
  pendingAwaitingValidation = $state<string | null>(null);
  pendingValidationErrors = $state<{ artifactId: string; errors: Array<{ path: string; message: string }> } | null>(null);
  lastValidationOutcome = $state<{ artifactId: string; status: 'success' | 'errors' } | null>(null);
  lastCommitted = $state<{ artifactId: string; recordId: number; studentName: string; className: string; term: string } | null>(null);
  noDocumentsMessage = $state<string | null>(null);
  chatHistory = ChatHistory.fromContext();
  #activeExamTypeId: number | null = null;
  #persistedKeys = new Map<string, string>();

  constructor(initialData?: ChatThread) {
    this.chatData = initialData;
  }

  setExamTypeId(examTypeId: number | null): void {
    this.#activeExamTypeId = examTypeId;
  }

  get examTypeId(): number | null {
    return this.#activeExamTypeId;
  }

  resetReceived() {
    this.receivedDataChat = false;
  }

  handlePart(part: StreamDataPart) {
    if (part.type === "data-threadCreated") {
      this.#handleThreadCreated(part.data);
    }

    if (part.type === "data-threadTitle") {
      this.#handleThreadTitle(part.data);
    }

    if (part.type === "data-workflow") {
      this.#handleWorkflow((part as any).id, part.data);
    }

    if (part.type === "data-confirmation") {
      this.#handleConfirmation(part.data);
    }

    if (part.type === "data-runInfo") {
      this.runInfo = part.data;
    }

    if (part.type === "data-awaitValidation") {
      this.pendingAwaitingValidation = part.data.artifactId;
    }

    if (part.type === "data-validationResult") {
      this.lastValidationOutcome = {
        artifactId: part.data.artifactId,
        status: part.data.status,
      };
    }

    if (part.type === "data-validationErrors") {
      this.pendingValidationErrors = {
        artifactId: part.data.artifactId,
        errors: part.data.errors,
      };
    }

    if (part.type === "data-committed") {
      this.lastCommitted = part.data;
      this.pendingAwaitingValidation = null;
      this.pendingValidationErrors = null;
    }

    if (part.type === "data-noDocuments") {
      this.noDocumentsMessage = part.data.message;
    }
  }

  #persistDocument(data: { id: string; title: string; content: string }) {
    if (this.#activeExamTypeId === null) {
      console.warn("ThreadData: no active examTypeId, skipping persist");
      return;
    }
    if (this.#persistedKeys.has(data.id)) return;
    const safeTitle = (data.title || "untitled").replace(/[^a-zA-Z0-9._-]/g, "_");
    const key = `exams/examType-${this.#activeExamTypeId}/${safeTitle}.md`;
    this.#persistedKeys.set(data.id, key);
    void fetch(`/api/file/${key}`, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: data.content,
    }).catch((err) => {
      console.error("Failed to persist document", err);
      this.#persistedKeys.delete(data.id);
    });
  }

  #handleCreateDocument(data: any) {
    if (data.status === "success" && data.content) {
      this.#persistDocument({ id: data.id, title: data.title, content: data.content });
      toast.success(`Document "${data.title}" created`);
      return;
    }

    if (data.status === "success" && !data.content) {
      console.log("Received empty document:", data.title);
      toast.success(`Document "${data.title}" created successfully`);
    }
  }

  #handleThreadCreated(data: ChatThread) {
    this.receivedDataChat = true;
    this.chatData = data;
    if (!this.chatData || !this.chatData.threadId) return;
    this.chatHistory.upsertChat(this.chatData);
    replaceState(`/chat/${this.chatData.threadId}`, {
      settings: { chatId: this.chatData?.threadId },
    });
  }

  #handleThreadTitle(data: { title: string }) {
    if (!this.chatData?.threadId) {
      console.error("Chat data not found");
      return;
    }
    const newChatData = {
      ...this.chatData,
      title: data.title,
    };

    this.chatData = newChatData;
    this.chatHistory.upsertChat(newChatData);
    this.chatHistory.refetch();
  }

  #handleWorkflow(id: string | undefined, data: any) {
    const entry = {
      id: id ?? data.name ?? crypto.randomUUID(),
      name: data.name,
      status: data.status,
      steps: data.steps,
      output: data.output,
    };
    const idx = this.activeWorkflows.findIndex((w) => w.id === entry.id);
    if (idx !== -1) {
      this.activeWorkflows[idx] = entry;
      this.activeWorkflows = [...this.activeWorkflows];
    } else {
      this.activeWorkflows = [...this.activeWorkflows, entry];
    }
  }

  #handleConfirmation(data: any) {
    this.pendingConfirmation = data;
  }
}
