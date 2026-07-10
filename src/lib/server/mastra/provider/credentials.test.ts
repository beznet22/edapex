import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';
import { createClient, type Client } from '@libsql/client';
import { eq } from 'drizzle-orm';
import { userCredentials, type UserCredential } from '$lib/server/mastra/storage/libsql/app-db.schema';
import {
	saveUserCredential,
	getUserCredential,
	getAllUserCredentials,
	deleteUserCredential,
	updateUserCredentialEnabled,
	rotateCredential,
	repairCorruptedCredential,
	resolveApiKeyForCredential,
	getCustomCredentialBaseUrl,
	decryptCustomProvider,
	type SaveUserCredentialInput,
	type CredentialAuditContext
} from './credentials';
import { encrypt as encryptText, decrypt as decryptText, getEncryptionKey } from './crypto';
import * as auditLog from '$lib/server/audit-log';
import type { ProviderId } from './types';

vi.mock('$lib/server/audit-log', () => ({
	log: vi.fn().mockResolvedValue(undefined)
}));

const CREATE_USER_CREDENTIALS_SQL = `
CREATE TABLE IF NOT EXISTS user_credentials (
	id TEXT PRIMARY KEY,
	user_id INTEGER NOT NULL,
	provider_id TEXT NOT NULL,
	credential_type TEXT NOT NULL,
	encrypted_data TEXT,
	priority INTEGER NOT NULL DEFAULT 1,
	enabled INTEGER NOT NULL DEFAULT 1,
	created_at TEXT NOT NULL DEFAULT (datetime('now')),
	updated_at TEXT NOT NULL DEFAULT (datetime('now')),
	discovered_models TEXT,
	discovered_at TEXT,
	UNIQUE(user_id, provider_id)
);
`;

const envKey = getEncryptionKey({ TOKEN_ENCRYPTION_KEY: 'test-encryption-key-32bytes!' });
const env = { TOKEN_ENCRYPTION_KEY: envKey };

function createInMemoryDb(): { db: LibSQLDatabase<any>; client: Client } {
	const client = createClient({ url: ':memory:' });
	client.execute(CREATE_USER_CREDENTIALS_SQL);
	const db = drizzle(client);
	return { db, client };
}

function buildCredentialInput(overrides: Partial<SaveUserCredentialInput> = {}): SaveUserCredentialInput {
	return {
		userId: 1,
		providerId: 'groq' as ProviderId,
		credentialType: 'credential',
		apiKey: 'sk-test-1234567890',
		...overrides
	};
}

const audit: CredentialAuditContext = { actorStaffId: 99, schoolId: 5 };

describe('saveUserCredential', () => {
	let db: LibSQLDatabase<any>;
	let client: Client;

	beforeEach(() => {
		const pair = createInMemoryDb();
		db = pair.db;
		client = pair.client;
	});

	afterEach(async () => {
		vi.restoreAllMocks();
		await client.close();
	});

	it('creates a credential-type credential and writes an audit log', async () => {
		const written = await saveUserCredential(db, env, buildCredentialInput(), audit);
		expect(written.userId).toBe(1);
		expect(written.providerId).toBe('groq');
		expect(written.credentialType).toBe('credential');
		expect(written.encryptedData).toBeTruthy();
		expect(written.enabled).toBe(1);

		const decrypted = JSON.parse(decryptText(written.encryptedData!, envKey));
		expect(decrypted.apiKey).toBe('sk-test-1234567890');

		expect(auditLog.log).toHaveBeenCalledWith(
			expect.objectContaining({
				action: 'create',
				entityType: 'userCredential',
				schoolId: 5,
				actorStaffId: 99
			})
		);
	});

	it('updates an existing credential preserving prior encrypted data when no apiKey is supplied', async () => {
		const first = await saveUserCredential(db, env, buildCredentialInput());
		const second = await saveUserCredential(
			db,
			env,
			buildCredentialInput({ apiKey: undefined, priority: 7, enabled: false }),
			audit
		);

		expect(second.id).toBe(first.id);
		expect(second.priority).toBe(7);
		expect(second.enabled).toBe(0);
		expect(second.encryptedData).toBe(first.encryptedData);

		expect(auditLog.log).toHaveBeenCalledWith(
			expect.objectContaining({
				action: 'update',
				before: expect.objectContaining({ credentialType: 'credential', priority: 1, enabled: 1 }),
				after: expect.objectContaining({ credentialType: 'credential', priority: 7, enabled: false })
			})
		);
	});

	it('throws when creating a credential-type credential without an apiKey or existing data', async () => {
		await expect(
			saveUserCredential(db, env, buildCredentialInput({ apiKey: undefined }))
		).rejects.toThrow('apiKey is required to create a credential-type credential');
	});

	it('creates an env-type credential without encrypted data', async () => {
		const written = await saveUserCredential(
			db,
			env,
			buildCredentialInput({ credentialType: 'env', apiKey: undefined })
		);
		expect(written.credentialType).toBe('env');
		expect(written.encryptedData).toBeNull();
	});

	it('creates a custom-type credential with encrypted payload', async () => {
		const written = await saveUserCredential(
			db,
			env,
			buildCredentialInput({
				credentialType: 'custom',
				apiKey: undefined,
				baseUrl: 'https://custom.example.com/v1',
				displayName: 'My Custom',
				models: [{ id: 'm1', displayName: 'Model One' }],
				headers: [{ name: 'X-Custom', value: 'value' }]
			})
		);
		expect(written.credentialType).toBe('custom');
		const decrypted = JSON.parse(decryptText(written.encryptedData!, envKey));
		expect(decrypted).toMatchObject({
			displayName: 'My Custom',
			baseUrl: 'https://custom.example.com/v1',
			models: [{ id: 'm1', displayName: 'Model One' }],
			headers: [{ name: 'X-Custom', value: 'value' }]
		});
	});

	it('merges partial updates into existing custom credential data', async () => {
		const first = await saveUserCredential(
			db,
			env,
			buildCredentialInput({
				credentialType: 'custom',
				apiKey: undefined,
				baseUrl: 'https://custom.example.com/v1',
				displayName: 'Original',
				models: [{ id: 'm1', displayName: 'Model One' }]
			})
		);

		const second = await saveUserCredential(
			db,
			env,
			buildCredentialInput({
				credentialType: 'custom',
				apiKey: undefined,
				displayName: 'Updated'
			})
		);

		expect(second.id).toBe(first.id);
		const decrypted = JSON.parse(decryptText(second.encryptedData!, envKey));
		expect(decrypted.displayName).toBe('Updated');
		expect(decrypted.baseUrl).toBe('https://custom.example.com/v1');
		expect(decrypted.models).toEqual([{ id: 'm1', displayName: 'Model One' }]);
	});
});

describe('getUserCredential', () => {
	let db: LibSQLDatabase<any>;
	let client: Client;

	beforeEach(() => {
		const pair = createInMemoryDb();
		db = pair.db;
		client = pair.client;
	});

	afterEach(async () => {
		await client.close();
	});

	it('returns null when no credential exists', async () => {
		const result = await getUserCredential(db, env, 42, 'groq' as ProviderId);
		expect(result).toBeNull();
	});

	it('returns the matching credential row', async () => {
		await saveUserCredential(db, env, buildCredentialInput({ userId: 42, providerId: 'groq' as ProviderId }));
		const result = await getUserCredential(db, env, 42, 'groq' as ProviderId);
		expect(result).not.toBeNull();
		expect(result?.userId).toBe(42);
		expect(result?.providerId).toBe('groq');
	});
});

describe('getAllUserCredentials', () => {
	let db: LibSQLDatabase<any>;
	let client: Client;

	beforeEach(() => {
		const pair = createInMemoryDb();
		db = pair.db;
		client = pair.client;
	});

	afterEach(async () => {
		await client.close();
	});

	it('returns db credentials with masked api keys and platform defaults for supported providers', async () => {
		await saveUserCredential(db, env, buildCredentialInput({ userId: 7, providerId: 'groq' as ProviderId }));
		const envWithKeys = { ...env, GROQ_API_KEY: 'platform-groq-key', DEEPSEEK_API_KEY: 'platform-deepseek-key' };
		const results = await getAllUserCredentials(db, envWithKeys, 7, ['groq', 'deepseek'] as ProviderId[]);

		expect(results).toHaveLength(2);
		const dbCred = results.find((r) => r.source === 'db');
		const platformCreds = results.filter((r) => r.source === 'platform');

		expect(dbCred).toBeDefined();
		expect(dbCred?.apiKeyMasked).toContain('...');
		expect(platformCreds).toHaveLength(1);
		expect(platformCreds[0]?.providerId).toBe('deepseek');
	});

	it('ignores unsupported providers', async () => {
		await saveUserCredential(db, env, buildCredentialInput({ userId: 7, providerId: 'groq' as ProviderId }));
		const results = await getAllUserCredentials(db, env, 7, ['deepseek'] as ProviderId[]);
		expect(results).toHaveLength(0);
	});

	it('returns empty array when no credentials or env keys exist', async () => {
		const results = await getAllUserCredentials(db, env, 7, ['groq'] as ProviderId[]);
		expect(results).toEqual([]);
	});
});

describe('deleteUserCredential', () => {
	let db: LibSQLDatabase<any>;
	let client: Client;

	beforeEach(() => {
		const pair = createInMemoryDb();
		db = pair.db;
		client = pair.client;
		vi.mocked(auditLog.log).mockClear();
	});

	afterEach(async () => {
		vi.restoreAllMocks();
		await client.close();
	});

	it('deletes the credential and writes an audit log', async () => {
		const written = await saveUserCredential(db, env, buildCredentialInput({ userId: 3, providerId: 'groq' as ProviderId }));
		await deleteUserCredential(db, 3, 'groq' as ProviderId, audit);
		const result = await getUserCredential(db, env, 3, 'groq' as ProviderId);
		expect(result).toBeNull();

		expect(auditLog.log).toHaveBeenCalledWith(
			expect.objectContaining({
				action: 'delete',
				entityType: 'userCredential',
				entityId: written.id
			})
		);
	});

	it('does not write audit log when credential is missing', async () => {
		await deleteUserCredential(db, 3, 'groq' as ProviderId, audit);
		expect(auditLog.log).not.toHaveBeenCalled();
	});
});

describe('updateUserCredentialEnabled', () => {
	let db: LibSQLDatabase<any>;
	let client: Client;

	beforeEach(() => {
		const pair = createInMemoryDb();
		db = pair.db;
		client = pair.client;
	});

	afterEach(async () => {
		vi.restoreAllMocks();
		await client.close();
	});

	it('toggles enabled and writes enable/disable audit entries', async () => {
		await saveUserCredential(db, env, buildCredentialInput({ userId: 4, providerId: 'groq' as ProviderId }));
		await updateUserCredentialEnabled(db, 4, 'groq' as ProviderId, false, audit);
		let row = await getUserCredential(db, env, 4, 'groq' as ProviderId);
		expect(row?.enabled).toBe(0);
		expect(auditLog.log).toHaveBeenCalledWith(
			expect.objectContaining({ action: 'disable', entityType: 'userCredential' })
		);

		vi.mocked(auditLog.log).mockClear();
		await updateUserCredentialEnabled(db, 4, 'groq' as ProviderId, true, audit);
		row = await getUserCredential(db, env, 4, 'groq' as ProviderId);
		expect(row?.enabled).toBe(1);
		expect(auditLog.log).toHaveBeenCalledWith(
			expect.objectContaining({ action: 'enable', entityType: 'userCredential' })
		);
	});
});

describe('rotateCredential', () => {
	let db: LibSQLDatabase<any>;
	let client: Client;

	beforeEach(() => {
		const pair = createInMemoryDb();
		db = pair.db;
		client = pair.client;
	});

	afterEach(async () => {
		vi.restoreAllMocks();
		await client.close();
	});

	it('re-encrypts a credential with a new key and writes an audit log', async () => {
		await saveUserCredential(db, env, buildCredentialInput({ userId: 5, providerId: 'groq' as ProviderId }));
		const rotated = await rotateCredential(
			db,
			env,
			{ userId: 5, providerId: 'groq' as ProviderId, newEncryptionKey: 'new-encryption-key-32bytes!' },
			audit
		);

		expect(rotated.encryptedData).toBeTruthy();
		const decrypted = JSON.parse(decryptText(rotated.encryptedData!, 'new-encryption-key-32bytes!'));
		expect(decrypted.apiKey).toBe('sk-test-1234567890');

		expect(auditLog.log).toHaveBeenCalledWith(
			expect.objectContaining({
				action: 'update',
				entityType: 'userCredential',
				after: expect.objectContaining({ encryptedData: rotated.encryptedData })
			})
		);
	});

	it('throws when the credential row is missing', async () => {
		await expect(
			rotateCredential(db, env, {
				userId: 999,
				providerId: 'groq' as ProviderId,
				newEncryptionKey: 'new-encryption-key-32bytes!'
			})
		).rejects.toThrow(/No credential found/);
	});

	it('throws when the credential has no encrypted data', async () => {
		await saveUserCredential(
			db,
			env,
			buildCredentialInput({ userId: 6, providerId: 'groq' as ProviderId, credentialType: 'env', apiKey: undefined })
		);
		await expect(
			rotateCredential(db, env, {
				userId: 6,
				providerId: 'groq' as ProviderId,
				newEncryptionKey: 'new-encryption-key-32bytes!'
			})
		).rejects.toThrow(/has no encrypted data to rotate/);
	});
});

describe('repairCorruptedCredential', () => {
	let db: LibSQLDatabase<any>;
	let client: Client;

	beforeEach(() => {
		const pair = createInMemoryDb();
		db = pair.db;
		client = pair.client;
	});

	afterEach(async () => {
		vi.restoreAllMocks();
		await client.close();
	});

	it('repairs a credential using the default fallback key', async () => {
		const defaultKey = 'edapex-default-encryption-key-32ch';
		const plaintext = JSON.stringify({ apiKey: 'fallback-secret' });
		const oldBlob = encryptText(plaintext, defaultKey);
		await db.insert(userCredentials).values({
			id: 'cred-repair-1',
			userId: 8,
			providerId: 'groq',
			credentialType: 'credential',
			encryptedData: oldBlob,
			enabled: 1
		});

		const repaired = await repairCorruptedCredential(db, env, {
			userId: 8,
			providerId: 'groq' as ProviderId
		});

		const decrypted = JSON.parse(decryptText(repaired.encryptedData!, envKey));
		expect(decrypted.apiKey).toBe('fallback-secret');
	});
});

describe('resolveApiKeyForCredential', () => {
	it('extracts api key from credential-type encrypted data', () => {
		const encrypted = encryptText(JSON.stringify({ apiKey: 'cred-key' }), envKey);
		const credential: UserCredential = {
			id: '1',
			userId: 1,
			providerId: 'groq',
			credentialType: 'credential',
			encryptedData: encrypted,
			priority: 1,
			enabled: 1,
			createdAt: '',
			updatedAt: '',
			discoveredModels: null,
			discoveredAt: null
		};
		expect(resolveApiKeyForCredential(credential, env, 'groq' as ProviderId)).toBe('cred-key');
	});

	it('resolves env-type credential from provider env key', () => {
		const credential: UserCredential = {
			id: '1',
			userId: 1,
			providerId: 'groq',
			credentialType: 'env',
			encryptedData: null,
			priority: 1,
			enabled: 1,
			createdAt: '',
			updatedAt: '',
			discoveredModels: null,
			discoveredAt: null
		};
		expect(resolveApiKeyForCredential(credential, { GROQ_API_KEY: 'env-key' }, 'groq' as ProviderId)).toBe('env-key');
	});

	it('uses NVIDIA_NIM_API_KEY for nvidia provider env credential', () => {
		const credential: UserCredential = {
			id: '1',
			userId: 1,
			providerId: 'nvidia',
			credentialType: 'env',
			encryptedData: null,
			priority: 1,
			enabled: 1,
			createdAt: '',
			updatedAt: '',
			discoveredModels: null,
			discoveredAt: null
		};
		expect(resolveApiKeyForCredential(credential, { NVIDIA_NIM_API_KEY: 'nvidia-key' }, 'nvidia' as ProviderId)).toBe('nvidia-key');
	});

	it('returns null for missing or unsupported credential types', () => {
		const credential: UserCredential = {
			id: '1',
			userId: 1,
			providerId: 'groq',
			credentialType: 'env',
			encryptedData: null,
			priority: 1,
			enabled: 1,
			createdAt: '',
			updatedAt: '',
			discoveredModels: null,
			discoveredAt: null
		};
		expect(resolveApiKeyForCredential(credential, env, 'groq' as ProviderId)).toBeNull();
		expect(resolveApiKeyForCredential(null, env, 'groq' as ProviderId)).toBeNull();
	});
});

describe('getCustomCredentialBaseUrl', () => {
	it('returns the baseUrl from a custom credential', () => {
		const encrypted = encryptText(
			JSON.stringify({ displayName: 'x', baseUrl: 'https://custom.example.com' }),
			envKey
		);
		const credential: UserCredential = {
			id: '1',
			userId: 1,
			providerId: 'custom-provider',
			credentialType: 'custom',
			encryptedData: encrypted,
			priority: 1,
			enabled: 1,
			createdAt: '',
			updatedAt: '',
			discoveredModels: null,
			discoveredAt: null
		};
		expect(getCustomCredentialBaseUrl(credential, env)).toBe('https://custom.example.com');
	});

	it('returns empty string for non-custom or missing encrypted data', () => {
		const credential: UserCredential = {
			id: '1',
			userId: 1,
			providerId: 'groq',
			credentialType: 'credential',
			encryptedData: null,
			priority: 1,
			enabled: 1,
			createdAt: '',
			updatedAt: '',
			discoveredModels: null,
			discoveredAt: null
		};
		expect(getCustomCredentialBaseUrl(credential, env)).toBe('');
	});
});

describe('decryptCustomProvider', () => {
	it('returns null for invalid encrypted data', () => {
		expect(decryptCustomProvider('not-valid', env)).toBeNull();
	});

	it('returns parsed data for valid encrypted custom payload', () => {
		const payload = { displayName: 'x', baseUrl: 'https://custom.example.com', apiKey: 'secret', models: [], headers: [] };
		const encrypted = encryptText(JSON.stringify(payload), envKey);
		expect(decryptCustomProvider(encrypted, env)).toMatchObject(payload);
	});
});
