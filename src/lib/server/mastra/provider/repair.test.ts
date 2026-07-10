import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';
import { createClient, type Client } from '@libsql/client';
import { eq } from 'drizzle-orm';
import { userCredentials, type UserCredential } from '$lib/server/mastra/storage/libsql/app-db.schema';
import {
	repairCorruptedCredential,
	saveUserCredential,
	type RepairCorruptedCredentialInput
} from './credentials';
import { encrypt as encryptText, decrypt as decryptText } from './crypto';
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

function createInMemoryDb(): LibSQLDatabase<any> {
	const client = createClient({ url: ':memory:' });
	client.execute(CREATE_USER_CREDENTIALS_SQL);
	return drizzle(client);
}

const CURRENT_KEY = 'current-encryption-key-32chars!!';
const OLD_KEY = 'old-encryption-key-32chars!!!';

describe('repairCorruptedCredential', () => {
	let db: LibSQLDatabase<any>;
	let client: Client;

	beforeEach(() => {
		const c = createClient({ url: ':memory:' });
		c.execute(CREATE_USER_CREDENTIALS_SQL);
		client = c;
		db = drizzle(c);
	});

	afterEach(async () => {
		vi.restoreAllMocks();
		await client.close();
	});

	it('re-encrypts a credential that was encrypted with a different key', async () => {
		const userId = 42;
		const providerId = 'groq' as ProviderId;
		const plaintext = JSON.stringify({ apiKey: 'super-secret-key' });
		const corruptedBlob = encryptText(plaintext, OLD_KEY);

		const inserted = await db
			.insert(userCredentials)
			.values({
				userId,
				providerId,
				credentialType: 'credential',
				encryptedData: corruptedBlob,
				enabled: 1
			})
			.returning();

		const env = { TOKEN_ENCRYPTION_KEY: CURRENT_KEY };
		const repaired = await repairCorruptedCredential(
			db,
			env,
			{ userId, providerId, fallbackEncryptionKey: OLD_KEY },
			{ schoolId: 1, actorStaffId: 99 }
		);

		expect(repaired.id).toBe(inserted[0]?.id);
		expect(repaired.encryptedData).not.toBe(corruptedBlob);

		// The repaired ciphertext must decrypt with the current key.
		const decrypted = decryptText(repaired.encryptedData!, CURRENT_KEY);
		expect(JSON.parse(decrypted).apiKey).toBe('super-secret-key');

		expect(auditLog.log).toHaveBeenCalledTimes(1);
		const call = vi.mocked(auditLog.log).mock.calls[0][0];
		expect(call.action).toBe('update');
		expect(call.entityType).toBe('userCredential');
		const after = call.after as Record<string, unknown>;
		expect(after.encryptedData).toBe(repaired.encryptedData);
	});

	it('throws when neither current nor fallback key can decrypt the blob', async () => {
		const userId = 7;
		const providerId = 'deepseek' as ProviderId;
		const plaintext = JSON.stringify({ apiKey: 'x' });
		const blob = encryptText(plaintext, 'yet-another-key-32chars!!');

		await db.insert(userCredentials).values({
			userId,
			providerId,
			credentialType: 'credential',
			encryptedData: blob,
			enabled: 1
		});

		const env = { TOKEN_ENCRYPTION_KEY: CURRENT_KEY };
		await expect(
			repairCorruptedCredential(db, env, {
				userId,
				providerId,
				fallbackEncryptionKey: OLD_KEY
			})
		).rejects.toThrow(/could not be decrypted/);
	});

	it('throws when the credential row is missing', async () => {
		const env = { TOKEN_ENCRYPTION_KEY: CURRENT_KEY };
		await expect(
			repairCorruptedCredential(db, env, {
				userId: 999,
				providerId: 'groq' as ProviderId
			})
		).rejects.toThrow(/No credential found/);
	});

	it('throws when the credential has no encrypted data', async () => {
		const userId = 8;
		const providerId = 'groq' as ProviderId;
		await db.insert(userCredentials).values({
			userId,
			providerId,
			credentialType: 'env',
			encryptedData: null,
			enabled: 1
		});

		const env = { TOKEN_ENCRYPTION_KEY: CURRENT_KEY };
		await expect(
			repairCorruptedCredential(db, env, { userId, providerId })
		).rejects.toThrow(/no encrypted data to repair/);
	});
});
