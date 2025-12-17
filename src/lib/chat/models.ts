import { CredentialType } from "$lib/schema/chat-schema";
import z from "zod";

export const DEFAULT_CHAT_MODEL: string = "chat-model";



export const chatProviderSchema = z.object({
  id: z.enum(CredentialType),
  name: z.string().optional(),
  description: z.string().optional(),
});
export type ChatProviders = z.infer<typeof chatProviderSchema>;


export const chatProviders: Array<ChatProviders> = [
  {
    id: CredentialType.QWEN_CODE,
    name: "Qwen",
    description: "QwenCode provider for all models",
  },
  {
    id: CredentialType.GOOGLE_OAUTH,
    name: "Gemini",
    description: "Google's chat model",
  },
  {
    id: CredentialType.OPENROUTER,
    name: "OpenRouter",
    description: "OpenRouter provider for all models",
  },
  {
    id: CredentialType.API_TOKEN,
    name: "API Key",
    description: "Use your own API key",
  },
];

interface ChatModel {
  id: string;
  name: string;
  description: string;
}

export const chatModels: Array<ChatModel> = [
  {
    id: "chat-model",
    name: "Chat model",
    description: "Primary model for all-purpose chat",
  },
  {
    id: "vision-model",
    name: "Vision model",
    description: "Vision language for image understanding",
  },
  {
    id: "chat-model-reasoning",
    name: "Reasoning model",
    description: "Uses advanced reasoning",
  },
  {
    id: "coder-model",
    name: "Coding model",
    description: "Best for coding tasks",
  },
  {
    id: "text-embedding",
    name: "Text embedding model",
    description: "Text embedding for similarity search",
  },
];

export const defaultChatModel = chatModels.find((m) => m.id === DEFAULT_CHAT_MODEL)!;
