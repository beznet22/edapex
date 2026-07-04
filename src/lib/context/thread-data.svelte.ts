import { replaceState } from "$app/navigation";
import type { ChatThread, StreamDataPart } from "$lib/types/chat-types";
import { toast } from "svelte-sonner";
import { ChatHistory } from "./chat-history.svelte";

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
