import { goto } from "$app/navigation";
import { page } from "$app/state";
import { deleteChat, getHistory, updateVisibility } from "$lib/api/chat.remote";
import type { ChatVisibility } from "$lib/schema/chat-schema";
import type { ChatThread } from "$lib/types/chat-types";
import { isToday, isYesterday, subMonths, subWeeks } from "date-fns";
import { getContext, setContext } from "svelte";
import { toast } from "svelte-sonner";

const contextKey = Symbol("ChatHistory");

type GroupedChats = {
  today: ChatThread[];
  yesterday: ChatThread[];
  lastWeek: ChatThread[];
  lastMonth: ChatThread[];
  older: ChatThread[];
};

export class ChatHistory {
  #loading = $state(false);
  #revalidating = $state(false);
  chats = $state<ChatThread[]>([]);
  alertDialogOpen = $state(false);

  get loading() {
    return this.#loading;
  }

  get revalidating() {
    return this.#revalidating;
  }

  constructor(chatsInput: ChatThread[] | Promise<ChatThread[]>) {
    this.rehydrate(chatsInput);
  }

  rehydrate(chatsInput: ChatThread[] | Promise<ChatThread[]>) {
    this.#loading = true;
    this.#revalidating = true;

    if (chatsInput && typeof (chatsInput as any).then === "function") {
      const fetchPromise = chatsInput as Promise<ChatThread[]>;

      // 10s timeout — fall back to empty state on storage error or timeout (Req 24.7)
      const timeoutPromise = new Promise<null>((_, reject) =>
        setTimeout(() => reject(new Error('Storage timeout')), 10000)
      );

      Promise.race([fetchPromise, timeoutPromise])
        .then((chats) => {
          this.chats = (chats as ChatThread[]) || [];
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
      this.chats = (chatsInput as ChatThread[]) || [];
      this.#loading = false;
      this.#revalidating = false;
    }
  }

  groupChatsByDate(chats: ChatThread[]): GroupedChats {
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

  async deleteChat(threadId?: string) {
    if (!threadId) return;

    // Optimistic UI update for immediate reactivity
    const previousChats = this.chats;
    this.chats = this.chats.filter((chat) => chat.threadId !== threadId);
    this.alertDialogOpen = false;

    if (threadId === page.params.chatId) {
      goto("/");
    }

    const deletePromise = deleteChat({ threadId }).then((res) => {
      if (!res.success) throw new Error(res.message || "Failed to delete chat");
      return res;
    });

    toast.promise(deletePromise, {
      loading: "Deleting chat...",
      success: () => {
        this.refetch();
        return "Chat deleted successfully";
      },
      error: (err: any) => {
        // Revert optimistic update on error
        this.chats = previousChats;
        return err.message || "Failed to delete chat";
      },
    });
  }

  getChatDetails = (threadId: string) => {
    return this.chats.find((c) => c.threadId === threadId);
  };

  updateVisibility = async (threadId: string, visibility: ChatVisibility) => {
    const chat = this.chats.find((c) => c.threadId === threadId);
    if (chat) {
      chat.visibility = visibility;
    }
    const res = await updateVisibility({ threadId, visibility });
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
      const threads = await Promise.race([getHistory({}).run(), timeoutPromise]);
      console.log({ threads })
      if (!threads) return;
      this.chats = threads
    } catch (err) {
      console.error("[ChatHistory] refetch failed:", err);
      // Fall back to empty state on error or timeout (Req 24.7)
      this.chats = [];
    } finally {
      this.#revalidating = false;
    }
  }

  addChat(thread: ChatThread) {
    // Add new thread to top of list
    this.chats = [thread, ...this.chats];
  }

  /**
   * Upsert a chat into the sidebar list:
   * - If the thread ID is NOT in the list → prepend to top (length +1)
   * - If the thread ID IS already in the list → update title in place (no duplicate, same length)
   */
  upsertChat(thread: ChatThread) {
    const existingIndex = this.chats.findIndex((c) => c.threadId === thread.threadId);
    if (existingIndex === -1) {
      // New thread: prepend to top
      this.chats = [thread, ...this.chats];
    } else {
      // Existing thread: update title in place
      this.chats[existingIndex] = { ...this.chats[existingIndex], title: thread.title };
    }
  }

  static fromContext(): ChatHistory {
    return getContext(contextKey);
  }
}
