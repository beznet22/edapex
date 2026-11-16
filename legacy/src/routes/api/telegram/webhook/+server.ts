import type { RequestHandler } from "@sveltejs/kit";
import { bot } from "$lib/server/telegram/gateway";

export const POST: RequestHandler = async ({ request }) => {
  return bot.webhooks.telegram(request);
};
