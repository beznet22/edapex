import { CredentialType } from "$lib/schema/chat-schema";
import { staticProviderRegistry, type ModelConfig } from "./provider-registry";

export const DEFAULT_CHAT_MODEL: string = "chat-model";

export interface ChatProviders {
  id: CredentialType;
  name: string;
  description: string;
  url?: string;
}

export const chatProviders: Array<ChatProviders> = Object.entries(staticProviderRegistry).map(
  ([id, entry]) => ({
    id: id as CredentialType,
    name: entry.name,
    description: entry.description,
    url: entry.url,
  })
);

export interface ChatModel {
  id: string;
  name: string;
  description: string;
  provider: CredentialType | "all";
}

const conceptualModels: Array<ChatModel> = [
  {
    id: "chat-model",
    name: "Auto (Smart)",
    description: "Best available model for general purpose chat",
    provider: "all",
  },
  {
    id: "chat-model-reasoning",
    name: "Deep Reasoning",
    description: "Advanced logic and planning",
    provider: "all",
  },
];

const registryModels: Array<ChatModel> = Object.entries(staticProviderRegistry).flatMap(
  ([providerId, entry]) =>
    Object.entries(entry.models).map(([modelId, config]) => ({
      id: modelId,
      name: config.name,
      description: config.description,
      provider: providerId as CredentialType,
    }))
);

export const chatModels: Array<ChatModel> = [...conceptualModels, ...registryModels];

export const defaultChatModel = chatModels.find((m) => m.id === DEFAULT_CHAT_MODEL)!;
