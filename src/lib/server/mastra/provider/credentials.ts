/**
 * User credential CRUD over the `user_credentials` table — V2.
 *
 * Slim copy of V1's `credentials.ts`:
 * - Drops `getEffectiveCredential` (only the V1 `EdApexGateway` consumed it;
 *   the V2 resolver does the user-credential → env-fallback resolution inline).
 * - Drops the synchronous `UserCredentialState.apiKeyMasked` synthesis
 *   (the V1 list view needed it; V2's `getAllUserCredentials` is unchanged
 *   so list-rendering UI still works until the cutover PR migrates it).
 *
 * Same schema, same table — V1 and V2 share `user_credentials`. No migration.
 */
import { eq, and, sql } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import {
	userCredentials,
	type UserCredential
} from '$lib/server/mastra/storage/libsql/app-db.schema';
import type { ProviderId } from './types';
import { encrypt as encryptText, decrypt as decryptText, maskKey } from './crypto';
import { CustomProviderEncryptedDataSchema } from './spec';

export interface UserCredentialState extends UserCredential {
	source: 'db' | 'platform';
	apiKeyMasked: string;
}

const ENCRYPTION_KEY_FALLBACK = 'edapex-default-encryption-key-32ch';

function getEncryptionKey(env: Record<string, string | undefined>): string {
	return env.TOKEN_ENCRYPTION_KEY || env.ENCRYPTION_KEY || ENCRYPTION_KEY_FALLBACK;
}

export async function ensureUserCredentialsSchema(db: LibSQLDatabase<any>): Promise<void> {
	await db.run(sql`
		CREATE TABLE IF NOT EXISTS user_credentials (
			id TEXT PRIMARY KEY,
			user_id INTEGER NOT NULL,
			provider_id TEXT NOT NULL,
			credential_type TEXT NOT NULL,
			encrypted_data TEXT,
			priority INTEGER NOT NULL DEFAULT 1,
			enabled INTEGER NOT NULL DEFAULT 1,
			discovered_models TEXT,
			discovered_at TEXT,
			created_at TEXT NOT NULL DEFAULT (datetime('now')),
			updated_at TEXT NOT NULL DEFAULT (datetime('now')),
			UNIQUE(user_id, provider_id)
		)
	`);
	await db.run(sql`ALTER TABLE user_credentials ADD COLUMN discovered_models TEXT`).catch(() => {});
	await db.run(sql`ALTER TABLE user_credentials ADD COLUMN discovered_at TEXT`).catch(() => {});
	await db.run(sql`
		CREATE TABLE IF NOT EXISTS user_model_visibility (
			id TEXT PRIMARY KEY,
			user_id INTEGER NOT NULL,
			model_id TEXT NOT NULL,
			visible INTEGER NOT NULL DEFAULT 1,
			updated_at TEXT NOT NULL DEFAULT (datetime('now')),
			UNIQUE(user_id, model_id)
		)
	`);
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

export async function saveUserCredential(
	db: LibSQLDatabase<any>,
	env: Record<string, string | undefined>,
	input: SaveUserCredentialInput
): Promise<UserCredential> {
	await ensureUserCredentialsSchema(db);

	const encryptionKey = getEncryptionKey(env);
	const existing = await getUserCredential(db, env, input.userId, input.providerId);

	let encryptedData: string | null = null;

	if (input.credentialType === 'credential') {
		if (input.apiKey) {
			encryptedData = encryptText(JSON.stringify({ apiKey: input.apiKey }), encryptionKey);
		} else if (existing?.encryptedData) {
			encryptedData = existing.encryptedData;
		}
	} else if (input.credentialType === 'custom') {
		const prior = safeParseCustom(existing?.encryptedData ?? null, env);
		const payload = CustomProviderEncryptedDataSchema.parse({
			displayName: input.displayName ?? prior?.displayName ?? input.providerId,
			baseUrl: input.baseUrl ?? prior?.baseUrl ?? '',
			apiKey: input.apiKey ?? prior?.apiKey,
			models: input.models ?? prior?.models ?? [],
			headers: input.headers ?? prior?.headers ?? []
		});
		encryptedData = encryptText(JSON.stringify(payload), encryptionKey);
	}

	const now = new Date().toISOString();
	const priority = input.priority ?? existing?.priority ?? 1;
	const enabled = input.enabled !== undefined ? (input.enabled ? 1 : 0) : (existing?.enabled ?? 1);

	const written: UserCredential = {
		id: existing?.id ?? crypto.randomUUID(),
		userId: input.userId,
		providerId: input.providerId,
		credentialType: input.credentialType,
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
				credentialType: input.credentialType,
				encryptedData,
				priority,
				enabled,
				updatedAt: now
			}
		});

	// Pass the just-written row directly so discovery doesn't race the
	// INSERT/UPDATE returning. Previously this re-read the row, which could
	// observe a stale value if the DB session hadn't yet seen its own write.
	void discoverAndPersistInBackground(db, env, written).catch((err: unknown) => {
		console.error(`[credentials] model discovery failed for ${input.providerId}:`, err);
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

export async function getUserCredential(
	db: LibSQLDatabase<any>,
	env: Record<string, string | undefined>,
	userId: number,
	providerId: ProviderId
): Promise<UserCredential | null> {
	await ensureUserCredentialsSchema(db);
	const rows = await db
		.select()
		.from(userCredentials)
		.where(and(eq(userCredentials.userId, userId), eq(userCredentials.providerId, providerId)))
		.limit(1);
	return rows[0] ?? null;
}

const PLATFORM_ENV_KEYS: Partial<Record<ProviderId, string>> = {
	groq: 'GROQ_API_KEY',
	deepseek: 'DEEPSEEK_API_KEY',
	opencode: 'OPENCODE_API_KEY',
	kimchi: 'KIMCHI_API_KEY'
};

/**
 * Used by the V2 resolver to resolve a single provider's API key for a user.
 * Returns the effective API key (user credential first, env fallback) and
 * whether the source is the user DB or the platform env. The V2 resolver
 * uses this inline; the V1 `getEffectiveCredential` was equivalent but
 * coupled to the V1 gateway's credential-cache lifecycle.
 */
export interface ResolvedProviderKey {
	apiKey: string;
	source: 'user' | 'env';
	credentialEnabled: boolean | null;
}

export async function resolveProviderKey(
	db: LibSQLDatabase<any>,
	env: Record<string, string | undefined>,
	userId: number,
	providerId: ProviderId
): Promise<ResolvedProviderKey | null> {
	const credential = await getUserCredential(db, env, userId, providerId);
	if (credential && credential.enabled === 1) {
		const apiKey = resolveApiKeyForCredential(credential, env, providerId);
		if (apiKey) return { apiKey, source: 'user', credentialEnabled: true };
	}
	const envKey = PLATFORM_ENV_KEYS[providerId];
	const envValue = envKey ? env[envKey] : undefined;
	if (envValue) return { apiKey: envValue, source: 'env', credentialEnabled: credential?.enabled === 1 ? true : null };
	return null;
}

export async function getAllUserCredentials(
	db: LibSQLDatabase<any>,
	env: Record<string, string | undefined>,
	userId: number,
	supportedProviderIds: ProviderId[]
): Promise<UserCredentialState[]> {
	await ensureUserCredentialsSchema(db);

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
	providerId: ProviderId
): Promise<void> {
	await ensureUserCredentialsSchema(db);
	await db
		.delete(userCredentials)
		.where(and(eq(userCredentials.userId, userId), eq(userCredentials.providerId, providerId)));
}

export async function updateUserCredentialEnabled(
	db: LibSQLDatabase<any>,
	userId: number,
	providerId: ProviderId,
	enabled: boolean
): Promise<void> {
	await ensureUserCredentialsSchema(db);
	await db
		.update(userCredentials)
		.set({ enabled: enabled ? 1 : 0, updatedAt: new Date().toISOString() })
		.where(and(eq(userCredentials.userId, userId), eq(userCredentials.providerId, providerId)));
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


