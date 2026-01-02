import type { DBMessage } from "$lib/server/db/schema";
import type { xUIMessage } from "$lib/types/chat-types";

export function convertToUIMessages(messages: Array<DBMessage>): Array<xUIMessage> {
  return messages.map((message) => ({
    id: message.id,
    parts: JSON.parse(message.parts as string),
    role: message.role,
    metadata: message.metadata,
    content: "",
    createdAt: message.createdAt,
  } as xUIMessage));
}

export function localStore<T>(
  key: string,
  value?: T
): T | null {
  if (typeof window === "undefined") return null;

  if (!value) {
    const raw = localStorage.getItem(key);
    if (!raw) return null;

    try {
      return JSON.parse(raw) as T;
    } catch {
      localStorage.removeItem(key);
      return null;
    }
  }

  if (value === null) {
    localStorage.removeItem(key);
    return null;
  }

  localStorage.setItem(key, JSON.stringify(value));
  return value;
}

export function clearLocalStore(key: string) {
  localStorage.removeItem(key);
}
