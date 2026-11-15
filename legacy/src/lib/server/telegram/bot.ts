import { env } from "$env/dynamic/private";
import { createTelegramAdapter } from "@chat-adapter/telegram";

export const TELEGRAM_BOT_TOKEN: string = env.TELEGRAM_BOT_TOKEN ?? "";
export const TELEGRAM_BOT_USERNAME: string = env.TELEGRAM_BOT_USERNAME ?? "";
export const TELEGRAM_ADMIN_CHAT_ID: string = env.TELEGRAM_ADMIN_CHAT_ID ?? "";

export const telegramAdapter = createTelegramAdapter({
  botToken: TELEGRAM_BOT_TOKEN || undefined,
});
