import { command, getRequestEvent } from "$app/server";
import { allowAnonymousChats } from "$lib/constants";
import { getAppDb } from "$lib/server/mastra/storage/libsql/app-db";
import { env } from "$env/dynamic/private";
import { z } from "zod";
import { eq } from "drizzle-orm";
import {
  saveUserCredential as saveUserCredentialFn,
  deleteUserCredential as deleteUserCredentialFn,
  getAllUserCredentials,
  getUserCredential,
  decryptCustomProvider
} from "$lib/server/mastra/provider/credentials";
import {
  setModelVisibility,
  setAllModelVisibility as setAllModelVisibilityFn,
  getVisibleModelIdsForUser
} from "$lib/server/mastra/provider/visibility";
import { getAvailableModelsForUser, type AugmentedModelInfo } from "$lib/server/mastra/provider/availability";
import { CustomProviderEncryptedDataSchema } from "$lib/server/mastra/provider/spec";
import { SUPPORTED_PROVIDER_IDS } from "$lib/server/mastra/provider/catalog";
import { agentSettings } from "$lib/server/mastra/storage/libsql/app-db.schema";
import type { ProviderId } from "$lib/provider/types";

const envKeys: Record<string, string | undefined> = env;

const credentialTypeSchema = z.enum(['env', 'credential', 'custom']);
const providerIdSchema = z.string().min(1).regex(/^[a-z0-9_-]+$/, 'Invalid provider id');
const modelSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1)
});
const headerSchema = z.object({
  name: z.string().min(1),
  value: z.string().min(1)
});

type AuthSuccess = { user: { id: number } };
type AuthFailure = { error: string };
type AuthResult = AuthSuccess | AuthFailure;

function getAuthenticatedUserId(errorMessage: string): AuthResult {
  const { locals } = getRequestEvent();
  if (!locals.user && !allowAnonymousChats) {
    return { error: "Unauthorized" };
  }
  if (!locals.user) {
    return { error: errorMessage };
  }
  return { user: { id: locals.user.id } };
}

function getStrictUserId(): AuthResult {
  const { locals } = getRequestEvent();
  if (!locals.user) {
    return { error: "Unauthorized" };
  }
  return { user: { id: locals.user.id } };
}

function isAuthFailure(result: AuthResult): result is AuthFailure {
  return 'error' in result;
}

function isKnownCredentialType(value: string): value is 'env' | 'credential' | 'custom' {
  return value === 'env' || value === 'credential' || value === 'custom';
}

interface ProviderSummary {
  provider: string;
  name: string;
  enabled: boolean;
  source: 'db' | 'env' | 'platform';
  priority: number;
  baseUrl: string;
  credentialType: string;
}

type SaveCredentialResult =
  | { success: true; message: string }
  | { success: false; message: string };

type SimpleResult =
  | { success: true }
  | { success: false; message: string };

type GetUserCredentialsResult =
  | { success: true; providers: ProviderSummary[] }
  | { success: false; message: string; providers: [] };

type GetModelVisibilityResult =
  | { success: true; visibleModelIds: string[] }
  | { success: false; message: string };

type GetAgentSettingsResult =
  | { success: true; globalToolsEnabled: boolean }
  | { success: false; message: string };

type GetAvailableModelsResult =
  | { success: true; models: AugmentedModelInfo[] }
  | { success: false; message: string };

const saveUserCredentialInputSchema = z.object({
  providerId: providerIdSchema,
  credentialType: credentialTypeSchema,
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
  priority: z.number().int().optional(),
  enabled: z.boolean().optional(),
  models: z.array(modelSchema).optional(),
  headers: z.array(headerSchema).optional(),
  displayName: z.string().optional()
});

type SaveUserCredentialInput = z.infer<typeof saveUserCredentialInputSchema>;

export const saveUserCredential = command(
  saveUserCredentialInputSchema,
  async (input: SaveUserCredentialInput): Promise<SaveCredentialResult> => {
    const auth = getAuthenticatedUserId("User session required to store API keys");
    if (isAuthFailure(auth)) {
      return { success: false, message: auth.error };
    }

    try {
      const db = getAppDb();

      if (input.credentialType === 'custom') {
        CustomProviderEncryptedDataSchema.parse({
          displayName: input.displayName ?? input.providerId,
          baseUrl: input.baseUrl ?? '',
          apiKey: input.apiKey,
          models: input.models ?? [],
          headers: input.headers ?? []
        });
      }

      await saveUserCredentialFn(db, envKeys, {
        userId: auth.user.id,
        providerId: input.providerId,
        credentialType: input.credentialType,
        apiKey: input.apiKey,
        baseUrl: input.baseUrl,
        priority: input.priority,
        enabled: input.enabled,
        models: input.models,
        headers: input.headers,
        displayName: input.displayName
      });

      return { success: true, message: 'Provider saved' };
    } catch (err) {
      if (err instanceof z.ZodError) {
        const issues = err.issues.map(i => i.message).join(', ');
        return { success: false, message: `Invalid custom provider data: ${issues}` };
      }
      console.error(`[saveUserCredential:${input.providerId}] Failed to save:`, err);
      return { success: false, message: 'Failed to save' };
    }
  }
);

const deleteUserCredentialInputSchema = z.object({
  providerId: providerIdSchema
});

export const deleteUserCredential = command(
  deleteUserCredentialInputSchema,
  async ({ providerId }): Promise<SimpleResult> => {
    const auth = getStrictUserId();
    if (isAuthFailure(auth)) {
      return { success: false, message: auth.error };
    }

    try {
      const db = getAppDb();
      await deleteUserCredentialFn(db, auth.user.id, providerId);
      return { success: true };
    } catch (err) {
      console.error(`[deleteUserCredential:${providerId}] Failed to delete:`, err);
      return { success: false, message: 'Failed to delete' };
    }
  }
);

export const getUserCredentials = command(
  z.object({}),
  async (): Promise<GetUserCredentialsResult> => {
    const auth = getAuthenticatedUserId("No user session");
    if (isAuthFailure(auth)) {
      if (auth.error === "Unauthorized") {
        return { success: false, message: auth.error, providers: [] };
      }
      return { success: true, providers: [] };
    }

    try {
      const db = getAppDb();
      const credentials = await getAllUserCredentials(
        db,
        envKeys,
        auth.user.id,
        [...SUPPORTED_PROVIDER_IDS]
      );

      const providers: ProviderSummary[] = credentials.map(c => {
        let baseUrl = '';
        if (c.credentialType === 'custom' && c.encryptedData) {
          const customData = decryptCustomProvider(c.encryptedData, envKeys);
          baseUrl = customData?.baseUrl ?? '';
        }
        return {
          provider: c.providerId,
          name: c.apiKeyMasked,
          enabled: c.enabled === 1,
          source: c.source,
          priority: c.priority,
          baseUrl,
          credentialType: c.credentialType
        };
      });

      return { success: true, providers };
    } catch (err) {
      console.error("[getUserCredentials] Failed to fetch providers:", err);
      return { success: false, message: 'Failed to fetch providers', providers: [] };
    }
  }
);

const updateUserCredentialInputSchema = z.object({
  providerId: providerIdSchema,
  enabled: z.boolean().optional(),
  priority: z.number().int().optional(),
  apiKey: z.string().optional(),
  baseUrl: z.string().optional(),
  models: z.array(modelSchema).optional(),
  headers: z.array(headerSchema).optional(),
  displayName: z.string().optional(),
  credentialType: credentialTypeSchema.optional()
});

type UpdateUserCredentialInput = z.infer<typeof updateUserCredentialInputSchema>;

export const updateUserCredential = command(
  updateUserCredentialInputSchema,
  async (input: UpdateUserCredentialInput): Promise<SimpleResult> => {
    const auth = getStrictUserId();
    if (isAuthFailure(auth)) {
      return { success: false, message: auth.error };
    }

    try {
      const db = getAppDb();
      const existing = await getUserCredential(db, envKeys, auth.user.id, input.providerId);

      if (!existing) {
        return { success: false, message: 'Provider not found' };
      }

      const credentialType = isKnownCredentialType(existing.credentialType)
        ? existing.credentialType
        : 'credential';

      await saveUserCredentialFn(db, envKeys, {
        userId: auth.user.id,
        providerId: input.providerId,
        credentialType: input.credentialType ?? credentialType,
        apiKey: input.apiKey,
        baseUrl: input.baseUrl,
        priority: input.priority ?? existing.priority,
        enabled: input.enabled ?? (existing.enabled === 1),
        models: input.models,
        headers: input.headers,
        displayName: input.displayName
      });

      return { success: true };
    } catch (err) {
      console.error(`[updateUserCredential:${input.providerId}] Failed to update:`, err);
      return { success: false, message: 'Failed to update' };
    }
  }
);

const updateModelVisibilityInputSchema = z.object({
  modelId: z.string().min(1),
  visible: z.boolean()
});

export const updateModelVisibility = command(
  updateModelVisibilityInputSchema,
  async ({ modelId, visible }): Promise<SimpleResult> => {
    const auth = getStrictUserId();
    if (isAuthFailure(auth)) {
      return { success: false, message: auth.error };
    }

    try {
      const db = getAppDb();
      await setModelVisibility(db, auth.user.id, modelId, visible);
      return { success: true };
    } catch (err) {
      console.error(`[updateModelVisibility:${modelId}] Failed:`, err);
      return { success: false, message: 'Failed to update model visibility' };
    }
  }
);

const setAllModelVisibilityInputSchema = z.object({
  modelIds: z.array(z.string().min(1)),
  visible: z.boolean()
});

export const setAllModelVisibility = command(
  setAllModelVisibilityInputSchema,
  async ({ modelIds, visible }): Promise<SimpleResult> => {
    const auth = getStrictUserId();
    if (isAuthFailure(auth)) {
      return { success: false, message: auth.error };
    }

    try {
      const db = getAppDb();
      await setAllModelVisibilityFn(db, auth.user.id, modelIds, visible);
      return { success: true };
    } catch (err) {
      console.error("[setAllModelVisibility] Failed:", err);
      return { success: false, message: 'Failed to update model visibility' };
    }
  }
);

export const getModelVisibility = command(
  z.object({}),
  async (): Promise<GetModelVisibilityResult> => {
    const auth = getStrictUserId();
    if (isAuthFailure(auth)) {
      return { success: false, message: auth.error };
    }

    try {
      const db = getAppDb();
      const visible = await getVisibleModelIdsForUser(db, auth.user.id);
      return { success: true, visibleModelIds: [...visible] };
    } catch (err) {
      console.error("[getModelVisibility] Failed:", err);
      return { success: false, message: 'Failed to fetch model visibility' };
    }
  }
);

const getAgentSettingsInputSchema = z.object({});

export const getAgentSettings = command(
  getAgentSettingsInputSchema,
  async (): Promise<GetAgentSettingsResult> => {
    const auth = getStrictUserId();
    if (isAuthFailure(auth)) {
      return { success: false, message: auth.error };
    }

    try {
      const db = getAppDb();
      const [settings] = await db
        .select()
        .from(agentSettings)
        .where(eq(agentSettings.userId, auth.user.id))
        .limit(1);
      const globalToolsEnabled = settings ? settings.globalToolsEnabled === 1 : true;
      return { success: true, globalToolsEnabled };
    } catch (err) {
      console.error("[getAgentSettings] Failed:", err);
      return { success: false, message: 'Failed to fetch settings' };
    }
  }
);

const updateAgentSettingsInputSchema = z.object({
  globalToolsEnabled: z.boolean().optional()
});

export const updateAgentSettings = command(
  updateAgentSettingsInputSchema,
  async ({ globalToolsEnabled }): Promise<SimpleResult> => {
    const auth = getStrictUserId();
    if (isAuthFailure(auth)) {
      return { success: false, message: auth.error };
    }

    try {
      const db = getAppDb();
      const now = new Date().toISOString();
      await db
        .insert(agentSettings)
        .values({
          userId: auth.user.id,
          globalToolsEnabled: globalToolsEnabled !== undefined ? (globalToolsEnabled ? 1 : 0) : 1,
          updatedAt: now
        })
        .onConflictDoUpdate({
          target: [agentSettings.userId],
          set: {
            globalToolsEnabled:
              globalToolsEnabled !== undefined ? (globalToolsEnabled ? 1 : 0) : undefined,
            updatedAt: now
          }
        });
      return { success: true };
    } catch (err) {
      console.error("[updateAgentSettings] Failed:", err);
      return { success: false, message: 'Failed to update settings' };
    }
  }
);

export const getAvailableModels = command(
  z.object({}),
  async (): Promise<GetAvailableModelsResult> => {
    const auth = getStrictUserId();
    if (isAuthFailure(auth)) {
      return { success: false, message: auth.error };
    }

    try {
      const db = getAppDb();
      const models = await getAvailableModelsForUser(db, envKeys, auth.user.id);
      return { success: true, models };
    } catch (err) {
      console.error("[getAvailableModels] Failed to resolve models:", err);
      return { success: false, message: 'Failed to fetch models' };
    }
  }
);

interface PlatformDefault {
  providerId: ProviderId;
  envKey: string;
  hasEnvKey: boolean;
}

type GetPlatformDefaultsResult = {
  success: true;
  defaults: PlatformDefault[];
};

const PLATFORM_PROVIDER_ENV_KEYS: ReadonlyArray<{ providerId: ProviderId; envKey: string }> = [
  { providerId: 'groq' as ProviderId, envKey: 'GROQ_API_KEY' },
  { providerId: 'deepseek' as ProviderId, envKey: 'DEEPSEEK_API_KEY' },
  { providerId: 'opencode' as ProviderId, envKey: 'OPENCODE_API_KEY' }
];

export const getPlatformDefaults = command(
  z.object({}),
  async (): Promise<GetPlatformDefaultsResult> => {
    const auth = getStrictUserId();
    if (isAuthFailure(auth)) {
      return { success: true, defaults: [] };
    }

    const defaults: PlatformDefault[] = PLATFORM_PROVIDER_ENV_KEYS.map((p) => ({
      providerId: p.providerId,
      envKey: p.envKey,
      hasEnvKey: Boolean(envKeys[p.envKey])
    })).filter((d) => d.hasEnvKey);

    return { success: true, defaults };
  }
);
