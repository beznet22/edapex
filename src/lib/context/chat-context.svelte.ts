// @/src/lib/hooks/chat-context.svelte.ts
import { goto, replaceState } from "$app/navigation";
import type { DBChat } from "$lib/server/db/schema";
import type { AuthUser } from "$lib/types/auth-types";
import type {
  AgentWorkflow,
  CreateDocumentPart,
  xUIMessage,
  xUIMessagePart,
} from "$lib/types/chat-types";
import { Chat } from "@ai-sdk/svelte";
import { DefaultChatTransport, type ChatStatus } from "ai";
import { getContext, setContext } from "svelte";
import { toast } from "svelte-sonner";
import { ChatHistory } from "./chat-history.svelte";
import type { ClassSection } from "$lib/types/result-types";
import type { Student } from "$lib/schema/result-output";
import { page } from "$app/state";
import { localStore } from "$lib/utils";
import type { ClassStudent } from "$lib/server/repository/student.repo";

import { SelectedClass, SelectedAgent } from "./sync.svelte";

const CHAT_CONTEXT_KEY = Symbol("chat-context");

export type InitChat = {
  initialMessages?: xUIMessage[];
  api?: string;
  chatData?: DBChat;
  agents: AgentWorkflow[];
  selectedClass: SelectedClass;
  selectedAgent: SelectedAgent;
};

export class ChatContext {
  // Reactive state using Svelte 5 runes
  user = $state<AuthUser | undefined>(undefined);
  studentData = $state<ClassStudent | undefined>(undefined);
  openedDocumentId = $state<string | undefined>(undefined);
  openPanel = $state<boolean>(false);
  docPart = $state<CreateDocumentPart | undefined>(undefined);
  docState = $derived(this.docPart?.status);
  error = $state<Error | undefined>(undefined);

  // Chat properties
  agents: AgentWorkflow[];
  client: Chat<xUIMessage>;
  messages: xUIMessage[];
  lastMessage?: xUIMessage;
  parts?: xUIMessagePart[];
  status: ChatStatus;
  chatData?: DBChat;
  chatHistory = ChatHistory.fromContext();

  #selectedClass: SelectedClass;
  #selectedAgent: SelectedAgent;

  constructor({
    initialMessages,
    api,
    chatData,
    agents,
    selectedClass,
    selectedAgent,
  }: InitChat) {
    this.client = $derived(
      new Chat<xUIMessage>({
        id: chatData?.id,
        messages: initialMessages,
        transport: new DefaultChatTransport({
          api,
          prepareSendMessagesRequest: this.#prepareSendMessagesRequest.bind(this),
        }),
        onFinish: this.#onFinish.bind(this),
        onData: this.#onData.bind(this),
        onError: this.#onError.bind(this),
      })
    );

    this.chatData = $state(chatData);
    this.status = $derived(this.client.status);
    this.messages = $derived(this.client?.messages ?? []);
    this.lastMessage = $derived(this.messages.at(-1));
    this.agents = $state(agents);
    this.#selectedClass = selectedClass;
    this.#selectedAgent = selectedAgent;
  }

  get activeAgent() {
    const id = this.#selectedAgent.value;
    return this.agents.find((a) => a.id === id) || this.agents[0];
  }

  set activeAgent(v: AgentWorkflow | null) {
    this.#selectedAgent.value = v?.id || "";
  }

  get selectedClass() {
    return this.#selectedClass.data;
  }

  set selectedClass(v: ClassSection | null) {
    this.#selectedClass.data = v;
  }

  get loading() {
    return this.status === "ready" ? false : true;
  }

  #prepareSendMessagesRequest = ({ messages }: { messages: xUIMessage[] }) => {
    return {
      body: {
        messages: this.user ? [messages.at(-1)] : messages,
        chatId: this.chatData?.id,
        agentId: this.activeAgent?.id,
        data: this.studentData as any,
        selectedClass: this.selectedClass,
      },
    };
  };

  #onFinish = async () => {
    goto(`/chat/${this.chatData?.id}`, {
      replaceState: true,
    });
  };

  #onData = (part: any) => {
    if (part.type === "data-chat") {
      this.chatData = part.data;
      if (!this.chatData || !this.chatData.id) return;
      this.chatHistory.addChat(this.chatData);
      replaceState(`/chat/${this.chatData.id}`, {
        settings: { chatId: this.chatData?.id },
      });
    }

    if (part.type === "data-createDocument") {
      this.openedDocumentId = part.id;
      this.openPanel = part.data.status === "success" || part.data.status === "streaming";
      this.docPart = part.data;
    }
  };

  #onError = (error: Error) => {
    try {
      const jsonError = JSON.parse(error.message);
      if (typeof jsonError === "object" && jsonError !== null && "message" in jsonError) {
        toast.error(jsonError.message);
      } else {
        toast.error(error.message);
      }
    } catch {
      toast.error(error.message);
    }
  };

  getDocumentPart = () => {
    if (this.docPart) return this.docPart;
    this.docPart = this.messages
      .flatMap((m) => m.parts ?? [])
      .filter((p) => p.type === "data-createDocument" && p.id === this.openedDocumentId)
      .findLast((p) => p.type === "data-createDocument")?.data;

    return this.docPart;
  };

  setDocumentPart = (id?: string) => {
    if (!id) return;
    return (e: MouseEvent) => {
      e.preventDefault();
      this.docPart = this.messages
        .flatMap((m) => m.parts ?? [])
        .filter((p) => p.type === "data-createDocument" && p.id === id)
        .findLast((p) => p.type === "data-createDocument")?.data;
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
