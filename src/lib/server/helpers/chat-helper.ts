import type { xUIMessage } from "$lib/types/chat-types";
import { generateText, type LanguageModel, type ModelMessage, type Provider } from "ai";
import type { DBMessage } from "../db/schema";
import { CredentialType } from "$lib/schema/chat-schema";
import { resultInputSchema } from "$lib/schema/result";
import { extractPrompt } from "../prompts/extract";
import { useAgent } from "../service/agent.service";

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
  provider,
}: {
  message: xUIMessage;
  provider: Provider;
}): Promise<string> {
  try {
    const result = await generateText({
      model: provider.languageModel("title-model"),
      system: `\n
            - you will generate a short title based on the first message a user begins a conversation with
            - ensure it is not more than 20 characters long
            - the title should be a summary of the user's message
            - do not use quotes or colons`,
      prompt: JSON.stringify(message),
    });

    return result.text;
  } catch (error) {
    // console.error(error);
    console.warn("error generating title from user message, using default title");
    return "New Chat";
  }
}

export const generateContent = async (file: Blob, mapString?: string) => {
  let messages: Array<ModelMessage> = [];
  messages.push({
    role: "user",
    content: [
      {
        type: "text",
        text: [
          "Extract all visible data needed to generate an official report card.",
          "",
          "Mapping Data:",
          mapString || "",
        ].join("\n"),
      },
      {
        type: "file",
        data: await file.arrayBuffer(),
        mediaType: file.type,
      },
    ],
  });

  const provider = await useAgent().use(CredentialType.QWEN_CODE).geModelProvider();
  if (!provider) throw new Error("No provider found");

  const result = await generateText({
    model: provider.languageModel("vision-model"),
    system: extractPrompt,
    messages,
  });
  return result.text;
};
