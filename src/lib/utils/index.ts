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
