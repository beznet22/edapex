import { createHash, createCipheriv, createDecipheriv, randomBytes } from "crypto";
import { CredentialType, CREDENTIAL_LABELS } from "$lib/schema/chat-schema";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createMistral } from "@ai-sdk/mistral";
import type { Provider as AIProvider } from "ai";
import { getDatabase } from "$lib/server/db";
import { personalAccessTokens } from "$lib/server/db/sms-schema";
import { eq, and } from "drizzle-orm";
import { env } from "$env/dynamic/private";
import { 
  staticProviderRegistry, 
  type ProviderCapability, 
  type ModelConfig, 
  type ProviderEntry,
  DEFAULT_PROVIDER_PRIORITY
} from "$lib/chat/provider-registry";

const ENCRYPTION_KEY = env.TOKEN_ENCRYPTION_KEY || "edapex-default-encryption-key-32ch";
const ALGORITHM = "aes-256-cbc";

function getKeyBuffer(): Buffer {
  return createHash("sha256").update(ENCRYPTION_KEY).digest();
}

function encrypt(text: string): string {
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, getKeyBuffer(), iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
}

function decrypt(encryptedText: string): string {
  const [ivHex, encrypted] = encryptedText.split(":");
  const iv = Buffer.from(ivHex, "hex");
  const decipher = createDecipheriv(ALGORITHM, getKeyBuffer(), iv);
  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

function maskKey(key: string): string {
  if (key.length <= 8) return "***";
  return key.slice(0, 4) + "***" + key.slice(-4);
}

function hashToken(key: string): string {
  return createHash("sha256").update(key).digest("hex").slice(0, 64);
}

export type TaskType = "title" | "chat" | "vision" | "artifact" | "ocr";

export const providerRegistry: Record<string, ProviderEntry> = staticProviderRegistry;

const BASE_URLS: Record<string, string> = {
  cerebras: "https://api.cerebras.ai/v1",
  nvidia_nim: "https://integrate.api.nvidia.com/v1",
  groq: "https://api.groq.com/openai/v1",
  openrouter: "https://openrouter.ai/api/v1",
};

const ENV_FALLBACK_KEYS: Record<string, string> = {
  nvidia_nim: "NVIDIA_API_KEY",
  mistral: "MISTRAL_API_KEY",
};

const TASK_CAPABILITY_MAP: Record<TaskType, ProviderCapability[]> = {
  chat: ["planner", "agentic", "reasoning", "fallback_planner", "emergency_bridge"],
  vision: ["vision", "fallback_planner", "emergency_bridge"],
  title: ["fast_utility", "titles", "executor", "emergency_bridge"],
  artifact: ["planner", "agentic", "reasoning", "fallback_planner"],
  ocr: ["ocr", "document_intelligence"],
};

// Removed static PROVIDER_PRIORITY in favor of dynamic resolution

export async function storeApiKey(
  userId: number,
  providerType: CredentialType,
  rawApiKey: string,
): Promise<void> {
  const db = await getDatabase();
  const tokenHash = hashToken(rawApiKey);
  const encryptedKey = encrypt(rawApiKey);
  const masked = maskKey(rawApiKey);

  const existing = await db
    .select()
    .from(personalAccessTokens)
    .where(
      and(
        eq(personalAccessTokens.tokenableType, providerType),
        eq(personalAccessTokens.tokenableId, userId),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(personalAccessTokens)
      .set({
        token: tokenHash,
        abilities: encryptedKey,
        name: masked,
        updatedAt: new Date(),
      })
      .where(eq(personalAccessTokens.id, existing[0].id));
  } else {
    await db.insert(personalAccessTokens).values({
      tokenableType: providerType,
      tokenableId: userId,
      token: tokenHash,
      abilities: encryptedKey,
      name: masked,
    });
  }
}

export async function retrieveApiKey(
  userId: number,
  providerType: string,
): Promise<string | null> {
  const db = await getDatabase();
  const rows = await db
    .select()
    .from(personalAccessTokens)
    .where(
      and(
        eq(personalAccessTokens.tokenableType, providerType),
        eq(personalAccessTokens.tokenableId, userId),
      ),
    )
    .limit(1);

  if (rows.length === 0 || !rows[0].abilities) return null;

  try {
    return decrypt(rows[0].abilities);
  } catch {
    return null;
  }
}

export async function deleteApiKey(
  userId: number,
  providerType: CredentialType,
): Promise<boolean> {
  const db = await getDatabase();
  const existing = await db
    .select()
    .from(personalAccessTokens)
    .where(
      and(
        eq(personalAccessTokens.tokenableType, providerType),
        eq(personalAccessTokens.tokenableId, userId),
      ),
    )
    .limit(1);

  if (existing.length === 0) return false;

  await db.delete(personalAccessTokens).where(eq(personalAccessTokens.id, existing[0].id));
  return true;
}

export async function getUserProviderKeys(
  userId: number,
): Promise<Array<{ provider: string; name: string }>> {
  const db = await getDatabase();
  const rows = await db
    .select({
      tokenableType: personalAccessTokens.tokenableType,
      name: personalAccessTokens.name,
    })
    .from(personalAccessTokens)
    .where(eq(personalAccessTokens.tokenableId, userId));

  return rows.map((r: { tokenableType: string; name: string }) => ({
    provider: r.tokenableType,
    name: r.name,
  }));
}

function getEnvFallbackKey(providerType: string): string | null {
  const envVar = ENV_FALLBACK_KEYS[providerType];
  if (!envVar) return null;
  return (env as Record<string, string | undefined>)[envVar] || null;
}

async function resolveApiKey(userId: number, providerType: string): Promise<string | null> {
  const userKey = await retrieveApiKey(userId, providerType);
  if (userKey) return userKey;

  const entry = providerRegistry[providerType];
  if (entry?.options.fetchApiKey === "global_fallback") {
    return getEnvFallbackKey(providerType);
  }

  return null;
}

import { join } from "path";
import { readFileSync, existsSync } from "fs";
import { STORAGE_DIR } from "$lib/constants";

import { readdirSync, unlinkSync } from "fs";

/**
 * Loads the user's dynamic model registry by merging the static base with cached discoveries.
 * Isolated per provider to prevent cross-pollution.
 */
export function loadUserProviderRegistry(userId: number): Record<string, ProviderEntry> {
  // Deep clone to ensure we never mutate the static base
  const registry: Record<string, ProviderEntry> = JSON.parse(JSON.stringify(staticProviderRegistry));
  
  const userDir = join(STORAGE_DIR, "users", userId.toString());
  const modelsDir = join(userDir, "models");
  const legacyCachePath = join(userDir, "models.json");

  // Cleanup legacy cache if it exists
  if (existsSync(legacyCachePath)) {
    try { unlinkSync(legacyCachePath); } catch (e) {}
  }

  if (existsSync(modelsDir)) {
    try {
      const files = readdirSync(modelsDir).filter(f => f.endsWith(".json"));
      console.log(`[loadUserProviderRegistry] Loading isolated caches from ${modelsDir}:`, files);
      
      for (const file of files) {
        const cachePath = join(modelsDir, file);
        const discoveredModels = JSON.parse(readFileSync(cachePath, "utf-8"));
        
        // Use the filename (minus .json) as an extra safety check for the provider
        const expectedProviderId = file.replace(".json", "");
        
        for (const m of discoveredModels) {
          const providerId = m.provider;
          const modelId = m.id || "";

          // 1. Strict Native/Verified Filtering (Redundant check for runtime safety)
          if (providerId === "nvidia_nim") {
             const nativePrefixes = ["nvidia/", "meta/", "mistralai/", "google/", "microsoft/", "nv-", "deepseek/", "snowflake/", "codellama/"];
             if (!nativePrefixes.some(p => modelId.startsWith(p))) continue;
          }

          // 2. Deprecation Filter (Redundant check)
          if (/deprecated|legacy|discontinued/i.test(modelId)) continue;
          
          // CRITICAL: Only add model if it belongs to the provider entry we are currently merging
          // AND it matches the expected provider for this cache file
          if (providerId === expectedProviderId && registry[providerId]) {
            registry[providerId].models[modelId] = {
              name: m.name,
              description: m.description,
              tool_call: m.tool_call,
              reasoning: m.reasoning,
              limit: m.limit,
            };
          } else {
            console.warn(`[loadUserProviderRegistry] Skipping mismatched model ${m.id} (found in ${file}, but provider is ${providerId})`);
          }
        }
      }
    } catch (e) {
      console.error("[loadUserProviderRegistry] Error loading isolated caches:", e);
    }
  }

  // Final validation log
  Object.keys(registry).forEach(p => {
    console.log(`[loadUserProviderRegistry] Resolved ${p} with models:`, Object.keys(registry[p].models));
  });

  return registry;
}

export interface UserSettings {
  priority?: string[];
}

/**
 * Loads user settings (priority, etc) from the filesystem cache.
 */
export function loadUserSettings(userId: number): UserSettings {
  const settingsPath = join(STORAGE_DIR, "users", userId.toString(), "settings.json");
  if (!existsSync(settingsPath)) return {};
  try {
    return JSON.parse(readFileSync(settingsPath, "utf-8"));
  } catch (error) {
    console.error(`[router] Failed to load user settings for ${userId}:`, error);
    return {};
  }
}

/**
 * Resolves the final provider priority list for a user.
 */
export function getUserPriority(userId: number): string[] {
  const settings = loadUserSettings(userId);
  return settings.priority || DEFAULT_PROVIDER_PRIORITY;
}

function instantiateRawProvider(providerType: string, apiKey: string): AIProvider {
  if (providerType === "mistral") {
    return createMistral({ apiKey }) as unknown as AIProvider;
  }

  const baseURL = BASE_URLS[providerType];
  if (!baseURL) {
    throw new Error(`[ProviderRouter] No base URL configured for ${providerType}`);
  }

  return createOpenAICompatible({
    name: providerType,
    apiKey,
    baseURL,
  }) as unknown as AIProvider;
}

class ProviderWrapper {
  constructor(
    public provider: any,
    public providerType: string,
    public registry: Record<string, ProviderEntry>
  ) {}

  languageModel(taskOrId: TaskType | string): any {
    // If it's a known task (ocr, vision, chat, etc.), resolve the recommended model
    const taskTypes: string[] = ["chat", "vision", "title", "artifact", "ocr"];
    let modelId: string;

    if (taskTypes.includes(taskOrId as string)) {
      modelId = getModelIdForTask(this.providerType, taskOrId as TaskType, this.registry);
    } else {
      // It's a specific ID from the frontend (e.g. 'chat-model')
      // Map conceptual IDs to the provider's default model for that category
      if (taskOrId === "chat-model" || taskOrId === "chat-model-reasoning") {
        modelId = getModelIdForTask(this.providerType, "chat", this.registry);
      } else if (taskOrId === "vision-model") {
        modelId = getModelIdForTask(this.providerType, "vision", this.registry);
      } else if (taskOrId === "text-embedding") {
        modelId = getModelIdForTask(this.providerType, "chat", this.registry); // Fallback for embeddings if not specialized
      } else {
        // DEFENSIVE: If it's a specific model ID, check if this provider owns it.
        // If not, we MUST NOT send it to this provider, as it will 404.
        if (this.registry[this.providerType] && !this.registry[this.providerType].models[taskOrId]) {
          console.warn(`[ProviderWrapper] ${this.providerType} requested with foreign model ${taskOrId}. Falling back.`);
          modelId = getModelIdForTask(this.providerType, "chat", this.registry);
        } else {
          modelId = taskOrId;
        }
      }
    }

    return (this.provider as any)(modelId);
  }
}

export async function resolveProvider(
  userId: number,
  preferredProvider?: string,
  modelId?: string
): Promise<{ provider: Provider; providerType: string }> {
  const registry = loadUserProviderRegistry(userId);
  const priority = getUserPriority(userId);

  // 1. If a specific model ID is provided (not conceptual), prioritize the owner of that model
  if (modelId && modelId !== "chat-model" && modelId !== "chat-model-reasoning") {
    const owner = Object.entries(registry).find(([id, entry]) => !!entry.models[modelId]);
    if (owner) {
      const [providerId] = owner;
      const apiKey = await resolveApiKey(userId, providerId);
      if (apiKey) {
        console.log(`[resolveProvider] Direct match found! Model ${modelId} belongs to ${providerId}.`);
        const rawProvider = instantiateRawProvider(providerId, apiKey);
        return {
          provider: new ProviderWrapper(rawProvider, providerId, registry) as any,
          providerType: providerId,
        };
      }
    }
  }

  // 2. Normal priority-based or preferred resolution
  const candidates = preferredProvider
    ? [preferredProvider, ...(registry[preferredProvider]?.fallback || [])]
    : priority;

  for (const candidate of candidates) {
    try {
      const apiKey = await resolveApiKey(userId, candidate);
      if (apiKey) {
        const rawProvider = instantiateRawProvider(candidate, apiKey);
        return {
          provider: new ProviderWrapper(rawProvider, candidate, registry) as any,
          providerType: candidate,
        };
      }
    } catch (e) {
      console.warn(`[resolveProvider] Failed to resolve candidate ${candidate}, trying next...`);
    }
  }

  throw new Error("No available AI providers found. Please connect an integration in settings.");
}

export interface Provider {
  providerType: string;
  languageModel(taskOrId: TaskType | string): any;
  [key: string]: any; // Allow for AI SDK properties dynamically
}

export async function resolveProviderForTask(
  userId: number,
  task: TaskType,
  modelId?: string
): Promise<{ provider: Provider; providerType: string }> {
  const registry = loadUserProviderRegistry(userId);

  // If we have a specific model, use resolveProvider directly (it handles model-to-provider mapping)
  if (modelId && modelId !== "chat-model" && modelId !== "chat-model-reasoning") {
     return resolveProvider(userId, undefined, modelId);
  }

  const priority = getUserPriority(userId);
  const requiredCapabilities = TASK_CAPABILITY_MAP[task];

  for (const candidate of priority) {
    const entry = registry[candidate];
    if (entry && requiredCapabilities.some((cap) => entry.capabilities.includes(cap))) {
      try {
        const apiKey = await resolveApiKey(userId, candidate);
        if (apiKey) {
          const rawProvider = instantiateRawProvider(candidate, apiKey);
          return {
            provider: new ProviderWrapper(rawProvider, candidate, registry) as any,
            providerType: candidate,
          };
        }
      } catch (e) {
        continue;
      }
    }
  }

  return resolveProvider(userId);
}

export function getModelIdForTask(
  providerType: string,
  task: TaskType,
  registry: Record<string, ProviderEntry>
): string {
  const entry = registry[providerType];
  if (!entry) throw new Error(`[ProviderRouter] Unknown provider: ${providerType}`);

  const models = Object.keys(entry.models);
  if (models.length === 0) throw new Error(`[ProviderRouter] No models for ${providerType}`);

  if (task === "ocr") {
    if (entry.models["mistral-ocr-latest"]) return "mistral-ocr-latest";
    const visionModel = models.find((m) => /vision|pixtral/i.test(m));
    if (visionModel) return visionModel;
  }

  if (task === "vision") {
    const visionModel = models.find((m) => /vision|pixtral/i.test(m));
    if (visionModel) return visionModel;
  }

  if (task === "title") {
    // Prefer Llama 3.1 or 3.3 for titles if available, otherwise any llama3
    const preferredUtility = models.find((m) => /llama-3.[13]/i.test(m)) || 
                             models.find((m) => /llama3/i.test(m));
    
    if (preferredUtility) return preferredUtility;
  }

  // Generic fallback: Prefer reasoning models for artifacts/chat if not specified
  if (task === "chat" || task === "artifact") {
    const reasoningModel = models.find((m) => entry.models[m].reasoning);
    if (reasoningModel) return reasoningModel;
  }

  // Absolute fallback: return the first available model
  return models[0];
}

export function getAvailableModels(userId: number) {
  const registry = loadUserProviderRegistry(userId);
  
  const conceptualModels = [
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

  const models = Object.entries(registry).flatMap(([providerId, entry]) => 
    Object.entries(entry.models).map(([modelId, config]) => ({
      id: modelId,
      name: config.name,
      description: config.description,
      provider: providerId
    }))
  );

  return [...conceptualModels, ...models];
}
