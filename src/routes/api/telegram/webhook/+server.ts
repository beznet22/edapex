import type { RequestHandler } from "@sveltejs/kit";
import { handleTelegramUpdate } from "$lib/server/telegram/gateway";
import type { TelegramUpdate } from "$lib/server/telegram/bot";

export const POST: RequestHandler = async ({ request }) => {
  const update = (await request.json()) as TelegramUpdate;
  if (typeof update?.update_id !== "number") {
    return new Response(JSON.stringify({ ok: false, error: "Invalid update" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }
  handleTelegramUpdate(update).catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[telegram/webhook] handler error: ${msg}`);
  });
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
};
