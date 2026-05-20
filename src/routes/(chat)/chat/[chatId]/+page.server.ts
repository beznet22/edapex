import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { createMastraStorage, ensureStorageInitialized } from "$lib/server/mastra/storage";

export const load: PageServerLoad = async ({ params, locals }) => {
  const { chatId } = params;
  const user = locals.user;
  const storage = createMastraStorage();
  await ensureStorageInitialized();

  try {
    const memory = await storage.getStore('memory');
    if (!memory) {
      return { chat: null, messages: [] };
    }

    const thread = await memory.getThreadById({ threadId: chatId });
    if (!thread) {
      error(404, "Not found");
    }

    // Enforce ownership for private threads
    if (thread.metadata?.visibility === "private") {
      if (!user || thread.resourceId !== `user-${user.id}`) {
        error(404, "Not found");
      }
    }

    // Load messages from Mastra storage (max 200 to prevent unbounded memory usage)
    const result = await memory.listMessages({ threadId: chatId, perPage: 200 });

    // Order messages by creation time ascending (most recent last)
    const messages = result?.messages ?? [];
    const sortedMessages = [...messages].sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateA - dateB;
    });

    // Map thread to the DBChat-compatible shape the UI expects
    const chat = {
      id: thread.id,
      title: thread.title || 'New Chat',
      model: (thread.metadata?.model as string) || 'auto',
      createdAt: thread.createdAt || new Date(),
      userId: user?.id ?? null,
      visibility: (thread.metadata?.visibility as string) || 'private',
    };

    return { chat, messages: sortedMessages };
  } catch (err: unknown) {
    // Re-throw SvelteKit HTTP errors (from error() calls above)
    if (err && typeof err === 'object' && 'status' in err) {
      throw err;
    }
    // On storage failure: return empty messages array and null chat (Requirement 23.7)
    return { chat: null, messages: [] };
  }
};
