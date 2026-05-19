import type { xUIMessage } from "$lib/types/chat-types";
import { Agent } from "@mastra/core/agent";
import { AgentRouter } from "../mastra/router";
import { createMastraDb } from "../mastra/db";
import type { DBMessage } from "../../types/chat-types";

export function convertToUIMessages(messages: Array<DBMessage>): Array<xUIMessage> {
  return messages.map((message) => ({
    id: message.id,
    parts: message.parts as xUIMessage["parts"],
    role: message.role as xUIMessage["role"],
    metadata: message.metadata as xUIMessage["metadata"],
    createdAt: message.createdAt,
  }));
}

export async function generateTitle({
  message,
  userId,
}: {
  message: xUIMessage;
  userId: number;
}): Promise<string> {
  try {
    const { env } = await import("$env/dynamic/private");
    const db = createMastraDb();
    const router = new AgentRouter(db, userId);
    const encryptionKey = env.TOKEN_ENCRYPTION_KEY || "edapex-default-encryption-key-32ch";
    const envKeys = env as Record<string, string | undefined>;
    const model = await router.resolveMastraModel("title", envKeys, encryptionKey);

    const agent = new Agent({
      id: "title-agent",
      name: "Title Agent",
      instructions: `
            - you will generate a short title based on the first message a user begins a conversation with
            - ensure it is not more than 20 characters long
            - the title should be a summary of the user's message
            - do not use quotes or colons`,
      model,
    });

    const result = await agent.generate(JSON.stringify(message));
    return result.text;
  } catch (error) {
    console.warn("error generating title from user message, using default title", error);
    return "New Chat";
  }
}
