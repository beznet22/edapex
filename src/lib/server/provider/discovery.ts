import { CredentialType } from "$lib/schema/chat-schema";
import type { ModelConfig } from "$lib/chat/provider-registry";
import { join } from "path";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { STORAGE_DIR } from "$lib/constants";

const BASE_URLS: Record<CredentialType, string> = {
  [CredentialType.CEREBRAS]: "https://api.cerebras.ai/v1",
  [CredentialType.NVIDIA_NIM]: "https://integrate.api.nvidia.com/v1",
  [CredentialType.GROQ]: "https://api.groq.com/openai/v1",
  [CredentialType.MISTRAL]: "https://api.mistral.ai/v1",
  [CredentialType.OPENROUTER]: "https://openrouter.ai/api/v1",
};

export interface DiscoveredModel extends ModelConfig {
  id: string;
  provider: CredentialType;
}

export async function discoverModels(provider: CredentialType, apiKey: string): Promise<DiscoveredModel[]> {
  const baseUrl = BASE_URLS[provider];
  if (!baseUrl) return [];

  try {
    const response = await fetch(`${baseUrl}/models`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      console.error(`[discoverModels:${provider}] Failed to fetch models: ${response.statusText}`);
      return [];
    }

    const data = await response.json();
    const rawModels = data.data || data; // Handle different API response shapes
console.log(rawModels);
    if (!Array.isArray(rawModels)) {
      console.error(`[discoverModels:${provider}] Invalid models response format`);
      return [];
    }

    return enrichModels(rawModels, provider);
  } catch (error) {
    console.error(`[discoverModels:${provider}] Error during discovery:`, error);
    return [];
  }
}

function enrichModels(rawModels: any[], provider: CredentialType): DiscoveredModel[] {
  return rawModels
    .filter((m) => {
      const id = m.id || m.name || m;
      const name = m.name || id;

      // 1. General Deprecation Filter
      if (/deprecated|legacy|discontinued/i.test(id) || /deprecated|legacy/i.test(name)) {
        return false;
      }

      // 2. NVIDIA NIM Strict Native/Verified Filtering
      // Prevents 404s from misattributed 3rd party models (like StepFun) returned by NIM's general endpoint
      if (provider === CredentialType.NVIDIA_NIM) {
        const nativePrefixes = [
          "nvidia/",
          "meta/",
          "mistralai/",
          "google/",
          "microsoft/",
          "nv-",
          "deepseek/",
          "snowflake/",
          "codellama/",
        ];
        if (!nativePrefixes.some((p) => id.startsWith(p))) {
          return false;
        }
      }

      // 3. OpenRouter Free-Only Filter
      if (provider === CredentialType.OPENROUTER) {
        // OpenRouter returns pricing in 'pricing' object. Prompt/Completion must be '0' for free models.
        if (m.pricing && (parseFloat(m.pricing.prompt) > 0 || parseFloat(m.pricing.completion) > 0)) {
          return false;
        }
      }

      return true;
    })
    .map((m) => {
      const id = m.id || m.name || m;
      const name = m.name || id;
      const description = m.description || `Discovered ${provider} model`;

      // Capability Detection Logic
      const isVision = /vision|pixtral/i.test(id);
      const isOCR = /ocr/i.test(id);
      const isReasoning = /70b|large|deepseek-r1|o1|o3|thought|reasoning/i.test(id);
      const supportsToolCall = !/flash|small|ocr/i.test(id) || /llama-3/i.test(id);

      return {
        id,
        name: name,
        description: description,
        tool_call: supportsToolCall,
        reasoning: isReasoning,
        provider: provider,
        limit: {
          context: m.context_length || (isReasoning ? 128000 : 32000),
          output: 8192,
        },
      };
    });
}

export function saveUserModelsCached(userId: string | number, provider: string, models: DiscoveredModel[]): void {
  const userDir = join(STORAGE_DIR, "users", userId.toString(), "models");
  if (!existsSync(userDir)) {
    mkdirSync(userDir, { recursive: true });
  }

  const cachePath = join(userDir, `${provider}.json`);
  writeFileSync(cachePath, JSON.stringify(models, null, 2));
}
