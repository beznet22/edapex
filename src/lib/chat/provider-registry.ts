import { CredentialType } from "$lib/schema/chat-schema";

export type ProviderCapability =
  | "planner"
  | "agentic"
  | "reasoning"
  | "fallback_planner"
  | "audit"
  | "embeddings"
  | "vision"
  | "ocr"
  | "document_intelligence"
  | "fast_utility"
  | "executor"
  | "titles"
  | "emergency_bridge";

export interface ModelConfig {
  name: string;
  description: string;
  tool_call: boolean;
  reasoning: boolean;
  limit: { context: number; output: number };
}

export interface ProviderEntry {
  name: string;
  description: string;
  options: { fetchApiKey: "personal_access_tokens" | "global_fallback" | "user_provided" };
  fallback: string[];
  capabilities: ProviderCapability[];
  models: Record<string, ModelConfig>;
  url?: string;
}

export const staticProviderRegistry: Record<string, ProviderEntry> = {
  cerebras: {
    name: "Cerebras",
    description: "Primary planner and chief architect for deep reasoning",
    options: { fetchApiKey: "personal_access_tokens" },
    fallback: ["nvidia_nim", "openrouter"],
    capabilities: ["planner", "agentic", "reasoning"],
    url: "https://cloud.cerebras.ai/platform/org_5nfyjry685f5293whxtwmvvk/apikeys",
    models: {
      "llama3.1-70b": {
        name: "Llama 3.1 70B",
        description: "Native Cerebras reasoning engine",
        tool_call: true,
        reasoning: true,
        limit: { context: 128000, output: 8192 },
      },
    },
  },
  nvidia_nim: {
    name: "NVIDIA NIM",
    description: "Diverse fallback architect with embeddings capabilities",
    options: { fetchApiKey: "global_fallback" },
    fallback: ["cerebras", "openrouter"],
    capabilities: ["fallback_planner", "audit", "embeddings", "vision"],
    url: "https://build.nvidia.com/settings/api-keys",
    models: {
      "meta/llama-3.3-70b-instruct": {
        name: "Llama 3.3 70B",
        description: "Verified native NVIDIA NIM reasoning model",
        tool_call: true,
        reasoning: true,
        limit: { context: 128000, output: 8192 },
      },
    },
  },
  mistral: {
    name: "Mistral SDK",
    description: "High-precision document intelligence layer",
    options: { fetchApiKey: "global_fallback" },
    fallback: ["nvidia_nim", "cerebras", "openrouter"],
    capabilities: ["ocr", "document_intelligence"],
    url: "https://admin.mistral.ai/organization/api-keys",
    models: {
      "mistral-ocr-latest": {
        name: "Mistral OCR",
        description: "Specialized document transcription engine",
        tool_call: false,
        reasoning: false,
        limit: { context: 131000, output: 8192 },
      },
    },
  },
  groq: {
    name: "Groq",
    description: "Lightning fast utility execution",
    options: { fetchApiKey: "personal_access_tokens" },
    fallback: ["nvidia_nim", "openrouter"],
    capabilities: ["fast_utility", "executor"],
    url: "https://console.groq.com/keys",
    models: {
      "llama3-70b-8192": {
        name: "Llama 3 70B",
        description: "Fast utility model",
        tool_call: true,
        reasoning: false,
        limit: { context: 8192, output: 8192 },
      },
    },
  },
  openrouter: {
    name: "OpenRouter",
    description: "Emergency bridge for zero downtime",
    options: { fetchApiKey: "user_provided" },
    fallback: ["nvidia_nim"],
    capabilities: ["emergency_bridge", "titles"],
    url: "https://openrouter.ai/workspaces/default/keys",
    models: {
      "meta-llama/llama-3.3-70b-instruct": {
        name: "Llama 3.3 70B (OpenRouter)",
        description: "General purpose via OpenRouter bridge",
        tool_call: true,
        reasoning: false,
        limit: { context: 128000, output: 8192 },
      },
    },
  },
};

export const DEFAULT_PROVIDER_PRIORITY: string[] = [
  "cerebras",
  "groq",
  "nvidia_nim",
  "mistral",
  "openrouter",
];
