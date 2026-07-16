import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { getAppDb } from '$lib/server/mastra/storage/libsql/app-db';
import { encryptedCredentials, type EncryptedCredential } from '$lib/server/mastra/storage/libsql/app-db.schema';
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

const envKey = getEncryptionKey({ TOKEN_ENCRYPTION_KEY: 'test-encryption-key-32bytes!' });
const env = { TOKEN_ENCRYPTION_KEY: envKey };

async function cleanupUser(userId: number): Promise<void> {
	const db = getAppDb();
	await db
		.delete(encryptedCredentials)
		.where(and(eq(encryptedCredentials.scope, 'user'), eq(encryptedCredentials.userId, userId)));
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
	beforeEach(async () => {
		await cleanupUser(1);
		await cleanupUser(3);
		await cleanupUser(4);
		await cleanupUser(5);
		await cleanupUser(6);
	});

	afterEach(async () => {
		await cleanupUser(1);
		await cleanupUser(3);
		await cleanupUser(4);
		await cleanupUser(5);
		await cleanupUser(6);
		vi.restoreAllMocks();
	});

	it('creates a credential-type credential and writes an audit log', async () => {
		const written = await saveUserCredential(getAppDb(), env, buildCredentialInput(), audit);
		expect(written.userId).toBe(1);
		expect(written.providerId).toBe('groq');
		expect(written.credentialKind).toBe('personal');
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
		const first = await saveUserCredential(getAppDb(), env, buildCredentialInput());
		const second = await saveUserCredential(
			getAppDb(),
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
				before: expect.objectContaining({ credentialKind: 'personal', priority: 1, enabled: 1 }),
				after: expect.objectContaining({ credentialKind: 'personal', priority: 7, enabled: false })
			})
		);
	});

	it('throws when creating a credential-type credential without an apiKey or existing data', async () => {
		await expect(
			saveUserCredential(getAppDb(), env, buildCredentialInput({ apiKey: undefined }))
		).rejects.toThrow('apiKey is required to create a credential-type credential');
	});

	it('creates a custom-type credential with encrypted payload', async () => {
		const written = await saveUserCredential(
			getAppDb(),
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
		expect(written.credentialKind).toBe('custom');
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
			getAppDb(),
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
			getAppDb(),
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
	beforeEach(async () => {
		await cleanupUser(42);
	});

	afterEach(async () => {
		await cleanupUser(42);
	});

	it('returns null when no credential exists', async () => {
		const result = await getUserCredential(getAppDb(), env, 42, 'groq' as ProviderId);
		expect(result).toBeNull();
	});

	it('returns the matching credential row', async () => {
		await saveUserCredential(
			getAppDb(),
			env,
			buildCredentialInput({ userId: 42, providerId: 'groq' as ProviderId })
		);
		const result = await getUserCredential(getAppDb(), env, 42, 'groq' as ProviderId);
		expect(result).not.toBeNull();
		expect(result?.userId).toBe(42);
		expect(result?.providerId).toBe('groq');
	});
});

describe('getAllUserCredentials', () => {
	beforeEach(async () => {
		await cleanupUser(7);
	});

	afterEach(async () => {
		await cleanupUser(7);
	});

	it('returns db credentials with masked api keys and platform defaults for supported providers', async () => {
		await saveUserCredential(
			getAppDb(),
			env,
			buildCredentialInput({ userId: 7, providerId: 'groq' as ProviderId })
		);
		const envWithKeys = { ...env, GROQ_API_KEY: 'platform-groq-key', DEEPSEEK_API_KEY: 'platform-deepseek-key' };
		const results = await getAllUserCredentials(getAppDb(), envWithKeys, 7, ['groq', 'deepseek'] as ProviderId[]);

		expect(results).toHaveLength(2);
		const dbCred = results.find((r) => r.source === 'db');
		const platformCreds = results.filter((r) => r.source === 'platform');

		expect(dbCred).toBeDefined();
		expect(dbCred?.apiKeyMasked).toContain('...');
		expect(platformCreds).toHaveLength(1);
		expect(platformCreds[0]?.providerId).toBe('deepseek');
	});

	it('ignores unsupported providers', async () => {
		await saveUserCredential(
			getAppDb(),
			env,
			buildCredentialInput({ userId: 7, providerId: 'groq' as ProviderId })
		);
		const results = await getAllUserCredentials(getAppDb(), env, 7, ['deepseek'] as ProviderId[]);
		expect(results).toHaveLength(0);
	});

	it('returns empty array when no credentials or env keys exist', async () => {
		const results = await getAllUserCredentials(getAppDb(), env, 7, ['groq'] as ProviderId[]);
		expect(results).toEqual([]);
	});
});

describe('deleteUserCredential', () => {
	beforeEach(async () => {
		await cleanupUser(3);
		vi.mocked(auditLog.log).mockClear();
	});

	afterEach(async () => {
		await cleanupUser(3);
		vi.restoreAllMocks();
	});

	it('deletes the credential and writes an audit log', async () => {
		const written = await saveUserCredential(
			getAppDb(),
			env,
			buildCredentialInput({ userId: 3, providerId: 'groq' as ProviderId })
		);
		await deleteUserCredential(getAppDb(), 3, 'groq' as ProviderId, audit);
		const result = await getUserCredential(getAppDb(), env, 3, 'groq' as ProviderId);
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
		await deleteUserCredential(getAppDb(), 3, 'groq' as ProviderId, audit);
		expect(auditLog.log).not.toHaveBeenCalled();
	});
});

describe('updateUserCredentialEnabled', () => {
	beforeEach(async () => {
		await cleanupUser(4);
	});

	afterEach(async () => {
		await cleanupUser(4);
		vi.restoreAllMocks();
	});

	it('toggles enabled and writes enable/disable audit entries', async () => {
		await saveUserCredential(
			getAppDb(),
			env,
			buildCredentialInput({ userId: 4, providerId: 'groq' as ProviderId })
		);
		await updateUserCredentialEnabled(getAppDb(), 4, 'groq' as ProviderId, false, audit);
		let row = await getUserCredential(getAppDb(), env, 4, 'groq' as ProviderId);
		expect(row?.enabled).toBe(0);
		expect(auditLog.log).toHaveBeenCalledWith(
			expect.objectContaining({ action: 'disable', entityType: 'userCredential' })
		);

		vi.mocked(auditLog.log).mockClear();
		await updateUserCredentialEnabled(getAppDb(), 4, 'groq' as ProviderId, true, audit);
		row = await getUserCredential(getAppDb(), env, 4, 'groq' as ProviderId);
		expect(row?.enabled).toBe(1);
		expect(auditLog.log).toHaveBeenCalledWith(
			expect.objectContaining({ action: 'enable', entityType: 'userCredential' })
		);
	});
});

describe('rotateCredential', () => {
	beforeEach(async () => {
		await cleanupUser(5);
		await cleanupUser(6);
	});

	afterEach(async () => {
		await cleanupUser(5);
		await cleanupUser(6);
		vi.restoreAllMocks();
	});

	it('re-encrypts a credential with a new key and writes an audit log', async () => {
		await saveUserCredential(
			getAppDb(),
			env,
			buildCredentialInput({ userId: 5, providerId: 'groq' as ProviderId })
		);
		const rotated = await rotateCredential(
			getAppDb(),
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
			rotateCredential(getAppDb(), env, {
				userId: 999,
				providerId: 'groq' as ProviderId,
				newEncryptionKey: 'new-encryption-key-32bytes!'
			})
		).rejects.toThrow(/No credential found/);
	});

	it('throws when the credential has no encrypted data', async () => {
		// A personal credential is required to insert the row, so this case
		// can't be exercised directly via the public API anymore. Instead,
		// verify rotateCredential refuses to rotate a row with null encryptedData.
		await saveUserCredential(
			getAppDb(),
			env,
			buildCredentialInput({ userId: 6, providerId: 'groq' as ProviderId })
		);
		await getAppDb()
			.update(encryptedCredentials)
			.set({ encryptedData: '' })
			.where(and(eq(encryptedCredentials.userId, 6), eq(encryptedCredentials.providerId, 'groq')));
		await expect(
			rotateCredential(getAppDb(), env, {
				userId: 6,
				providerId: 'groq' as ProviderId,
				newEncryptionKey: 'new-encryption-key-32bytes!'
			})
		).rejects.toThrow(/has no encrypted data to rotate/);
	});
});

describe('repairCorruptedCredential', () => {
	beforeEach(async () => {
		await cleanupUser(8);
	});

	afterEach(async () => {
		await cleanupUser(8);
		vi.restoreAllMocks();
	});

	it('repairs a credential using the default fallback key', async () => {
		const defaultKey = 'edapex-default-encryption-key-32ch';
		const plaintext = JSON.stringify({ apiKey: 'fallback-secret' });
		const oldBlob = encryptText(plaintext, defaultKey);
		await getAppDb().insert(encryptedCredentials).values({
			scope: 'user',
			credentialKind: 'personal',
			userId: 8,
			schoolId: null,
			providerId: 'groq',
			encryptedData: oldBlob,
			enabled: 1
		});

		const repaired = await repairCorruptedCredential(getAppDb(), env, {
			userId: 8,
			providerId: 'groq' as ProviderId
		});

		const decrypted = JSON.parse(decryptText(repaired.encryptedData!, envKey));
		expect(decrypted.apiKey).toBe('fallback-secret');
	});
});

describe('resolveApiKeyForCredential', () => {
	it('extracts api key from personal credential encrypted data', () => {
		const encrypted = encryptText(JSON.stringify({ apiKey: 'cred-key' }), envKey);
		const credential: EncryptedCredential = {
			id: '1',
			scope: 'user',
			credentialKind: 'personal',
			userId: 1,
			schoolId: null,
			providerId: 'groq',
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

	it('returns null when credential has no encrypted data', () => {
		const credential: EncryptedCredential = {
			id: '1',
			scope: 'user',
			credentialKind: 'personal',
			userId: 1,
			schoolId: null,
			providerId: 'groq',
			encryptedData: '',
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

	it('extracts api key from a custom credential payload', () => {
		const encrypted = encryptText(
			JSON.stringify({ apiKey: 'custom-key', displayName: 'x', baseUrl: 'u' }),
			envKey
		);
		const credential: EncryptedCredential = {
			id: '1',
			scope: 'user',
			credentialKind: 'custom',
			userId: 1,
			schoolId: null,
			providerId: 'custom',
			encryptedData: encrypted,
			priority: 1,
			enabled: 1,
			createdAt: '',
			updatedAt: '',
			discoveredModels: null,
			discoveredAt: null
		};
		expect(resolveApiKeyForCredential(credential, env, 'custom' as ProviderId)).toBe('custom-key');
	});
});

describe('getCustomCredentialBaseUrl', () => {
	it('returns the baseUrl from a custom credential', () => {
		const encrypted = encryptText(
			JSON.stringify({ displayName: 'x', baseUrl: 'https://custom.example.com' }),
			envKey
		);
		const credential: EncryptedCredential = {
			id: '1',
			scope: 'user',
			credentialKind: 'custom',
			userId: 1,
			schoolId: null,
			providerId: 'custom-provider',
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
		const credential: EncryptedCredential = {
			id: '1',
			scope: 'user',
			credentialKind: 'personal',
			userId: 1,
			schoolId: null,
			providerId: 'groq',
			encryptedData: '',
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
		const payload = {
			displayName: 'x',
			baseUrl: 'https://custom.example.com',
			apiKey: 'secret',
			models: [],
			headers: []
		};
		const encrypted = encryptText(JSON.stringify(payload), envKey);
		expect(decryptCustomProvider(encrypted, env)).toMatchObject(payload);
	});
});
