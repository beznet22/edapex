/**
 * Unit test setup — ensures the libSQL application tables exist.
 *
 * The unit project runs against the same `mastra.db` file as the app but
 * does not go through the production boot sequence that applies migrations.
 * This setup creates the tables the provider/audit unit tests touch so each
 * test file can focus on behaviour rather than schema bootstrapping.
 *
 * Statements are `CREATE TABLE IF NOT EXISTS` so they are idempotent across
 * test files and worker restarts. They mirror the Drizzle schema in
 * src/lib/server/mastra/storage/libsql/app-db.schema.ts.
 */
import { beforeAll } from 'vitest';
import { getAppDb } from '$lib/server/mastra/storage/libsql/app-db';

const CREATE_TABLES = `
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

CREATE TABLE IF NOT EXISTS user_model_visibility (
	id TEXT PRIMARY KEY,
	user_id INTEGER NOT NULL,
	model_id TEXT NOT NULL,
	visible INTEGER NOT NULL DEFAULT 1,
	updated_at TEXT NOT NULL DEFAULT (datetime('now')),
	UNIQUE(user_id, model_id)
);

CREATE TABLE IF NOT EXISTS potluck_config (
	school_id INTEGER PRIMARY KEY,
	enabled INTEGER NOT NULL DEFAULT 0,
	donor_roles TEXT NOT NULL DEFAULT '[]',
	consumer_roles TEXT NOT NULL DEFAULT '[]',
	allowed_providers TEXT NOT NULL DEFAULT '[]',
	per_user_daily_token_cap INTEGER NOT NULL DEFAULT 0,
	per_user_daily_request_cap INTEGER NOT NULL DEFAULT 0,
	per_provider_daily_token_cap INTEGER,
	audit_retention_days INTEGER NOT NULL DEFAULT 90,
	tos_version TEXT,
	updated_by INTEGER NOT NULL DEFAULT 1,
	updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

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

CREATE TABLE IF NOT EXISTS admin_model_overrides (
	id TEXT PRIMARY KEY,
	school_id INTEGER NOT NULL DEFAULT 1,
	provider_id TEXT NOT NULL,
	model_id TEXT,
	reason TEXT,
	disabled_by INTEGER NOT NULL,
	disabled_at TEXT NOT NULL DEFAULT (datetime('now')),
	UNIQUE(school_id, provider_id, model_id)
);

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
CREATE UNIQUE INDEX IF NOT EXISTS uniq_encrypted_credential_user ON encrypted_credentials(scope, credential_kind, user_id, provider_id);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_encrypted_credential_school ON encrypted_credentials(scope, credential_kind, school_id, provider_id);

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
CREATE UNIQUE INDEX IF NOT EXISTS uniq_model_visibility_user ON model_visibility(scope, user_id, model_id) WHERE scope = 'user';
CREATE UNIQUE INDEX IF NOT EXISTS uniq_model_visibility_school ON model_visibility(scope, school_id, model_id) WHERE scope = 'school';

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
	UNIQUE(school_id, rule_type, target, provider_id, model_id),
	CHECK (
		(target = 'provider' AND model_id IS NULL) OR
		(target = 'model' AND model_id IS NOT NULL)
	)
);

CREATE TABLE IF NOT EXISTS token_usage (
	user_id INTEGER NOT NULL,
	day TEXT NOT NULL,
	provider_id TEXT NOT NULL,
	tokens INTEGER NOT NULL DEFAULT 0,
	requests INTEGER NOT NULL DEFAULT 0,
	updated_at TEXT NOT NULL DEFAULT (datetime('now')),
	PRIMARY KEY (user_id, day, provider_id)
);
`;

beforeAll(async () => {
	const db = getAppDb();
	for (const statement of CREATE_TABLES.split(';').map((s) => s.trim()).filter(Boolean)) {
		await db.run(statement);
	}
});
