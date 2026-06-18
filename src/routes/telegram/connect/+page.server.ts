import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";
import { env } from "$env/dynamic/private";
import { ConnectTokenStore } from "$lib/server/telegram/connect-tokens";

export const load: PageServerLoad = async ({ url }) => {
  const token = url.searchParams.get("token");
  if (!token) {
    error(400, "Missing token");
  }
  const lookup = await ConnectTokenStore.getInstance().lookupToken(token);
  if (!lookup) {
    error(400, "Invalid or expired link");
  }
  return {
    token,
    botUsername: env.TELEGRAM_BOT_USERNAME ?? "",
  };
};
