import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createClient, type Client } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { eq } from 'drizzle-orm';
import { MIGRATION_007_COLON_ID_NORMALIZE_SQL } from './007-colon-id-normalize';
import {
	encryptedCredentials,
	modelVisibility,
	providerAccessPolicy,
	potluckConfig
} from '../app-db.schema';
import { encrypt, getEncryptionKey } from '$lib/server/mastra/provider/crypto';

const CREATE_UNIFIED_TABLES_SQL = `
CREATE TABLE IF NOT EXISTS encrypted_credentials (
	id TEXT PRIMARY KEY,
	scope TEXT NOT NULL CHECK (scope IN ('user', 'school')),
	credential_kind TEXT NOT NULL CHECK (credential_kind IN ('personal', 'donation', 'custom')),
	user_id INTEGER,
	school_id INTEGER,
	provider_id TEXT NOT NULL,
	encrypted_data TEXT NOT NULL,
	priority INTEGER NOT NULL DEFAULT 1,
	enabled INTEGER NOT NULL DEFAULT 1,
	discovered_models TEXT,
	discovered_at TEXT,
	created_at TEXT NOT NULL DEFAULT (datetime('now')),
	updated_at TEXT NOT NULL DEFAULT (datetime('now')),
	CHECK (
		(scope = 'user' AND user_id IS NOT NULL AND school_id IS NULL) OR
		(scope = 'school' AND school_id IS NOT NULL AND user_id IS NULL)
	)
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_encrypted_credential ON encrypted_credentials(scope, credential_kind, user_id, school_id, provider_id);

CREATE TABLE IF NOT EXISTS model_visibility (
	id TEXT PRIMARY KEY,
	scope TEXT NOT NULL CHECK (scope IN ('user', 'school')),
	user_id INTEGER,
	school_id INTEGER,
	model_id TEXT NOT NULL,
	visible INTEGER NOT NULL DEFAULT 1,
	updated_at TEXT NOT NULL DEFAULT (datetime('now')),
	CHECK (
		(scope = 'user' AND user_id IS NOT NULL AND school_id IS NULL) OR
		(scope = 'school' AND school_id IS NOT NULL AND user_id IS NULL)
	)
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_model_visibility_user ON model_visibility(user_id, model_id) WHERE scope = 'user';
CREATE UNIQUE INDEX IF NOT EXISTS uniq_model_visibility_school ON model_visibility(school_id, model_id) WHERE scope = 'school';

CREATE TABLE IF NOT EXISTS provider_access_policy (
	id TEXT PRIMARY KEY,
	school_id INTEGER NOT NULL,
	rule_type TEXT NOT NULL CHECK (rule_type IN ('allow', 'deny')),
	target TEXT NOT NULL CHECK (target IN ('provider', 'model')),
	provider_id TEXT NOT NULL,
	model_id TEXT,
	reason TEXT,
	disabled_by INTEGER,
	disabled_at TEXT NOT NULL DEFAULT (datetime('now')),
	CHECK (
		(target = 'provider' AND model_id IS NULL) OR
		(target = 'model' AND model_id IS NOT NULL)
	)
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_provider_access_policy ON provider_access_policy(school_id, target, provider_id, COALESCE(model_id, ''));

CREATE TABLE IF NOT EXISTS potluck_config (
	school_id INTEGER PRIMARY KEY,
	enabled INTEGER NOT NULL DEFAULT 0,
	donor_roles TEXT NOT NULL DEFAULT '[]',
	consumer_roles TEXT NOT NULL DEFAULT '[]',
	per_user_daily_token_cap INTEGER NOT NULL DEFAULT 0,
	per_user_daily_request_cap INTEGER NOT NULL DEFAULT 0,
	per_provider_daily_token_cap INTEGER,
	audit_retention_days INTEGER NOT NULL DEFAULT 90,
	tos_version TEXT,
	updated_by INTEGER NOT NULL DEFAULT 1,
	updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

function splitStatements(sql: string): string[] {
	return sql
		.split(/;\s*(?:\n|$)/)
		.map((s) => s.trim())
		.filter((s) => s.length > 0 && !s.startsWith('--'));
}

describe('unified table integration', () => {
	let client: Client;

	beforeEach(async () => {
		client = createClient({ url: ':memory:' });
		for (const stmt of splitStatements(CREATE_UNIFIED_TABLES_SQL)) {
			await client.execute(stmt);
		}
	});

	afterEach(async () => {
		await client.close();
	});

	it('round-trips a personal credential in encrypted_credentials', async () => {
		const db = drizzle(client);
		const env = { TOKEN_ENCRYPTION_KEY: getEncryptionKey({}) };
		const payload = JSON.stringify({ apiKey: 'personal-key' });
		const encrypted = encrypt(payload, env.TOKEN_ENCRYPTION_KEY);

		await db.insert(encryptedCredentials).values({
			scope: 'user',
			credentialKind: 'personal',
			userId: 42,
			schoolId: null,
			providerId: 'groq',
			encryptedData: encrypted,
			enabled: 1,
			priority: 1
		});

		const rows = await db
			.select()
			.from(encryptedCredentials)
			.where(eq(encryptedCredentials.userId, 42));
		expect(rows).toHaveLength(1);
		expect(rows[0]?.providerId).toBe('groq');
		expect(rows[0]?.scope).toBe('user');
		expect(rows[0]?.credentialKind).toBe('personal');
	});

	it('enforces the user-scope CHECK constraint on encrypted_credentials', async () => {
		const db = drizzle(client);
		const env = { TOKEN_ENCRYPTION_KEY: getEncryptionKey({}) };
		const encrypted = encrypt('x', env.TOKEN_ENCRYPTION_KEY);

		await expect(
			db.insert(encryptedCredentials).values({
				scope: 'user',
				credentialKind: 'personal',
				userId: 42,
				schoolId: 7,
				providerId: 'groq',
				encryptedData: encrypted
			})
		).rejects.toThrow();
	});

	it('round-trips user and school model_visibility rows', async () => {
		const db = drizzle(client);
		await db.insert(modelVisibility).values({
			scope: 'user',
			userId: 42,
			schoolId: null,
			modelId: 'groq/llama',
			visible: 0
		});
		await db.insert(modelVisibility).values({
			scope: 'school',
			userId: null,
			schoolId: 7,
			modelId: 'deepseek/chat',
			visible: 1
		});

		const userRows = await db
			.select()
			.from(modelVisibility)
			.where(eq(modelVisibility.userId, 42));
		const schoolRows = await db
			.select()
			.from(modelVisibility)
			.where(eq(modelVisibility.schoolId, 7));

		expect(userRows).toHaveLength(1);
		expect(userRows[0]?.modelId).toBe('groq/llama');
		expect(schoolRows).toHaveLength(1);
		expect(schoolRows[0]?.modelId).toBe('deepseek/chat');
	});

	it('round-trips allow and deny provider_access_policy rows', async () => {
		const db = drizzle(client);
		await db.insert(providerAccessPolicy).values({
			schoolId: 7,
			ruleType: 'allow',
			target: 'provider',
			providerId: 'groq',
			modelId: null,
			reason: 'approved pool provider'
		});
		await db.insert(providerAccessPolicy).values({
			schoolId: 7,
			ruleType: 'deny',
			target: 'model',
			providerId: 'deepseek',
			modelId: 'deepseek/chat',
			reason: 'deprecated'
		});

		const rows = await db
			.select()
			.from(providerAccessPolicy)
			.where(eq(providerAccessPolicy.schoolId, 7));
		expect(rows).toHaveLength(2);
		expect(rows.map((r) => r.ruleType).sort()).toEqual(['allow', 'deny']);
	});

	it('round-trips potluck_config without an allowed_providers column', async () => {
		await client.execute({
			sql: `INSERT INTO potluck_config (
				school_id, enabled, donor_roles, consumer_roles,
				per_user_daily_token_cap, per_user_daily_request_cap,
				audit_retention_days, tos_version, updated_by
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			args: [7, 1, '[]', '["student"]', 1000, 100, 90, '1.0', 1]
		});

		const { rows } = await client.execute({
			sql: 'SELECT enabled, consumer_roles FROM potluck_config WHERE school_id = ?',
			args: [7]
		});
		expect(rows).toHaveLength(1);
		expect(rows[0]?.enabled).toBe(1);
		expect(rows[0]?.consumer_roles).toBe('["student"]');

		const { rows: cols } = await client.execute({
			sql: "SELECT name FROM pragma_table_info('potluck_config') WHERE name = ?",
			args: ['allowed_providers']
		});
		expect(cols).toHaveLength(0);
	});
});

describe('007_colon_id_normalize migration', () => {
	let client: Client;

	beforeEach(async () => {
		client = createClient({ url: ':memory:' });
		// Bootstrap the migrations table and create the target table.
		await client.execute(`
			CREATE TABLE IF NOT EXISTS _MIGRATIONS (
				id TEXT PRIMARY KEY,
				name TEXT NOT NULL,
				applied_at TEXT NOT NULL DEFAULT (datetime('now'))
			);
		`);
		await client.execute(`
			CREATE TABLE IF NOT EXISTS model_visibility (
				id TEXT PRIMARY KEY,
				scope TEXT NOT NULL,
				user_id INTEGER,
				school_id INTEGER,
				model_id TEXT NOT NULL,
				visible INTEGER NOT NULL DEFAULT 1,
				updated_at TEXT NOT NULL DEFAULT (datetime('now'))
			);
		`);
		await client.execute(`
			CREATE TABLE IF NOT EXISTS encrypted_credentials (
				id TEXT PRIMARY KEY,
				model_id TEXT
			);
		`);
		await client.execute(`
			CREATE TABLE IF NOT EXISTS provider_access_policy (
				id TEXT PRIMARY KEY,
				model_id TEXT
			);
		`);
	});

	afterEach(async () => {
		await client.close();
	});

	it('rewrites colon-format model_ids to slash format', async () => {
		await client.execute({
			sql: "INSERT INTO model_visibility (id, scope, user_id, model_id, visible) VALUES (?, ?, ?, ?, ?)",
			args: ['mv-1', 'user', 99, 'groq:legacy-colon-model', 1]
		});

		for (const stmt of splitStatements(MIGRATION_007_COLON_ID_NORMALIZE_SQL)) {
			await client.execute(stmt);
		}

		const { rows } = await client.execute({
			sql: 'SELECT model_id FROM model_visibility WHERE user_id = ?',
			args: [99]
		});
		expect(rows[0]?.model_id).toBe('groq/legacy-colon-model');
	});
});
