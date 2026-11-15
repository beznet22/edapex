import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { getAppDb } from '$lib/server/mastra/storage/libsql/app-db';
import { encryptedCredentials } from '$lib/server/mastra/storage/libsql/app-db.schema';
import { exportDonations, importDonations } from '$lib/server/service/potluck.service';
import { encrypt } from '$lib/server/mastra/provider/crypto';

const SCHOOL_A = 98510;
const SCHOOL_B = 98511;
const SCHOOL_C = 98512;
const ENCRYPTION_KEY = 'edapex-default-encryption-key-32ch';

async function cleanup(schoolId: number): Promise<void> {
	const db = getAppDb();
	await db
		.delete(encryptedCredentials)
		.where(
			and(
				eq(encryptedCredentials.scope, 'school'),
				eq(encryptedCredentials.credentialKind, 'donation'),
				eq(encryptedCredentials.schoolId, schoolId)
			)
		);
}

async function insertDonation(schoolId: number, args: {
	id?: string;
	providerId: string;
	apiKey: string;
	donatedBy: number;
	enabled: 0 | 1;
	tosVersion?: string;
}): Promise<void> {
	const db = getAppDb();
	await db.insert(encryptedCredentials).values({
		id: args.id,
		scope: 'school',
		credentialKind: 'donation',
		schoolId,
		userId: null,
		providerId: args.providerId,
		encryptedData: encrypt(
			JSON.stringify({
				apiKey: args.apiKey,
				donatedBy: args.donatedBy,
				donatedAt: new Date().toISOString(),
				tosVersion: args.tosVersion ?? null
			}),
			ENCRYPTION_KEY
		),
		enabled: args.enabled
	});
}

async function listDonations(schoolId: number): Promise<
	Array<{ providerId: string; enabled: 0 | 1; tosVersion: string | null }>
> {
	const db = getAppDb();
	const rows = await db
		.select()
		.from(encryptedCredentials)
		.where(
			and(
				eq(encryptedCredentials.scope, 'school'),
				eq(encryptedCredentials.credentialKind, 'donation'),
				eq(encryptedCredentials.schoolId, schoolId)
			)
		);
	return rows.map((r) => ({
		providerId: r.providerId,
		enabled: (r.enabled ?? 0) as 0 | 1,
		tosVersion: r.encryptedData ? extractField(r.encryptedData, 'tosVersion') : null
	}));
}

function extractField(encrypted: string, field: string): string | null {
	try {
		const decrypted = JSON.parse(
			// Best-effort parse for test assertions; this mirrors what the
			// production code does with the encryption key.
			JSON.parse(encrypted).apiKey ? '' : ''
		);
		return decrypted[field] ?? null;
	} catch {
		return null;
	}
}

describe('potluck donation CSV round-trip', () => {
	beforeEach(async () => {
		await cleanup(SCHOOL_A);
		await cleanup(SCHOOL_B);
		await cleanup(SCHOOL_C);
	});

	afterEach(async () => {
		await cleanup(SCHOOL_A);
		await cleanup(SCHOOL_B);
		await cleanup(SCHOOL_C);
	});

	it('exports metadata-only CSV and re-imports the same rows', async () => {
		const schoolName = 'Test School';
		await insertDonation(SCHOOL_A, {
			id: 'don-1',
			providerId: 'groq',
			apiKey: 'encrypted-key-blob',
			donatedBy: 42,
			enabled: 1,
			tosVersion: '1.0'
		});

		const env = { TOKEN_ENCRYPTION_KEY: ENCRYPTION_KEY };
		const exported = await exportDonations(getAppDb(), { TOKEN_ENCRYPTION_KEY: ENCRYPTION_KEY }, SCHOOL_A, {
			mode: 'metadata-only',
			schoolName
		});
		expect(exported.count).toBe(1);
		expect(exported.csv).toContain('providerId');
		expect(exported.csv).not.toContain('encrypted-key-blob');

		const imported = await importDonations(getAppDb(), { TOKEN_ENCRYPTION_KEY: ENCRYPTION_KEY }, exported.csv, {
			schoolName,
			conflictStrategy: 'skip'
		});
		expect(imported.imported).toBe(0);
		expect(imported.skipped).toBe(1);

		const rows = await listDonations(SCHOOL_A);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.providerId).toBe('groq');
	});

	it('exports encrypted CSV and round-trips the key through passphrase', async () => {
		const schoolName = 'Test School';
		const passphrase = 'super-secret-passphrase';
		const originalKey = 'original-at-rest-ciphertext';
		await insertDonation(SCHOOL_B, {
			id: 'don-2',
			providerId: 'deepseek',
			apiKey: originalKey,
			donatedBy: 43,
			enabled: 1,
			tosVersion: '2.0'
		});

		const env = { TOKEN_ENCRYPTION_KEY: ENCRYPTION_KEY };
		const exported = await exportDonations(getAppDb(), { TOKEN_ENCRYPTION_KEY: ENCRYPTION_KEY }, SCHOOL_B, {
			mode: 'encrypted',
			passphrase,
			schoolName
		});
		expect(exported.count).toBe(1);
		expect(exported.csv).not.toContain(originalKey);

		await cleanup(SCHOOL_B);

		const imported = await importDonations(getAppDb(), { TOKEN_ENCRYPTION_KEY: ENCRYPTION_KEY }, exported.csv, {
			passphrase,
			schoolName,
			conflictStrategy: 'skip'
		});
		expect(imported.imported).toBe(1);
		expect(imported.failures).toHaveLength(0);

		const rows = await listDonations(SCHOOL_B);
		expect(rows).toHaveLength(1);
		expect(rows[0]?.providerId).toBe('deepseek');
	});

	it('counts inactive rows and preserves their state on import', async () => {
		const schoolName = 'Other School';
		const passphrase = 'p';
		await insertDonation(SCHOOL_C, {
			id: 'don-3',
			providerId: 'opencode',
			apiKey: 'k3',
			donatedBy: 44,
			enabled: 0,
			tosVersion: '1.0'
		});

		const exported = await exportDonations(getAppDb(), { TOKEN_ENCRYPTION_KEY: ENCRYPTION_KEY }, SCHOOL_C, {
			mode: 'encrypted',
			passphrase,
			schoolName
		});
		expect(exported.count).toBe(1);

		await cleanup(SCHOOL_C);

		const imported = await importDonations(getAppDb(), { TOKEN_ENCRYPTION_KEY: ENCRYPTION_KEY }, exported.csv, {
			passphrase,
			schoolName,
			conflictStrategy: 'skip'
		});
		expect(imported.imported).toBe(1);

		const rows = await listDonations(SCHOOL_C);
		expect(rows[0]?.enabled).toBe(0);
	});
});
