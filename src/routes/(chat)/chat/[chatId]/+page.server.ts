import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { getMemory, mastra } from "$lib/server/mastra";
import { toAISdkMessages } from "@mastra/ai-sdk/ui";

export const load: PageServerLoad = async ({ params, locals }) => {
  const { chatId } = params;
  const user = locals.user;
  const memory = await getMemory();

  try {
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

    // Recall messages using the static Memory instance
    const resourceId = user ? `user-${user.id}` : thread.resourceId;
    let recallResponse = null;
    try {
      recallResponse = await memory.recall({
        threadId: chatId,
        resourceId,
      });
    } catch {
      console.log('No previous messages found.');
    }

    // Convert Mastra messages to AI SDK v5 UI format
    const uiMessages = toAISdkMessages(recallResponse?.messages || []);

    // Map thread to the ChatThread compatible shape the UI expects
    const chat = {
      threadId: thread.id,
      resourceId: thread.resourceId,
      title: thread.title || 'New Chat',
      model: (thread.metadata?.model as string),
      userId: user?.id ?? null,
      visibility: thread.metadata?.visibility as string,
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt,
    };

    return { chat, messages: uiMessages };
  } catch (err: unknown) {
    // Re-throw SvelteKit HTTP errors (from error() calls above)
    if (err && typeof err === 'object' && 'status' in err) {
      throw err;
    }
    // On storage failure: return empty messages array and null chat (Requirement 23.7)
    return { user, chat: null, messages: [] };
  }
};
