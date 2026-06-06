import { command, getRequestEvent } from "$app/server";
import { allowAnonymousChats } from "$lib/constants";
import { CredentialType } from "$lib/schema/chat-schema";
import { getAppDb } from "$lib/server/mastra/storage/libsql/app-db";
import { 
  saveProviderCredential, 
  deleteProviderCredential, 
  getAllActiveProviders,
  encrypt,
  maskKey,
  ensureAgentTables
} from "$lib/server/mastra/provider-config";
import { agentRouting, agentSettings } from "$lib/server/mastra/storage/libsql/app-db.schema";
import { eq, and } from "drizzle-orm";
import { env } from "$env/dynamic/private";
import z from "zod";

const SUPPORTED_PROVIDERS = ['groq', 'deepseek', 'mistral', 'nvidia_nim', 'opencode'];

export const addProvider = command(
  z.object({
    provider: z.enum(CredentialType),
    apiKey: z.string().optional(),
    priority: z.number().optional(),
    baseUrl: z.string().optional(),
  }),
  async ({ provider, apiKey, priority, baseUrl }) => {
    const { locals } = getRequestEvent();
    if (!locals.user && !allowAnonymousChats) {
      return { success: false, message: "Unauthorized" };
    }

    if (!locals.user) {
      return { success: false, message: "User session required to store API keys" };
    }

    try {
      const db = getAppDb();
      const encryptionKey = env.TOKEN_ENCRYPTION_KEY || "edapex-default-encryption-key-32ch";
      
      // Fetch existing to preserve key if not provided
      const envKeys = env as Record<string, string | undefined>;
      const existing = await getAllActiveProviders(db, locals.user.id, envKeys, SUPPORTED_PROVIDERS);
      const current = existing.find(p => p.provider === provider);

      let encryptedKey = current?.apiKeyEncrypted || '';
      if (apiKey) {
        encryptedKey = encrypt(apiKey, encryptionKey);
      }

      await saveProviderCredential(db, {
        provider,
        userId: locals.user.id,
        apiKeyEncrypted: encryptedKey,
        priority: priority ?? current?.priority ?? 1,
        baseUrl: baseUrl ?? current?.baseUrl ?? '',
        enabled: current?.enabled ?? 1
      });

      return { success: true, message: `${provider} configuration updated` };
    } catch (error) {
      console.error(`[addProvider:${provider}] Failed to update provider:`, error);
      return { success: false, message: "Failed to save configuration" };
    }
  },
);

export const removeProvider = command(
  z.object({
    provider: z.enum(CredentialType),
  }),
  async ({ provider }) => {
    const { locals } = getRequestEvent();
    if (!locals.user && !allowAnonymousChats) {
      return { success: false, message: "Unauthorized" };
    }

    if (!locals.user) {
      return { success: false, message: "User session required" };
    }

    try {
      const db = getAppDb();
      await deleteProviderCredential(db, locals.user.id, provider);
      return { success: true, message: `${provider} API key removed` };
    } catch (error) {
      console.error(`[removeProvider:${provider}] Failed to remove API key:`, error);
      return { success: false, message: "Failed to remove API key" };
    }
  },
);

export const getProviders = command(
  z.object({}),
  async () => {
    const { locals } = getRequestEvent();
    if (!locals.user && !allowAnonymousChats) {
      return { success: false, message: "Unauthorized", providers: [] };
    }

    if (!locals.user) {
      return { success: true, message: "No user session", providers: [] };
    }

    try {
      const db = getAppDb();
      // Pass the actual env object for fallbacks
      const envKeys = env as Record<string, string | undefined>;
      const providers = await getAllActiveProviders(db, locals.user.id, envKeys, SUPPORTED_PROVIDERS);
      
      // Map to the simple format expected by the frontend
      const mappedProviders = providers.map(p => ({
        provider: p.provider,
        name: p.apiKeyMasked,
        enabled: p.enabled === 1,
        source: p.source,
        priority: p.priority,
        baseUrl: p.baseUrl
      }));

      return { success: true, providers: mappedProviders };
    } catch (error) {
      console.error("[getProviders] Failed to fetch providers:", error);
      return { success: false, message: "Failed to fetch providers", providers: [] };
    }
  },
);

export const toggleProvider = command(
  z.object({
    provider: z.enum(CredentialType),
    enabled: z.boolean(),
  }),
  async ({ provider, enabled }) => {
    const { locals } = getRequestEvent();
    if (!locals.user) {
      return { success: false, message: "Unauthorized" };
    }

    try {
      const db = getAppDb();
      
      // To toggle without changing the key, we need to fetch existing or create empty
      const providers = await getAllActiveProviders(db, locals.user.id, env as Record<string, string | undefined>, SUPPORTED_PROVIDERS);
      const existing = providers.find(p => p.provider === provider);

      if (existing && existing.source === 'db') {
          await saveProviderCredential(db, {
              provider,
              userId: locals.user.id,
              apiKeyEncrypted: existing.apiKeyEncrypted,
              priority: existing.priority,
              baseUrl: existing.baseUrl,
              enabled: enabled ? 1 : 0
          });
      } else {
          // If it was an env fallback, we create a DB entry to override it as disabled (or enabled)
          await saveProviderCredential(db, {
              provider,
              userId: locals.user.id,
              apiKeyEncrypted: '', // Override but keep empty key (system will use fallback or fail gracefully)
              priority: 99,
              baseUrl: existing?.baseUrl || '',
              enabled: enabled ? 1 : 0
          });
      }

      return { success: true, message: `${provider} ${enabled ? "enabled" : "disabled"}` };
    } catch (error) {
      console.error(`[toggleProvider] Failed to toggle ${provider}:`, error);
      return { success: false, message: "Failed to update provider status" };
    }
  },
);

export const getAgentRouting = command(
  z.object({}),
  async () => {
    const { locals } = getRequestEvent();
    if (!locals.user) return { success: false, message: "Unauthorized", routing: [] };

    try {
      const db = getAppDb();
      await ensureAgentTables(db);
      const routing = await db.select().from(agentRouting).where(eq(agentRouting.userId, locals.user.id));
      return { success: true, routing };
    } catch (error) {
      console.error("[getAgentRouting] Failed:", error);
      return { success: false, message: "Failed to fetch routing", routing: [] };
    }
  }
);

export const updateAgentRouting = command(
  z.object({
    role: z.string(),
    provider: z.string(),
    model: z.string(),
  }),
  async ({ role, provider, model }) => {
    const { locals } = getRequestEvent();
    if (!locals.user) return { success: false, message: "Unauthorized" };

    try {
      const db = getAppDb();
      await ensureAgentTables(db);
      await db.insert(agentRouting).values({
        userId: locals.user.id,
        role,
        provider,
        model,
        updatedAt: new Date().toISOString()
      }).onConflictDoUpdate({
        target: [agentRouting.userId, agentRouting.role],
        set: { provider, model, updatedAt: new Date().toISOString() }
      });
      return { success: true, message: `Routing for ${role} updated` };
    } catch (error) {
      console.error("[updateAgentRouting] Failed:", error);
      return { success: false, message: "Failed to update routing" };
    }
  }
);

export const getAgentSettings = command(
  z.object({}),
  async () => {
    const { locals } = getRequestEvent();
    if (!locals.user) return { success: false, message: "Unauthorized", settings: null };

    try {
      const db = getAppDb();
      await ensureAgentTables(db);
      const [settings] = await db.select().from(agentSettings).where(eq(agentSettings.userId, locals.user.id)).limit(1);
      return { success: true, settings: settings || { profile: 'balanced', globalToolsEnabled: 1 } };
    } catch (error) {
      console.error("[getAgentSettings] Failed:", error);
      return { success: false, message: "Failed to fetch settings", settings: null };
    }
  }
);

export const updateAgentSettings = command(
  z.object({
    profile: z.string().optional(),
    globalToolsEnabled: z.boolean().optional(),
  }),
  async ({ profile, globalToolsEnabled }) => {
    const { locals } = getRequestEvent();
    if (!locals.user) return { success: false, message: "Unauthorized" };

    try {
      const db = getAppDb();
      await ensureAgentTables(db);
      await db.insert(agentSettings).values({
        userId: locals.user.id,
        profile: profile ?? 'balanced',
        globalToolsEnabled: globalToolsEnabled !== undefined ? (globalToolsEnabled ? 1 : 0) : 1,
        updatedAt: new Date().toISOString()
      }).onConflictDoUpdate({
        target: [agentSettings.userId],
        set: { 
          profile: profile ?? undefined, 
          globalToolsEnabled: globalToolsEnabled !== undefined ? (globalToolsEnabled ? 1 : 0) : undefined,
          updatedAt: new Date().toISOString()
        }
      });
      return { success: true, message: "Settings updated" };
    } catch (error) {
      console.error("[updateAgentSettings] Failed:", error);
      return { success: false, message: "Failed to update settings" };
    }
  }
);
