import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { getAppDb } from '$lib/server/mastra/storage/libsql/app-db';
import { encryptedCredentials } from '$lib/server/mastra/storage/libsql/app-db.schema';
import { repairCorruptedCredential } from './credentials';
import { encrypt as encryptText, decrypt as decryptText } from './crypto';
import * as auditLog from '$lib/server/audit-log';
import type { ProviderId } from './types';

vi.mock('$lib/server/audit-log', () => ({
	log: vi.fn().mockResolvedValue(undefined)
}));

const USER_A = 98600;
const USER_B = 98601;
const USER_C = 98602;
const USER_D = 98603;
const PROVIDER = 'groq' as ProviderId;
const CURRENT_KEY = 'current-encryption-key-32chars!!';
const OLD_KEY = 'old-encryption-key-32chars!!!';

async function cleanupUser(userId: number): Promise<void> {
	const db = getAppDb();
	await db
		.delete(encryptedCredentials)
		.where(and(eq(encryptedCredentials.scope, 'user'), eq(encryptedCredentials.userId, userId)));
}

async function insertCredential(
	userId: number,
	providerId: ProviderId,
	encryptedData: string | null
): Promise<string> {
	const db = getAppDb();
	const rows = await db
		.insert(encryptedCredentials)
		.values({
			scope: 'user',
			credentialKind: 'personal',
			userId,
			schoolId: null,
			providerId,
			encryptedData: encryptedData ?? '',
			enabled: 1
		})
		.returning();
	const row = rows[0];
	if (!row) throw new Error('Expected insert to return row');
	return row.id;
}

describe('repairCorruptedCredential', () => {
	beforeEach(async () => {
		await cleanupUser(USER_A);
		await cleanupUser(USER_B);
		await cleanupUser(USER_C);
		await cleanupUser(USER_D);
	});

	afterEach(async () => {
		await cleanupUser(USER_A);
		await cleanupUser(USER_B);
		await cleanupUser(USER_C);
		await cleanupUser(USER_D);
		vi.restoreAllMocks();
	});

	it('re-encrypts a credential that was encrypted with a different key', async () => {
		const plaintext = JSON.stringify({ apiKey: 'super-secret-key' });
		const corruptedBlob = encryptText(plaintext, OLD_KEY);
		const insertedId = await insertCredential(USER_A, PROVIDER, corruptedBlob);

		const env = { TOKEN_ENCRYPTION_KEY: CURRENT_KEY };
		const repaired = await repairCorruptedCredential(
			getAppDb(),
			env,
			{ userId: USER_A, providerId: PROVIDER, fallbackEncryptionKey: OLD_KEY },
			{ schoolId: 1, actorStaffId: 99 }
		);

		expect(repaired.id).toBe(insertedId);
		expect(repaired.encryptedData).not.toBe(corruptedBlob);

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
		const plaintext = JSON.stringify({ apiKey: 'x' });
		const blob = encryptText(plaintext, 'yet-another-key-32chars!!');
		await insertCredential(USER_B, PROVIDER, blob);

		const env = { TOKEN_ENCRYPTION_KEY: CURRENT_KEY };
		await expect(
			repairCorruptedCredential(getAppDb(), env, {
				userId: USER_B,
				providerId: PROVIDER,
				fallbackEncryptionKey: OLD_KEY
			})
		).rejects.toThrow(/could not be decrypted/);
	});

	it('throws when the credential row is missing', async () => {
		const env = { TOKEN_ENCRYPTION_KEY: CURRENT_KEY };
		await expect(
			repairCorruptedCredential(getAppDb(), env, {
				userId: 999999,
				providerId: PROVIDER
			})
		).rejects.toThrow(/No credential found/);
	});

	it('throws when the credential has no encrypted data', async () => {
		await insertCredential(USER_D, PROVIDER, null);

		const env = { TOKEN_ENCRYPTION_KEY: CURRENT_KEY };
		await expect(
			repairCorruptedCredential(getAppDb(), env, {
				userId: USER_D,
				providerId: PROVIDER
			})
		).rejects.toThrow(/no encrypted data to repair/);
	});
});
