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
  getCustomCredentialBaseUrl
} from "$lib/server/mastra/provider/credentials";
import {
  setModelVisibility,
  setAllModelVisibility as setAllModelVisibilityFn,
  getHiddenModelIdsForUser,
  getEnabledModelIdsForUser
} from "$lib/server/mastra/provider/visibility";
import {
  getAvailableModelsForUser,
  getAllDiscoveredModelsForSettings,
  type AugmentedModelInfo
} from "$lib/server/mastra/provider/availability";
import { CustomProviderEncryptedDataSchema } from "$lib/server/mastra/provider/spec";
import { SUPPORTED_PROVIDER_IDS } from "$lib/provider/catalog";
import { agentSettings } from "$lib/server/mastra/storage/libsql/app-db.schema";
import { smGeneralSettings } from "$lib/server/db/sms-schema";
import { getDatabase as getMysqlDatabase } from "$lib/server/db";
import type { ProviderId } from "$lib/provider/types";
import {
  exportDonations as exportDonationsFn,
  importDonations as importDonationsFn,
  assertUploadSize,
  PotluckUploadTooLargeError,
  POTLUCK_MAX_UPLOAD_BYTES,
  type ExportMode,
  type ImportResult
} from "$lib/server/service/potluck.service";
import {
  donateUserCredential as donateUserCredentialFn,
  listMyDonations as listMyDonationsFn,
  revokeMyDonation as revokeMyDonationFn
} from "$lib/server/service/user-donation.service";
import { log } from "$lib/server/audit-log";

const envKeys: Record<string, string | undefined> = env;

const credentialTypeSchema = z.enum(['credential', 'custom']);
const providerIdSchema = z.string().min(1).regex(/^[a-z0-9_-]+$/, 'Invalid provider id');
const modelSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1)
});
const headerSchema = z.object({
  name: z.string().min(1),
  value: z.string().min(1)
});

type AuthSuccess = { user: { id: number; schoolId: number | null; staffId: number | null; designation: string | null | undefined } };
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
  return {
    user: {
      id: locals.user.id,
      schoolId: locals.user.schoolId ?? null,
      staffId: typeof locals.user.staffId === "number" ? locals.user.staffId : null,
      designation: locals.user.designation ?? null
    }
  };
}

function getStrictUserId(): AuthResult {
  const { locals } = getRequestEvent();
  if (!locals.user) {
    return { error: "Unauthorized" };
  }
  return {
    user: {
      id: locals.user.id,
      schoolId: locals.user.schoolId ?? null,
      staffId: typeof locals.user.staffId === "number" ? locals.user.staffId : null,
      designation: locals.user.designation ?? null
    }
  };
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
  source: 'db' | 'platform';
  priority: number;
  baseUrl: string;
  credentialType: 'credential' | 'custom';
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
  | { success: true; hiddenModelIds: string[] }
  | { success: false; message: string };

type GetAgentSettingsResult =
  | { success: true; globalToolsEnabled: boolean }
  | { success: false; message: string };

type GetAvailableModelsResult =
  | {
      success: true;
      models: AugmentedModelInfo[];
      hiddenModelIds: string[];
      enabledModelIds: string[];
    }
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
      return { success: false, message: auth.error, providers: [] };
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
        const baseUrl = getCustomCredentialBaseUrl(c, envKeys);
        const credentialType: 'credential' | 'custom' =
          c.credentialKind === 'custom' ? 'custom' : 'credential';
        return {
          provider: c.providerId,
          name: c.apiKeyMasked,
          enabled: c.enabled === 1,
          source: c.source,
          priority: c.priority,
          baseUrl,
          credentialType
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

      const credentialType = isKnownCredentialType(existing.credentialKind)
        ? existing.credentialKind
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
      const hidden = await getHiddenModelIdsForUser(db, auth.user.id);
      return { success: true, hiddenModelIds: [...hidden] };
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
      const [models, hiddenIds, enabledIds] = await Promise.all([
        getAvailableModelsForUser(db, envKeys, auth.user.id, auth.user.schoolId ?? 1, auth.user.designation ?? null),
        getHiddenModelIdsForUser(db, auth.user.id),
        getEnabledModelIdsForUser(db, auth.user.id)
      ]);
      return {
        success: true,
        models,
        hiddenModelIds: [...hiddenIds],
        enabledModelIds: [...enabledIds]
      };
    } catch (err) {
      console.error("[getAvailableModels] Failed to resolve models:", err);
      return { success: false, message: 'Failed to fetch models' };
    }
  }
);

type GetSettingsModelsResult =
  | { success: true; models: AugmentedModelInfo[] }
  | { success: false; message: string };

export const getSettingsModels = command(
  z.object({}),
  async (): Promise<GetSettingsModelsResult> => {
    const auth = getStrictUserId();
    if (isAuthFailure(auth)) {
      return { success: false, message: auth.error };
    }

    try {
      const db = getAppDb();
      const models = await getAllDiscoveredModelsForSettings(
        db,
        envKeys,
        auth.user.id,
        auth.user.schoolId ?? 1,
        auth.user.designation ?? null
      );
      return { success: true, models };
    } catch (err) {
      console.error("[getSettingsModels] Failed to resolve settings models:", err);
      return { success: false, message: 'Failed to fetch settings models' };
    }
  }
);

interface PlatformDefault {
  providerId: ProviderId;
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
      hasEnvKey: Boolean(envKeys[p.envKey])
    })).filter((d) => d.hasEnvKey);

    return { success: true, defaults };
  }
);

// ────────────────────────────── Pot-Luck CSV ──────────────────────────────

function isAdminOrItRole(user: NonNullable<App.Locals["user"]>): boolean {
  if (user.isAdministrator === true) return true;
  return user.designation === "it";
}

async function resolveSchoolNameForUser(
  auth: { user: { id: number; schoolId: number | null } }
): Promise<string> {
  const schoolId = typeof auth.user.schoolId === "number" ? auth.user.schoolId : 1;
  try {
    const mysql = await getMysqlDatabase();
    const rows = await mysql
      .select({ schoolName: smGeneralSettings.schoolName })
      .from(smGeneralSettings)
      .where(eq(smGeneralSettings.schoolId, schoolId))
      .limit(1);
    const name = rows[0]?.schoolName;
    return typeof name === "string" && name.length > 0 ? name : `school-${schoolId}`;
  } catch {
    return `school-${schoolId}`;
  }
}

export interface ExportPotluckResult {
  success: boolean;
  message?: string;
  csv?: string;
  count?: number;
  mode?: ExportMode;
}

export const exportPotluckDonations = command(
  z.object({
    mode: z.enum(["metadata-only", "encrypted"]),
    passphrase: z.string().min(1).max(512).optional()
  }),
  async ({ mode, passphrase }): Promise<ExportPotluckResult> => {
    const auth = getStrictUserId();
    if (isAuthFailure(auth)) return { success: false, message: auth.error };
    if (!isAdminOrItRole(auth.user as NonNullable<App.Locals["user"]>)) {
      return { success: false, message: "admin or IT role required" };
    }
    if (mode === "encrypted" && !passphrase) {
      return { success: false, message: "passphrase required for encrypted mode" };
    }
    const schoolId = typeof auth.user.schoolId === "number" ? auth.user.schoolId : 1;
    const schoolName = await resolveSchoolNameForUser(auth);
    try {
      const result = await exportDonationsFn(getAppDb(), envKeys, schoolId, {
        mode,
        passphrase: mode === "encrypted" ? passphrase : undefined,
        schoolName
      });
      if (typeof auth.user.staffId === "number") {
        await log({
          schoolId,
          actorStaffId: auth.user.staffId,
          action: "export",
          entityType: "potluckDonations",
          entityId: String(schoolId),
          before: { requested: true },
          after: {
            mode: result.mode,
            count: result.count,
            csvBytes: result.csv.length
            // Never log passphrase, decrypted key, or the CSV body itself.
          }
        });
      }
      return { success: true, csv: result.csv, count: result.count, mode: result.mode };
    } catch (err) {
      console.error("[exportPotluckDonations] failed", err);
      return { success: false, message: "export failed" };
    }
  }
);

export interface ImportPotluckResult {
  success: boolean;
  message?: string;
  result?: ImportResult;
}

export const importPotluckDonations = command(
  z.object({
    csv: z.string().min(0).max(POTLUCK_MAX_UPLOAD_BYTES + 1024),
    passphrase: z.string().min(0).max(512).optional(),
    conflictStrategy: z.enum(["skip", "replace"])
  }),
  async ({ csv, passphrase, conflictStrategy }): Promise<ImportPotluckResult> => {
    const auth = getStrictUserId();
    if (isAuthFailure(auth)) return { success: false, message: auth.error };
    if (!isAdminOrItRole(auth.user as NonNullable<App.Locals["user"]>)) {
      return { success: false, message: "admin or IT role required" };
    }
    const schoolId = typeof auth.user.schoolId === "number" ? auth.user.schoolId : 1;
    try {
      assertUploadSize(csv);
    } catch (err) {
      if (err instanceof PotluckUploadTooLargeError) {
        return {
          success: false,
          message: `file exceeds ${err.maxBytes} bytes (got ${err.sizeBytes})`
        };
      }
      throw err;
    }
    const schoolName = await resolveSchoolNameForUser(auth);
    try {
      const result = await importDonationsFn(getAppDb(), envKeys, csv, {
        passphrase: passphrase && passphrase.length > 0 ? passphrase : undefined,
        schoolName,
        conflictStrategy
      });
      if (typeof auth.user.staffId === "number") {
        await log({
          schoolId,
          actorStaffId: auth.user.staffId,
          action: "import",
          entityType: "potluckDonations",
          entityId: String(schoolId),
          before: { requested: true, csvBytes: csv.length, conflictStrategy },
          after: {
            imported: result.imported,
            skipped: result.skipped,
            replaced: result.replaced,
            failures: result.failures.length
            // Never log passphrase, decrypted keys, or the CSV body itself.
          }
        });
      }
      return { success: true, result };
    } catch (err) {
      console.error("[importPotluckDonations] failed", err);
      return { success: false, message: "import failed" };
    }
  }
);

// ─── User-facing pot-luck donation commands ────────────────────────────────

const donateUserCredentialInputSchema = z.object({
  providerId: providerIdSchema,
  apiKey: z.string().min(10).max(1024)
});

type DonateUserCredentialResult =
  | { success: true; donationId: string; providerId: string }
  | { success: false; message: string };

export const donateUserCredential = command(
  donateUserCredentialInputSchema,
  async (input): Promise<DonateUserCredentialResult> => {
    const auth = getStrictUserId();
    if (isAuthFailure(auth)) {
      return { success: false, message: auth.error };
    }
    if (typeof auth.user.schoolId !== "number") {
      return { success: false, message: "School scope required" };
    }
    try {
      const result = await donateUserCredentialFn({
        db: getAppDb(),
        userId: auth.user.id,
        schoolId: auth.user.schoolId,
        userRole: auth.user.designation ?? null,
        staffId: auth.user.staffId,
        providerId: input.providerId as ProviderId,
        apiKey: input.apiKey
      });
      if (!result.success) {
        return { success: false, message: result.error ?? "Donation failed" };
      }
      return {
        success: true,
        donationId: result.donation?.id ?? "",
        providerId: input.providerId
      };
    } catch (err) {
      console.error(`[donateUserCredential:${input.providerId}] failed`, err);
      return { success: false, message: "Donation failed" };
    }
  }
);

type MyDonation = {
  id: string;
  providerId: string;
  donatedAt: string;
  isActive: boolean;
  tosVersion: string | null;
};

type GetMyDonationsResult =
  | { success: true; donations: MyDonation[] }
  | { success: false; message: string; donations: [] };

export const getMyDonations = command(z.object({}), async (): Promise<GetMyDonationsResult> => {
  const auth = getStrictUserId();
  if (isAuthFailure(auth)) {
    return { success: false, message: auth.error, donations: [] };
  }
  if (typeof auth.user.schoolId !== "number") {
    return { success: false, message: "School scope required", donations: [] };
  }
  try {
    const donations = await listMyDonationsFn({
      db: getAppDb(),
      userId: auth.user.id,
      schoolId: auth.user.schoolId
    });
    return {
      success: true,
      donations: donations.map((d) => ({
        id: d.id,
        providerId: d.providerId,
        donatedAt: d.donatedAt,
        isActive: d.isActive,
        tosVersion: d.tosVersion
      }))
    };
  } catch (err) {
    console.error("[getMyDonations] failed", err);
    return { success: false, message: "Failed to load donations", donations: [] };
  }
});

const revokeMyDonationInputSchema = z.object({
  donationId: z.string().min(1).max(128)
});

export const revokeMyDonation = command(
  revokeMyDonationInputSchema,
  async (input): Promise<SimpleResult> => {
    const auth = getStrictUserId();
    if (isAuthFailure(auth)) {
      return { success: false, message: auth.error };
    }
    if (typeof auth.user.schoolId !== "number") {
      return { success: false, message: "School scope required" };
    }
    try {
      const result = await revokeMyDonationFn({
        db: getAppDb(),
        userId: auth.user.id,
        schoolId: auth.user.schoolId,
        staffId: auth.user.staffId,
        donationId: input.donationId
      });
      if (!result.success) {
        return { success: false, message: result.error ?? "Revoke failed" };
      }
      return { success: true };
    } catch (err) {
      console.error(`[revokeMyDonation] failed`, err);
      return { success: false, message: "Revoke failed" };
    }
  }
);
