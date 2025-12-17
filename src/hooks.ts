
import { ChatHistory } from '$lib/context/chat-history.svelte';
import { SelectedModel } from '$lib/context/sync.svelte';
import { Icon } from '@lucide/svelte';
import type { Transport } from '@sveltejs/kit';

export const transport: Transport = {
  SelectedModel: {
    encode: (value) => value instanceof SelectedModel && value.value,
    decode: (value) => new SelectedModel(value),
  },
  ChatHistory: {
    encode: (value) => value instanceof ChatHistory && value.chats,
    decode: (value) => new ChatHistory(value),
  }
};
