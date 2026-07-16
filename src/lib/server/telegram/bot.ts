import "dotenv/config";
import { createTelegramAdapter } from "@chat-adapter/telegram";

export const telegramAdapter = createTelegramAdapter();

export const TELEGRAM_BOT_USERNAME: string = process.env.TELEGRAM_BOT_USERNAME ?? "";