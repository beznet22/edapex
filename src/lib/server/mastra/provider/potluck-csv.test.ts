import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createClient, type Client } from '@libsql/client';
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';
import { exportDonations, importDonations } from '$lib/server/service/potluck.service';
import { potluckDonations } from '$lib/server/mastra/storage/libsql/app-db.schema';
import { eq } from 'drizzle-orm';

const CREATE_POTLUCK_DONATIONS_SQL = `
CREATE TABLE IF NOT EXISTS potluck_donations (
	id TEXT PRIMARY KEY,
	school_id INTEGER NOT NULL DEFAULT 1,
	provider_id TEXT NOT NULL,
	api_key_encrypted TEXT NOT NULL,
	donated_by INTEGER NOT NULL,
	donated_at TEXT NOT NULL DEFAULT (datetime('now')),
	is_active INTEGER NOT NULL DEFAULT 1,
	last_validated_at TEXT,
	last_validation_status TEXT,
	tos_accepted_at TEXT,
	tos_accepted_by INTEGER,
	tos_version TEXT,
	UNIQUE(school_id, provider_id, donated_by)
);
`;

describe('potluck donation CSV round-trip', () => {
	let client: Client;
	let db: LibSQLDatabase<any>;

	beforeEach(async () => {
		client = createClient({ url: ':memory:' });
		await client.execute(CREATE_POTLUCK_DONATIONS_SQL);
		db = drizzle(client);
	});

	afterEach(async () => {
		await client.close();
	});

	it('exports metadata-only CSV and re-imports the same rows', async () => {
		const schoolId = 7;
		const schoolName = 'Test School';
		await db.insert(potluckDonations).values({
			id: 'don-1',
			schoolId,
			providerId: 'groq',
			apiKeyEncrypted: 'encrypted-key-blob',
			donatedBy: 42,
			donatedAt: '2025-01-15T10:00:00Z',
			isActive: 1,
			tosVersion: '1.0'
		});

		const exported = await exportDonations(db, schoolId, {
			mode: 'metadata-only',
			schoolName
		});
		expect(exported.count).toBe(1);
		expect(exported.csv).toContain('providerId');
		expect(exported.csv).not.toContain('encrypted-key-blob');

		// Metadata-only export has empty key fields, so import must fail
		// validation for encrypted rows. Import without passphrase in
		// metadata-only mode treats key as empty and keeps the existing key.
		const imported = await importDonations(db, exported.csv, {
			schoolName,
			conflictStrategy: 'skip'
		});
		expect(imported.imported).toBe(0);
		expect(imported.skipped).toBe(1);

		const rows = await db.select().from(potluckDonations).where(eq(potluckDonations.schoolId, schoolId));
		expect(rows).toHaveLength(1);
		expect(rows[0]?.providerId).toBe('groq');
	});

	it('exports encrypted CSV and round-trips the key through passphrase', async () => {
		const schoolId = 7;
		const schoolName = 'Test School';
		const passphrase = 'super-secret-passphrase';
		const originalKey = 'original-at-rest-ciphertext';
		await db.insert(potluckDonations).values({
			id: 'don-2',
			schoolId,
			providerId: 'deepseek',
			apiKeyEncrypted: originalKey,
			donatedBy: 43,
			donatedAt: '2025-02-01T12:00:00Z',
			isActive: 1,
			tosVersion: '2.0'
		});

		const exported = await exportDonations(db, schoolId, {
			mode: 'encrypted',
			passphrase,
			schoolName
		});
		expect(exported.count).toBe(1);
		expect(exported.csv).not.toContain(originalKey);

		// Delete the row so the import creates a new one.
		await db.delete(potluckDonations).where(eq(potluckDonations.id, 'don-2'));

		const imported = await importDonations(db, exported.csv, {
			passphrase,
			schoolName,
			conflictStrategy: 'skip'
		});
		expect(imported.imported).toBe(1);
		expect(imported.failures).toHaveLength(0);

		const rows = await db.select().from(potluckDonations).where(eq(potluckDonations.schoolId, schoolId));
		expect(rows).toHaveLength(1);
		expect(rows[0]?.providerId).toBe('deepseek');
		expect(rows[0]?.apiKeyEncrypted).toBe(originalKey);
	});

	it('counts inactive rows and preserves their state on import', async () => {
		const schoolId = 8;
		const schoolName = 'Other School';
		const passphrase = 'p';
		await db.insert(potluckDonations).values({
			id: 'don-3',
			schoolId,
			providerId: 'opencode',
			apiKeyEncrypted: 'k3',
			donatedBy: 44,
			donatedAt: '2025-03-01T00:00:00Z',
			isActive: 0,
			tosVersion: '1.0'
		});

		const exported = await exportDonations(db, schoolId, {
			mode: 'encrypted',
			passphrase,
			schoolName
		});
		expect(exported.count).toBe(1);

		await db.delete(potluckDonations).where(eq(potluckDonations.id, 'don-3'));

		const imported = await importDonations(db, exported.csv, {
			passphrase,
			schoolName,
			conflictStrategy: 'skip'
		});
		expect(imported.imported).toBe(1);

		const rows = await db.select().from(potluckDonations).where(eq(potluckDonations.schoolId, schoolId));
		expect(rows[0]?.isActive).toBe(0);
	});
});
