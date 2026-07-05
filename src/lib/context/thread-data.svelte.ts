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
 * Derives a deterministic documentId from the workflow input. Mirrors
 * `deriveDocumentId` in src/lib/server/mastra/workflows/document-stream.ts
 * — both client and server produce the same key for the same input, so
 * `data-streamDocument` chunks (server) and tool-part inputs (client)
 * reconcile without needing a toolCallId round-trip.
 *
 * Marksheet key is contentHash-based (one OCR upload → one document).
 * Transcript key is studentId + academicId (one student × term → one document).
 */
export function deriveDocumentId(input: {
  format?: 'marksheet' | 'transcript';
  contentHash?: string;
  studentId?: number;
  academicId?: number;
}): string {
  if (input.format === 'transcript') {
    return `transcript-${input.studentId ?? 'unknown'}-${input.academicId ?? 'active'}`;
  }
  return `marksheet-${input.contentHash ?? 'unknown'}`;
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
  /**
   * Per-document transient streaming state, keyed by toolCallId (the
   * same id used as `documentId` in `data-streamDocument` parts — the
   * server stamps it deterministically from the workflow input).
   * Holds only streaming transient state; final metadata lives on the
   * tool part in chat.messages. See `DocumentStreamEntry` for shape.
   */
  documentStreams = $state<Record<string, DocumentStreamEntry>>({});
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

  /**
   * Returns the streaming entry for a given toolCallId, or null if no
   * stream is registered for that id. Consumers (chat.svelte's inline
   * Shimmer card, ArtifactViewer's streaming Markdown) read this through
   * $derived so they react to content accumulation and status transitions.
   */
  getDocumentStream(toolCallId: string): DocumentStreamEntry | null {
    return this.documentStreams[toolCallId] ?? null;
  }

  /**
   * Idempotent patch — merges with the previous entry (or a sensible
   * default) and reassigns the $state so Svelte 5 reactivity fires.
   * Use for accumulating streaming content, transitioning status,
   * and setting initial title/format/fileName.
   */
  patchDocumentStream(toolCallId: string, patch: Partial<DocumentStreamEntry>): void {
    const prev = this.documentStreams[toolCallId];
    if (prev) {
      this.documentStreams = {
        ...this.documentStreams,
        [toolCallId]: { ...prev, ...patch }
      };
      return;
    }
    const fallback: DocumentStreamEntry = {
      toolCallId,
      format: patch.format ?? 'marksheet',
      title: patch.title ?? 'Document',
      status: patch.status ?? 'processing',
      content: patch.content ?? '',
      deltaCount: patch.deltaCount ?? 0,
      ...(patch.fileName !== undefined ? { fileName: patch.fileName } : {})
    };
    this.documentStreams = {
      ...this.documentStreams,
      [toolCallId]: fallback
    };
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

    if (part.type === "data-streamDocument") {
      this.#handleStreamDocument(part.data);
    }
  }

  /**
   * Accumulates `data-streamDocument` deltas into `documentStreams`.
   * `phase: 'delta'` appends the delta text and increments deltaCount.
   * `phase: 'start'` and `phase: 'end'` are no-ops — the entry is
   * initialized by chat-context.svelte.ts's `#onToolCall`, and the final
   * status transition comes from `toolPart.state` (read directly in
   * ArtifactViewer's $derived.by). The auto-open of the workspace panel
   * fires from chat-context.svelte.ts's `#onData` on the first 'delta'
   * arrival — not from here — so this handler only mutates state.
   */
  #handleStreamDocument(data: { documentId: string; format: 'marksheet' | 'transcript'; phase?: 'start' | 'delta' | 'end'; delta: string }): void {
    if (!data?.documentId || typeof data.delta !== 'string') return;
    if (data.phase !== 'delta') return;
    const prev = this.documentStreams[data.documentId];
    this.patchDocumentStream(data.documentId, {
      status: prev?.status === 'processing' ? 'streaming' : (prev?.status ?? 'streaming'),
      content: (prev?.content ?? '') + data.delta,
      deltaCount: (prev?.deltaCount ?? 0) + 1
    });
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
