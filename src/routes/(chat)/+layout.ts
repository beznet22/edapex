import { getHistory } from "$lib/api/chat.remote";
import type { DBChat } from "$lib/server/db/schema";
import type { LayoutLoad } from "./$types";

export const load: LayoutLoad = async ({ data, fetch }) => {
  const { user } = data;
  let chats = Promise.resolve<DBChat[]>([]);
  if (user) {
    chats = getHistory({}).then((chats) => chats ?? []);
  }
  return {
    chats,
    ...data,
  };
};
