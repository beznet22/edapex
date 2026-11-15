import { TELEGRAM_BOT_TOKEN } from "./bot";

const API_BASE = "https://api.telegram.org";

const COMMANDS = [
  { command: "start", description: "Welcome message" },
  { command: "result", description: "Get your child\u2019s result PDF" },
  { command: "connect", description: "Link your Telegram account" },
  { command: "cancel", description: "Cancel connection in progress" },
  { command: "help", description: "Show available commands" },
];

let registered = false;

export async function ensureBotCommandsRegistered(): Promise<void> {
  if (registered) return;
  const token = TELEGRAM_BOT_TOKEN;
  if (!token) return;

  try {
    const res = await fetch(`${API_BASE}/bot${token}/setMyCommands`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commands: COMMANDS }),
    });
    if (res.ok) {
      registered = true;
    }
  } catch {
    // Best-effort
  }
}
