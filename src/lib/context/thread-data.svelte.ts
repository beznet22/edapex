import { replaceState } from "$app/navigation";
import type { ChatThread, StreamDataPart } from "$lib/types/chat-types";
import { ChatHistory } from "./chat-history.svelte";

export class ThreadData {
  chatData = $state<ChatThread | undefined>(undefined);
  receivedDataChat = $state(false);
  activeWorkflows = $state<{ tool: string, args: any }[]>([]);
  pendingConfirmation = $state<{
    type: 'mutation' | 'navigation';
    confidence: number;
    threshold: number;
    reasoning: string;
    originalMessage: string;
  } | null>(null);
  chatHistory = ChatHistory.fromContext();

  constructor(initialData?: ChatThread) {
    this.chatData = initialData;
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
      this.#handleWorkflow(part.data);
    }

    if (part.type === "data-confirmation") {
      this.#handleConfirmation(part.data);
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

  #handleWorkflow(data: any) {
    this.activeWorkflows = [...this.activeWorkflows, data];
  }

  #handleConfirmation(data: any) {
    this.pendingConfirmation = data;
  }
}
