import { ChatHistory } from "$lib/context/chat-history.svelte";
import { SelectedModel, SelectedClass, SelectedCategory } from "$lib/context/sync.svelte";
import type { Transport } from "@sveltejs/kit";

export const transport: Transport = {
  ChatHistory: {
    encode: (value) => (value instanceof ChatHistory || value?.constructor?.name === "ChatHistory") ? value.chats : undefined,
    decode: (value) => new ChatHistory(value),
  },
};




