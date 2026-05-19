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
  groq: {
    name: "Groq",
    description: "Lightning fast utility execution",
    options: { fetchApiKey: "personal_access_tokens" },
    fallback: ["deepseek", "nvidia_nim"],
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
  deepseek: {
    name: "DeepSeek",
    description: "Deep reasoning and code intelligence",
    options: { fetchApiKey: "global_fallback" },
    fallback: ["mistral", "nvidia_nim"],
    capabilities: ["planner", "agentic", "reasoning"],
    url: "https://platform.deepseek.com/api_keys",
    models: {
      "deepseek-reasoner": {
        name: "DeepSeek Reasoner",
        description: "Native DeepSeek reasoning and logic engine",
        tool_call: true,
        reasoning: true,
        limit: { context: 64000, output: 8192 },
      },
      "deepseek-chat": {
        name: "DeepSeek Chat",
        description: "Fast general intelligence",
        tool_call: true,
        reasoning: false,
        limit: { context: 64000, output: 8192 },
      }
    }
  },
  mistral: {
    name: "Mistral SDK",
    description: "High-precision document intelligence layer",
    options: { fetchApiKey: "global_fallback" },
    fallback: ["nvidia_nim", "opencode"],
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
  nvidia_nim: {
    name: "NVIDIA NIM",
    description: "Diverse fallback architect with embeddings capabilities",
    options: { fetchApiKey: "global_fallback" },
    fallback: ["opencode", "groq"],
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
  opencode: {
    name: "OpenCode Zen",
    description: "Curated model endpoint for low-latency reasoning",
    options: { fetchApiKey: "user_provided" },
    fallback: ["groq"],
    capabilities: ["fast_utility", "executor", "titles", "emergency_bridge"],
    url: "https://opencode.ai/docs/zen/",
    models: {
      "zen-model": {
        name: "Zen Alpha",
        description: "Optimized model for fast architectural decisions",
        tool_call: true,
        reasoning: false,
        limit: { context: 32000, output: 4096 },
      },
    },
  },
};

export const DEFAULT_PROVIDER_PRIORITY: string[] = [
  "groq",
  "deepseek",
  "mistral",
  "nvidia_nim",
  "opencode",
];
