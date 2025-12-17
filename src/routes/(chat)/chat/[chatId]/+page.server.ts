import { repo } from "$lib/server/repository";
import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";


export const load: PageServerLoad = async ({ params, locals }) => {
  const { chatId } = params;
  const user = locals.user;

  try {
    const chat = await repo.chat.getChatById(chatId);
    if (chat && chat.visibility === "private") {
      if (!user || chat.userId !== user.id) {
        error(404, "Not found");
      }
    }
    const messages = await repo.chat.loadMessages(chatId);

    return { chat, messages };
  } catch (err) {
    if (err instanceof Response) {
      throw err;
    }
    error(500, "An error occurred while processing your request");
  }
};
