/**
 * User credential CRUD over the unified `encrypted_credentials` table.
 *
 * Scope = 'user' for personal/custom credentials and donations made by a
 * staff member. Platform (env-backed) providers are not stored here — they
 * are resolved at request time from `PLATFORM_ENV_KEYS`.
 *
 * The discriminated `credential_kind` column ('personal' | 'donation' |
 * 'custom') replaces the legacy `credential_type` ('env' | 'credential' |
 * 'custom'). 'env' is gone because env-backed credentials live in process
 * env, never in the database.
 */
import { eq, and } from 'drizzle-orm';
import type { LibSQLDatabase } from 'drizzle-orm/libsql';
import { z } from 'zod';
import {
	encryptedCredentials,
	type EncryptedCredential
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

export type UserCredentialKind = 'personal' | 'donation' | 'custom';

export interface UserCredentialState extends EncryptedCredential {
	source: 'db' | 'platform';
	apiKeyMasked: string;
}

export interface SaveUserCredentialInput {
	userId: number;
	providerId: ProviderId;
	credentialType: 'credential' | 'custom';
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
	credentialType: z.enum(['credential', 'custom']),
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

function credentialKindFromType(type: 'credential' | 'custom'): UserCredentialKind {
	return type === 'custom' ? 'custom' : 'personal';
}

export async function saveUserCredential(
	db: LibSQLDatabase<any>,
	env: Record<string, string | undefined>,
	input: SaveUserCredentialInput,
	audit?: CredentialAuditContext
): Promise<EncryptedCredential> {
	const validated = SaveUserCredentialInputSchema.parse(input);
	const encryptionKey = getEncryptionKey(env);
	const existing = await getUserCredential(db, env, validated.userId, validated.providerId);

	const credentialKind = credentialKindFromType(validated.credentialType);
	let encryptedData: string;

	if (validated.credentialType === 'credential') {
		if (validated.apiKey) {
			encryptedData = encryptText(
				JSON.stringify({ apiKey: validated.apiKey }),
				encryptionKey
			);
		} else if (existing?.encryptedData) {
			encryptedData = existing.encryptedData;
		} else {
			throw new Error('apiKey is required to create a credential-type credential');
		}
	} else {
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
	const enabled =
		validated.enabled !== undefined ? (validated.enabled ? 1 : 0) : (existing?.enabled ?? 1);

	const written: EncryptedCredential = {
		id: existing?.id ?? crypto.randomUUID(),
		scope: 'user',
		credentialKind,
		userId: validated.userId,
		schoolId: null,
		providerId: validated.providerId,
		encryptedData,
		priority,
		enabled,
		discoveredModels: existing?.discoveredModels ?? null,
		discoveredAt: existing?.discoveredAt ?? null,
		createdAt: existing?.createdAt ?? now,
		updatedAt: now
	};

	await db
		.insert(encryptedCredentials)
		.values(written)
		.onConflictDoUpdate({
			target: [
				encryptedCredentials.scope,
				encryptedCredentials.credentialKind,
				encryptedCredentials.userId,
				encryptedCredentials.providerId
			],
			set: {
				credentialKind,
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
						credentialKind: existing.credentialKind,
						priority: existing.priority,
						enabled: existing.enabled
				  }
				: undefined,
			after: {
				userId: validated.userId,
				providerId: validated.providerId,
				credentialKind,
				priority,
				enabled: enabled === 1
			}
		});
	}

	// Pass the just-written row directly so discovery doesn't race the
	// INSERT/UPDATE returning.
	void discoverAndPersistInBackground(db, env, written).catch((err: unknown) => {
		console.error(`[credentials] model discovery failed for ${validated.providerId}:`, err);
	});

	return written;
}

async function discoverAndPersistInBackground(
	db: LibSQLDatabase<any>,
	env: Record<string, string | undefined>,
	credential: EncryptedCredential
): Promise<void> {
	const { discoverProviderModels, persistDiscoveredModels } = await import('./discovery');
	const synthetic: UserCredentialAdapter = {
		userId: credential.userId ?? 0,
		providerId: credential.providerId,
		credentialKind: credential.credentialKind,
		encryptedData: credential.encryptedData
	};
	const models = await discoverProviderModels(synthetic, env);
	if (models.length === 0) return;
	await persistDiscoveredModels(
		db,
		env,
		credential.userId ?? 0,
		credential.providerId,
		models
	);
}

interface UserCredentialAdapter {
	userId: number;
	providerId: string;
	credentialKind: UserCredentialKind;
	encryptedData: string;
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

export function decryptCustomProvider(
	encryptedData: string,
	env: Record<string, string | undefined>
):
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

export function getCustomCredentialBaseUrl(
	credential: EncryptedCredential,
	env: Record<string, string | undefined>
): string {
	if (credential.credentialKind !== 'custom' || !credential.encryptedData) {
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
): Promise<EncryptedCredential | null> {
	const rows = await db
		.select()
		.from(encryptedCredentials)
		.where(
			and(
				eq(encryptedCredentials.scope, 'user'),
				eq(encryptedCredentials.userId, userId),
				eq(encryptedCredentials.providerId, providerId)
			)
		)
		.limit(1);
	return rows[0] ?? null;
}

export const PLATFORM_ENV_KEYS: Partial<Record<ProviderId, string>> = {
	groq: 'GROQ_API_KEY',
	deepseek: 'DEEPSEEK_API_KEY',
	opencode: 'OPENCODE_API_KEY',
	kimchi: 'KIMCHI_API_KEY'
};

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
		.from(encryptedCredentials)
		.where(
			and(
				eq(encryptedCredentials.scope, 'user'),
				eq(encryptedCredentials.userId, userId)
			)
		);

	const encryptionKey = getEncryptionKey(env);
	const results: UserCredentialState[] = [];
	const seen = new Set<ProviderId>();

	for (const row of rows) {
		const providerId = row.providerId as ProviderId;
		if (!supportedProviderIds.includes(providerId)) continue;
		const masked = maskKey(extractApiKey(row.encryptedData, encryptionKey) ?? '');
		results.push({ ...row, source: 'db', apiKeyMasked: masked });
		seen.add(providerId);
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
			scope: 'user',
			credentialKind: 'personal',
			userId,
			schoolId: null,
			providerId: p.providerId,
			encryptedData: '',
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
	if (!encryptedData) return null;
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
		.delete(encryptedCredentials)
		.where(
			and(
				eq(encryptedCredentials.scope, 'user'),
				eq(encryptedCredentials.userId, userId),
				eq(encryptedCredentials.providerId, providerId)
			)
		);
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
				credentialKind: existing.credentialKind,
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
		.update(encryptedCredentials)
		.set({ enabled: enabled ? 1 : 0, updatedAt: new Date().toISOString() })
		.where(
			and(
				eq(encryptedCredentials.scope, 'user'),
				eq(encryptedCredentials.userId, userId),
				eq(encryptedCredentials.providerId, providerId)
			)
		);
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

export async function rotateCredential(
	db: LibSQLDatabase<any>,
	env: Record<string, string | undefined>,
	input: RotateCredentialInput,
	audit?: CredentialAuditContext
): Promise<EncryptedCredential> {
	const existing = await getUserCredential(db, env, input.userId, input.providerId);
	if (!existing) {
		throw new Error(`No credential found for user ${input.userId} provider ${input.providerId}`);
	}
	if (!existing.encryptedData) {
		throw new Error(`Credential ${existing.id} has no encrypted data to rotate`);
	}

	const oldEncryptionKey = getEncryptionKey(env);
	const plaintext = decryptText(existing.encryptedData, oldEncryptionKey);
	try {
		JSON.parse(plaintext);
	} catch {
		throw new DecryptionError('Decrypted plaintext is not valid JSON (wrong key or tampered ciphertext)');
	}
	const rotatedEncryptedData = encryptText(plaintext, input.newEncryptionKey);

	const roundTrip = decryptText(rotatedEncryptedData, input.newEncryptionKey);
	if (roundTrip !== plaintext) {
		throw new Error('Credential rotation round-trip verification failed');
	}

	const now = new Date().toISOString();
	const updated: EncryptedCredential = {
		...existing,
		encryptedData: rotatedEncryptedData,
		updatedAt: now
	};

	await db
		.update(encryptedCredentials)
		.set({ encryptedData: rotatedEncryptedData, updatedAt: now })
		.where(eq(encryptedCredentials.id, existing.id));

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

export async function repairCorruptedCredential(
	db: LibSQLDatabase<any>,
	env: Record<string, string | undefined>,
	input: RepairCorruptedCredentialInput,
	audit?: CredentialAuditContext
): Promise<EncryptedCredential> {
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
		const decrypted = decryptText(existing.encryptedData, currentKey);
		JSON.parse(decrypted);
		plaintext = decrypted;
	} catch (err) {
		if (err instanceof SyntaxError) {
			// Decrypted successfully but was garbage
		} else if (!(err instanceof DecryptionError)) {
			throw err;
		}
	}

	if (plaintext === undefined) {
		const fallbackKey = input.fallbackEncryptionKey ?? 'edapex-default-encryption-key-32ch';
		try {
			const decrypted = decryptText(existing.encryptedData, fallbackKey);
			JSON.parse(decrypted);
			plaintext = decrypted;
			usedFallback = true;
		} catch (err) {
			if (err instanceof DecryptionError || err instanceof SyntaxError) {
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
	const roundTrip = decryptText(reEncrypted, currentKey);
	if (roundTrip !== plaintext) {
		throw new Error('Credential repair round-trip verification failed');
	}

	const now = new Date().toISOString();
	const updated: EncryptedCredential = {
		...existing,
		encryptedData: reEncrypted,
		updatedAt: now
	};

	await db
		.update(encryptedCredentials)
		.set({ encryptedData: reEncrypted, updatedAt: now })
		.where(eq(encryptedCredentials.id, existing.id));

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
	credential: EncryptedCredential | null,
	env: Record<string, string | undefined>,
	providerId: ProviderId
): string | null {
	const encryptionKey = getEncryptionKey(env);
	if (credential?.credentialKind === 'personal' && credential.encryptedData) {
		return extractApiKey(credential.encryptedData, encryptionKey);
	}
	if (credential?.credentialKind === 'custom' && credential.encryptedData) {
		return extractApiKey(credential.encryptedData, encryptionKey);
	}
	return null;
}
