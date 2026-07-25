import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "@sveltejs/kit";
import { TELEGRAM_BOT_TOKEN } from "$lib/server/telegram/bot";

const API_BASE = "https://api.telegram.org";

export const POST: RequestHandler = async ({ request }) => {
  if (!TELEGRAM_BOT_TOKEN) {
    throw error(503, "TELEGRAM_BOT_TOKEN not configured");
  }

  const origin = request.headers.get("origin") ?? request.headers.get("host");
  if (!origin) {
    throw error(400, "Could not determine deployment URL");
  }

  const host = origin.replace(/^https?:\/\//, "");
  const webhookUrl = `https://${host}/api/telegram/webhook`;

  const res = await fetch(`${API_BASE}/bot${TELEGRAM_BOT_TOKEN}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: webhookUrl }),
  });

  const data = await res.json();
  return json({ ok: data.ok, description: data.description, url: webhookUrl });
};
