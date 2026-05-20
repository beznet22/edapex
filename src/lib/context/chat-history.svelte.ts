import { goto } from "$app/navigation";
import { page } from "$app/state";
import { deleteChat, getHistory, updateVisibility } from "$lib/api/chat.remote";
import type { ChatVisibility } from "$lib/schema/chat-schema";
import type { DBChat } from "$lib/types/chat-types";
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

  constructor(chatsInput: DBChat[] | Promise<DBChat[]>) {
    this.rehydrate(chatsInput);
  }

  rehydrate(chatsInput: DBChat[] | Promise<DBChat[]>) {
    this.#loading = true;
    this.#revalidating = true;
    
    if (chatsInput && typeof (chatsInput as any).then === "function") {
      const fetchPromise = chatsInput as Promise<DBChat[]>;
      
      // 10s timeout — fall back to empty state on storage error or timeout (Req 24.7)
      const timeoutPromise = new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error('Storage timeout')), 10000)
      );

      Promise.race([fetchPromise, timeoutPromise])
        .then((chats) => {
          this.chats = (chats as DBChat[]) || [];
        })
        .catch(() => {
          // Fall back to empty state on error or timeout — don't show error to user
          this.chats = [];
        })
        .finally(() => {
          this.#loading = false;
          this.#revalidating = false;
        });
    } else {
      this.chats = (chatsInput as DBChat[]) || [];
      this.#loading = false;
      this.#revalidating = false;
    }
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

    // Optimistic UI update for immediate reactivity
    const previousChats = this.chats;
    this.chats = this.chats.filter((chat) => chat.id !== chatId);
    this.alertDialogOpen = false;

    if (chatId === page.params.chatId) {
      goto("/");
    }

    const deletePromise = deleteChat({ chatId });
    toast.promise(deletePromise, {
      loading: "Deleting chat...",
      success: () => {
        this.refetch();
        return "Chat deleted successfully";
      },
      error: () => {
        // Revert optimistic update on error
        this.chats = previousChats;
        return "Failed to delete chat";
      },
    });
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
      const timeoutPromise = new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error('Storage timeout')), 10000)
      );
      const chats = await Promise.race([getHistory({}), timeoutPromise]);
      if (!chats) return;
      this.chats = chats as DBChat[];
    } catch {
      // Fall back to empty state on error or timeout (Req 24.7)
      this.chats = [];
    } finally {
      this.#revalidating = false;
    }
  }

  addChat(chat: DBChat) {
    this.chats = [chat, ...this.chats];
  }

  /**
   * Upsert a chat into the sidebar list:
   * - If the thread ID is NOT in the list → prepend to top (length +1)
   * - If the thread ID IS already in the list → update title in place (no duplicate, same length)
   */
  upsertChat(chat: DBChat) {
    const existingIndex = this.chats.findIndex((c) => c.id === chat.id);
    if (existingIndex === -1) {
      // New thread: prepend to top
      this.chats = [chat, ...this.chats];
    } else {
      // Existing thread: update title in place
      this.chats[existingIndex] = { ...this.chats[existingIndex], title: chat.title };
    }
  }

  static fromContext(): ChatHistory {
    return getContext(contextKey);
  }
}
