import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "@sveltejs/kit";
import { TELEGRAM_BOT_TOKEN } from "$lib/server/telegram/bot";

const API_BASE = "https://api.telegram.org";

export const GET: RequestHandler = async () => {
  if (!TELEGRAM_BOT_TOKEN) {
    throw error(503, "TELEGRAM_BOT_TOKEN not configured");
  }

  const res = await fetch(`${API_BASE}/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });

  const data = await res.json();
  if (!data.ok) {
    throw error(502, data.description ?? "Telegram API error");
  }

  return json({
    url: data.result.url,
    pendingUpdateCount: data.result.pending_update_count,
    lastErrorDate: data.result.last_error_date ?? null,
    lastErrorMessage: data.result.last_error_message ?? null,
    maxConnections: data.result.max_connections ?? null,
  });
};
