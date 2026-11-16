import { TELEGRAM_BOT_TOKEN } from "./bot";

const API_BASE = "https://api.telegram.org";

export async function sendReplyKeyboard(chatId: string, prompt?: string): Promise<void> {
  const token = TELEGRAM_BOT_TOKEN;
  if (!token) return;

  const payload = {
    chat_id: chatId,
    text: prompt ?? "Tap a button below or type a command:",
    reply_markup: {
      keyboard: [
        [{ text: "/result" }, { text: "/connect" }, { text: "/help" }],
      ],
      resize_keyboard: true,
      persistent: true,
      input_field_placeholder: "Choose a command",
    },
  };

  try {
    await fetch(`${API_BASE}/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    // Best-effort — keyboard is a UX nicety, not critical
  }
}
