import { goto } from "$app/navigation";
import { page } from "$app/state";
import { deleteChat, getHistory, updateVisibility } from "$lib/api/chat.remote";
import type { ChatVisibility } from "$lib/schema/chat-schema";
import type { DBChat } from "$lib/server/db/schema";
import { isToday, isYesterday, subMonths, subWeeks } from "date-fns";
import { getContext, setContext } from "svelte";
import { toast } from "svelte-sonner";

const contextKey = Symbol("ChatHistory");

type GroupedChats = {
  today: DBChat[];
  yesterday: DBChat[];
  lastWeek: DBChat[];
  lastMonth: DBChat[];
  older: DBChat[];
};

export class ChatHistory {
  #loading = $state(false);
  #revalidating = $state(false);
  chats = $state<DBChat[]>([]);
  alertDialogOpen = $state(false);

  get loading() {
    return this.#loading;
  }

  get revalidating() {
    return this.#revalidating;
  }

  constructor(chatsPromise: Promise<DBChat[]>) {
    this.#loading = true;
    this.#revalidating = true;
    chatsPromise
      .then((chats) => (this.chats = chats))
      .finally(() => {
        this.#loading = false;
        this.#revalidating = false;
      });
  }

  groupChatsByDate(chats: DBChat[]): GroupedChats {
    const now = new Date();
    const oneWeekAgo = subWeeks(now, 1);
    const oneMonthAgo = subMonths(now, 1);

    return chats.reduce(
      (groups, chat) => {
        const chatDate = new Date(chat.createdAt);

        if (isToday(chatDate)) {
          groups.today.push(chat);
        } else if (isYesterday(chatDate)) {
          groups.yesterday.push(chat);
        } else if (chatDate > oneWeekAgo) {
          groups.lastWeek.push(chat);
        } else if (chatDate > oneMonthAgo) {
          groups.lastMonth.push(chat);
        } else {
          groups.older.push(chat);
        }

        return groups;
      },
      {
        today: [],
        yesterday: [],
        lastWeek: [],
        lastMonth: [],
        older: [],
      } as GroupedChats
    );
  }

  async deleteChat(chatId?: string) {
    if (!chatId) return;
    const deletePromise = deleteChat({ chatId });
    toast.promise(deletePromise, {
      loading: "Deleting chat...",
      success: () => {
        this.chats = this.chats.filter((chat) => chat.id !== chatId);
        this.refetch();
        return "Chat deleted successfully";
      },
      error: "Failed to delete chat",
    });

    this.alertDialogOpen = false;
    if (chatId === page.params.chatId) {
      await goto("/");
    }
  }

  getChatDetails = (chatId: string) => {
    return this.chats.find((c) => c.id === chatId);
  };

  updateVisibility = async (chatId: string, visibility: ChatVisibility) => {
    const chat = this.chats.find((c) => c.id === chatId);
    if (chat) {
      chat.visibility = visibility;
    }
    const res = await updateVisibility({ chatId, visibility });
    if (!res.success) {
      toast.error("Failed to update chat visibility");
      // try reloading data from source in case another competing mutation caused an issue
      await this.refetch();
    }
  };

  setContext() {
    setContext(contextKey, this);
  }

  async refetch() {
    this.#revalidating = true;
    try {
      const chats = await getHistory({});
      if (!chats) return;
      this.chats = chats;
    } finally {
      this.#revalidating = false;
    }
  }

  addChat(chat: DBChat) {
    this.chats = [chat, ...this.chats];
  }

  static fromContext(): ChatHistory {
    return getContext(contextKey);
  }
}
