/**
 * User credential CRUD over the `user_credentials` table.
 *
 * The resolver does the user-credential → env-fallback resolution inline.
 */
import { eq, and } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { z } from 'zod';
import {
	userCredentials,
	type UserCredential
} from '$lib/server/mastra/storage/libsql/app-db.schema';
import { ProviderIdSchema, type ProviderId } from './types';
import { encrypt as encryptText, decrypt as decryptText, maskKey, getEncryptionKey } from './crypto';
import { DecryptionError } from '$lib/provider/errors';
import { CustomProviderEncryptedDataSchema } from './spec';
import { log as writeAudit } from '$lib/server/audit-log';

export interface CredentialAuditContext {
	actorStaffId: number;
	schoolId: number;
}

export interface UserCredentialState extends UserCredential {
	source: 'db' | 'platform';
	apiKeyMasked: string;
}

export interface SaveUserCredentialInput {
	userId: number;
	providerId: ProviderId;
	credentialType: 'env' | 'credential' | 'custom';
	apiKey?: string;
	baseUrl?: string;
	priority?: number;
	enabled?: boolean;
	models?: Array<{ id: string; displayName: string }>;
	headers?: Array<{ name: string; value: string }>;
	displayName?: string;
}

const SaveUserCredentialInputSchema = z.object({
	userId: z.number().int().positive(),
	providerId: ProviderIdSchema,
	credentialType: z.enum(['env', 'credential', 'custom']),
	apiKey: z.string().min(1).optional(),
	baseUrl: z.string().url().optional(),
	priority: z.number().int().min(0).optional(),
	enabled: z.boolean().optional(),
	models: z
		.array(z.object({ id: z.string().min(1), displayName: z.string().min(1) }))
		.optional(),
	headers: z.array(z.object({ name: z.string().min(1), value: z.string().min(1) })).optional(),
	displayName: z.string().min(1).optional()
});

export async function saveUserCredential(
	db: LibSQLDatabase<any>,
	env: Record<string, string | undefined>,
	input: SaveUserCredentialInput,
	audit?: CredentialAuditContext
): Promise<UserCredential> {
	const validated = SaveUserCredentialInputSchema.parse(input);
	const encryptionKey = getEncryptionKey(env);
	const existing = await getUserCredential(db, env, validated.userId, validated.providerId);

	let encryptedData: string | null = null;

	if (validated.credentialType === 'credential') {
		if (validated.apiKey) {
			encryptedData = encryptText(JSON.stringify({ apiKey: validated.apiKey }), encryptionKey);
		} else if (existing?.encryptedData) {
			encryptedData = existing.encryptedData;
		} else {
			throw new Error('apiKey is required to create a credential-type credential');
		}
	} else if (validated.credentialType === 'custom') {
		const prior = safeParseCustom(existing?.encryptedData ?? null, env);
		const payload = CustomProviderEncryptedDataSchema.parse({
			displayName: validated.displayName ?? prior?.displayName ?? validated.providerId,
			baseUrl: validated.baseUrl ?? prior?.baseUrl ?? '',
			apiKey: validated.apiKey ?? prior?.apiKey,
			models: validated.models ?? prior?.models ?? [],
			headers: validated.headers ?? prior?.headers ?? []
		});
		encryptedData = encryptText(JSON.stringify(payload), encryptionKey);
	}

	const now = new Date().toISOString();
	const priority = validated.priority ?? existing?.priority ?? 1;
	const enabled = validated.enabled !== undefined ? (validated.enabled ? 1 : 0) : (existing?.enabled ?? 1);

	const written: UserCredential = {
		id: existing?.id ?? crypto.randomUUID(),
		userId: validated.userId,
		providerId: validated.providerId,
		credentialType: validated.credentialType,
		encryptedData,
		priority,
		enabled,
		createdAt: existing?.createdAt ?? now,
		updatedAt: now,
		discoveredModels: existing?.discoveredModels ?? null,
		discoveredAt: existing?.discoveredAt ?? null
	};

	await db
		.insert(userCredentials)
		.values(written)
		.onConflictDoUpdate({
			target: [userCredentials.userId, userCredentials.providerId],
			set: {
				credentialType: validated.credentialType,
				encryptedData,
				priority,
				enabled,
				updatedAt: now
			}
		});

	if (audit) {
		await writeAudit({
			schoolId: audit.schoolId,
			actorStaffId: audit.actorStaffId,
			action: existing ? 'update' : 'create',
			entityType: 'userCredential',
			entityId: written.id,
			before: existing
				? {
						credentialType: existing.credentialType,
						priority: existing.priority,
						enabled: existing.enabled
				  }
				: undefined,
			after: {
				userId: validated.userId,
				providerId: validated.providerId,
				credentialType: validated.credentialType,
				priority,
				enabled: enabled === 1
			}
		});
	}

	// Pass the just-written row directly so discovery doesn't race the
	// INSERT/UPDATE returning. Previously this re-read the row, which could
	// observe a stale value if the DB session hadn't yet seen its own write.
	void discoverAndPersistInBackground(db, env, written).catch((err: unknown) => {
		console.error(`[credentials] model discovery failed for ${validated.providerId}:`, err);
	});

	return written;
}

async function discoverAndPersistInBackground(
	db: LibSQLDatabase<any>,
	env: Record<string, string | undefined>,
	credential: UserCredential
): Promise<void> {
	const { discoverProviderModels, persistDiscoveredModels } = await import('./discovery');
	const models = await discoverProviderModels(credential, env);
	if (models.length === 0) return;
	await persistDiscoveredModels(db, env, credential.userId, credential.providerId, models);
}

function safeParseCustom(
	encryptedData: string | null,
	env: Record<string, string | undefined>
): {
	displayName: string;
	baseUrl: string;
	apiKey?: string;
	models: Array<{ id: string; displayName: string }>;
	headers: Array<{ name: string; value: string }>;
} | null {
	if (!encryptedData) return null;
	try {
		const decrypted = decryptText(encryptedData, getEncryptionKey(env));
		return JSON.parse(decrypted);
	} catch {
		return null;
	}
}

export function decryptCustomProvider(encryptedData: string, env: Record<string, string | undefined>):
	| {
			displayName: string;
			baseUrl: string;
			apiKey?: string;
			models: Array<{ id: string; displayName: string }>;
			headers: Array<{ name: string; value: string }>;
	  }
	| null {
	return safeParseCustom(encryptedData, env);
}

/**
 * Returns the configured baseUrl for a custom credential without exposing
 * the encrypted blob to callers. This keeps `encryptedData` references out
 * of remote-function / UI layers while still allowing the UI to show the
 * custom endpoint URL.
 */
export function getCustomCredentialBaseUrl(
	credential: UserCredential,
	env: Record<string, string | undefined>
): string {
	if (credential.credentialType !== 'custom' || !credential.encryptedData) {
		return '';
	}
	const customData = decryptCustomProvider(credential.encryptedData, env);
	return customData?.baseUrl ?? '';
}

export async function getUserCredential(
	db: LibSQLDatabase<any>,
	env: Record<string, string | undefined>,
	userId: number,
	providerId: ProviderId
): Promise<UserCredential | null> {
	const rows = await db
		.select()
		.from(userCredentials)
		.where(and(eq(userCredentials.userId, userId), eq(userCredentials.providerId, providerId)))
		.limit(1);
	return rows[0] ?? null;
}

export const PLATFORM_ENV_KEYS: Partial<Record<ProviderId, string>> = {
	groq: 'GROQ_API_KEY',
	deepseek: 'DEEPSEEK_API_KEY',
	opencode: 'OPENCODE_API_KEY',
	kimchi: 'KIMCHI_API_KEY'
};

/**
 * Type kept for downstream consumers that only need the env-side shape.
 * Resolution now flows through `resolveProviderKeyWithTrace` in
 * `tier-router.ts`; this module only exposes helpers that back it.
 */
export interface ResolvedProviderKey {
	apiKey: string;
	source: 'user' | 'env';
	credentialEnabled: boolean | null;
}

export async function getAllUserCredentials(
	db: LibSQLDatabase<any>,
	env: Record<string, string | undefined>,
	userId: number,
	supportedProviderIds: ProviderId[]
): Promise<UserCredentialState[]> {
	const rows = await db
		.select()
		.from(userCredentials)
		.where(eq(userCredentials.userId, userId));

	const encryptionKey = getEncryptionKey(env);
	const results: UserCredentialState[] = [];
	const seen = new Set<ProviderId>();

	for (const row of rows) {
		if (!supportedProviderIds.includes(row.providerId as ProviderId)) continue;
		const masked = row.encryptedData ? maskKey(extractApiKey(row.encryptedData, encryptionKey) ?? '') : '';
		results.push({ ...row, source: 'db', apiKeyMasked: masked });
		seen.add(row.providerId as ProviderId);
	}

	const platformDefaults: Array<{ providerId: ProviderId; envKey: string }> = [
		{ providerId: 'groq' as ProviderId, envKey: 'GROQ_API_KEY' },
		{ providerId: 'deepseek' as ProviderId, envKey: 'DEEPSEEK_API_KEY' },
		{ providerId: 'opencode' as ProviderId, envKey: 'OPENCODE_API_KEY' },
		{ providerId: 'kimchi' as ProviderId, envKey: 'KIMCHI_API_KEY' }
	];
	for (const p of platformDefaults) {
		if (!supportedProviderIds.includes(p.providerId)) continue;
		if (seen.has(p.providerId)) continue;
		if (!env[p.envKey]) continue;
		results.push({
			id: `platform-${p.providerId}`,
			userId,
			providerId: p.providerId,
			credentialType: 'env',
			encryptedData: null,
			priority: 0,
			enabled: 1,
			createdAt: new Date(0).toISOString(),
			updatedAt: new Date(0).toISOString(),
			discoveredModels: null,
			discoveredAt: null,
			source: 'platform',
			apiKeyMasked: ''
		});
		seen.add(p.providerId);
	}

	return results;
}

function extractApiKey(encryptedData: string, encryptionKey: string): string | null {
	try {
		const decrypted = decryptText(encryptedData, encryptionKey);
		const parsed = JSON.parse(decrypted);
		if (typeof parsed.apiKey === 'string') return parsed.apiKey;
		return null;
	} catch {
		return null;
	}
}

export async function deleteUserCredential(
	db: LibSQLDatabase<any>,
	userId: number,
	providerId: ProviderId,
	audit?: CredentialAuditContext
): Promise<void> {
	const existing = await getUserCredential(db, {} as Record<string, string | undefined>, userId, providerId);
	await db
		.delete(userCredentials)
		.where(and(eq(userCredentials.userId, userId), eq(userCredentials.providerId, providerId)));
	if (audit && existing) {
		await writeAudit({
			schoolId: audit.schoolId,
			actorStaffId: audit.actorStaffId,
			action: 'delete',
			entityType: 'userCredential',
			entityId: existing.id,
			before: {
				userId,
				providerId,
				credentialType: existing.credentialType,
				enabled: existing.enabled === 1
			}
		});
	}
}

export async function updateUserCredentialEnabled(
	db: LibSQLDatabase<any>,
	userId: number,
	providerId: ProviderId,
	enabled: boolean,
	audit?: CredentialAuditContext
): Promise<void> {
	const existing = await getUserCredential(db, {} as Record<string, string | undefined>, userId, providerId);
	await db
		.update(userCredentials)
		.set({ enabled: enabled ? 1 : 0, updatedAt: new Date().toISOString() })
		.where(and(eq(userCredentials.userId, userId), eq(userCredentials.providerId, providerId)));
	if (audit && existing) {
		await writeAudit({
			schoolId: audit.schoolId,
			actorStaffId: audit.actorStaffId,
			action: enabled ? 'enable' : 'disable',
			entityType: 'userCredential',
			entityId: existing.id,
			before: { enabled: existing.enabled === 1 },
			after: { enabled }
		});
	}
}

export interface RotateCredentialInput {
	userId: number;
	providerId: ProviderId;
	newEncryptionKey: string;
}

/**
 * Re-encrypt a user's stored credential with a new encryption key.
 *
 * Reads the existing credential, decrypts the encrypted blob with the
 * currently configured key, re-encrypts it with `newEncryptionKey`, and
 * persists the updated blob. A round-trip check verifies the decrypted
 * plaintext matches the original before the update is committed.
 *
 * Throws when the credential does not exist, has no encrypted data, or
 * the re-encryption round-trip fails.
 */
export async function rotateCredential(
	db: LibSQLDatabase<any>,
	env: Record<string, string | undefined>,
	input: RotateCredentialInput,
	audit?: CredentialAuditContext
): Promise<UserCredential> {
	const existing = await getUserCredential(db, env, input.userId, input.providerId);
	if (!existing) {
		throw new Error(`No credential found for user ${input.userId} provider ${input.providerId}`);
	}
	if (!existing.encryptedData) {
		throw new Error(`Credential ${existing.id} has no encrypted data to rotate`);
	}

	const oldEncryptionKey = getEncryptionKey(env);
	const plaintext = decryptText(existing.encryptedData, oldEncryptionKey);
	const rotatedEncryptedData = encryptText(plaintext, input.newEncryptionKey);

	// Round-trip verification: ensure the new ciphertext decrypts back to the
	// exact plaintext before we overwrite the stored value.
	const roundTrip = decryptText(rotatedEncryptedData, input.newEncryptionKey);
	if (roundTrip !== plaintext) {
		throw new Error('Credential rotation round-trip verification failed');
	}

	const now = new Date().toISOString();
	const updated: UserCredential = {
		...existing,
		encryptedData: rotatedEncryptedData,
		updatedAt: now
	};

	await db
		.update(userCredentials)
		.set({ encryptedData: rotatedEncryptedData, updatedAt: now })
		.where(eq(userCredentials.id, existing.id));

	if (audit) {
		await writeAudit({
			schoolId: audit.schoolId,
			actorStaffId: audit.actorStaffId,
			action: 'update',
			entityType: 'userCredential',
			entityId: existing.id,
			before: { encryptedData: existing.encryptedData },
			after: { encryptedData: rotatedEncryptedData }
		});
	}

	return updated;
}

export interface RepairCorruptedCredentialInput {
	userId: number;
	providerId: ProviderId;
	fallbackEncryptionKey?: string;
}

/**
 * Attempt to recover a credential whose ciphertext cannot be decrypted with
 * the current key, then re-encrypt it with the current key.
 *
 * 1. Read the credential row.
 * 2. Try decrypting with the configured key.
 * 3. If that fails with a DecryptionError, try the optional fallback key or
 *    the well-known non-production fallback (`ENCRYPTION_KEY_FALLBACK`).
 * 4. If a plaintext is recovered, re-encrypt with the current key and update
 *    the row.
 * 5. Throw if the credential does not exist, has no encrypted data, or no
 *    key can decrypt it.
 */
export async function repairCorruptedCredential(
	db: LibSQLDatabase<any>,
	env: Record<string, string | undefined>,
	input: RepairCorruptedCredentialInput,
	audit?: CredentialAuditContext
): Promise<UserCredential> {
	const existing = await getUserCredential(db, env, input.userId, input.providerId);
	if (!existing) {
		throw new Error(`No credential found for user ${input.userId} provider ${input.providerId}`);
	}
	if (!existing.encryptedData) {
		throw new Error(`Credential ${existing.id} has no encrypted data to repair`);
	}

	const currentKey = getEncryptionKey(env);
	let plaintext: string | undefined;
	let usedFallback = false;

	try {
		plaintext = decryptText(existing.encryptedData, currentKey);
	} catch (err) {
		if (!(err instanceof DecryptionError)) throw err;
	}

	if (plaintext === undefined) {
		const fallbackKey = input.fallbackEncryptionKey ?? 'edapex-default-encryption-key-32ch';
		try {
			plaintext = decryptText(existing.encryptedData, fallbackKey);
			usedFallback = true;
		} catch (err) {
			if (err instanceof DecryptionError) {
				throw new Error(
					`Credential ${existing.id} could not be decrypted with current or fallback key`
				);
			}
			throw err;
		}
	}

	if (plaintext === undefined) {
		throw new Error(`Credential ${existing.id} could not be decrypted`);
	}

	const reEncrypted = encryptText(plaintext, currentKey);
	// Verify round-trip before writing.
	const roundTrip = decryptText(reEncrypted, currentKey);
	if (roundTrip !== plaintext) {
		throw new Error('Credential repair round-trip verification failed');
	}

	const now = new Date().toISOString();
	const updated: UserCredential = {
		...existing,
		encryptedData: reEncrypted,
		updatedAt: now
	};

	await db
		.update(userCredentials)
		.set({ encryptedData: reEncrypted, updatedAt: now })
		.where(eq(userCredentials.id, existing.id));

	if (audit) {
		await writeAudit({
			schoolId: audit.schoolId,
			actorStaffId: audit.actorStaffId,
			action: 'update',
			entityType: 'userCredential',
			entityId: existing.id,
			before: { encryptedData: existing.encryptedData, usedFallback },
			after: { encryptedData: reEncrypted }
		});
	}

	return updated;
}

export function resolveApiKeyForCredential(
	credential: UserCredential | null,
	env: Record<string, string | undefined>,
	providerId: ProviderId
): string | null {
	const encryptionKey = getEncryptionKey(env);
	if (credential?.credentialType === 'credential' && credential.encryptedData) {
		return extractApiKey(credential.encryptedData, encryptionKey);
	}
	if (credential?.credentialType === 'env') {
		const envKey = providerId === 'nvidia' ? 'NVIDIA_NIM_API_KEY' : `${providerId.toUpperCase()}_API_KEY`;
		return env[envKey] ?? null;
	}
	if (credential?.credentialType === 'custom' && credential.encryptedData) {
		return extractApiKey(credential.encryptedData, encryptionKey);
	}
	return null;
}


