import { error, redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { getMemory, mastra } from "$lib/server/mastra";
import { toAISdkMessages } from "@mastra/ai-sdk/ui";
import { writeFileSync } from "fs";

export const load: PageServerLoad = async ({ params, locals }) => {
  const { chatId } = params;
  if (!chatId || chatId.trim() === "undefined") {
    redirect(302, "/");
  }

  const user = locals.user;
  const memory = await getMemory();

  try {
    if (!memory) {
      return { chat: null, messages: [] };
    }

    const thread = await memory.getThreadById({ threadId: chatId });
    if (!thread) {
      return { chat: null, messages: [] };
    }

    if (thread.metadata?.visibility === "private") {
      if (!user || thread.resourceId !== `user-${user.id}`) {
        error(404, "Not found");
      }
    }

    const { messages } = await memory.recall({
      threadId: thread.id,
      resourceId: thread.resourceId,
    });

    const uiMessages = toAISdkMessages(messages, { version: "v6" });

    const chat = {
      threadId: thread.id,
      resourceId: thread.resourceId,
      title: thread.title,
      model: (thread.metadata?.model as string),
      userId: user?.id ?? null,
      visibility: thread.metadata?.visibility as string,
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt,
    };

    return { chat, messages: uiMessages };
  } catch (err: unknown) {
    if (err && typeof err === 'object' && 'status' in err) {
      throw err;
    }
    return { user, chat: null, messages: [] };
  }
};
