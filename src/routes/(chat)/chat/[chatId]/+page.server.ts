import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { createMastraStorage } from "$lib/server/mastra/storage";

export const load: PageServerLoad = async ({ params, locals }) => {
  const { chatId } = params;
  const user = locals.user;
  const storage = createMastraStorage();

  try {
    const thread = await storage.getThread(chatId);
    if (!thread) {
      error(404, "Not found");
    }

    // Enforce ownership for private threads
    if (thread.metadata?.visibility === "private") {
      if (!user || thread.resourceId !== `user-${user.id}`) {
        error(404, "Not found");
      }
    }

    // Load messages from Mastra storage
    const rawMessages = await storage.getMessages({ threadId: chatId });

    // Map thread to the DBChat-compatible shape the UI expects
    const chat = {
      id: thread.id,
      title: thread.title || 'New Chat',
      model: thread.metadata?.model || 'auto',
      createdAt: thread.createdAt || new Date(),
      userId: user?.id ?? null,
      visibility: thread.metadata?.visibility || 'private',
    };

    return { chat, messages: rawMessages };
  } catch (err) {
    if (err instanceof Response) {
      throw err;
    }
    // If Mastra storage hasn't initialized threads yet, return empty
    return { chat: null, messages: [] };
  }
};
