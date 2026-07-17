/**
 * Migration registry — single clean migration for the unified EdApex app
 * schema on libSQL.
 *
 * All legacy tables (`user_credentials`, `user_model_visibility`,
 * `admin_model_overrides`, `potluck_donations`) have been removed. Their
 * data models now live in the unified tables below.
 */
export interface Migration {
	readonly id: string;
	readonly name: string;
	readonly upSql: string;
}

export const MIGRATIONS: readonly Migration[] = [
	{
		id: '002_create_unified_schema',
		name: 'create unified EdApex app schema on libSQL',
		upSql: `
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
	CHECK (
		(target = 'provider' AND model_id IS NULL) OR
		(target = 'model' AND model_id IS NOT NULL)
	)
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_provider_access_policy ON provider_access_policy(school_id, rule_type, target, provider_id, COALESCE(model_id, ''));

CREATE TABLE IF NOT EXISTS platform_provider_discoveries (
	school_id INTEGER NOT NULL,
	provider_id TEXT NOT NULL,
	models TEXT NOT NULL,
	discovered_at TEXT NOT NULL DEFAULT (datetime('now')),
	PRIMARY KEY (school_id, provider_id)
);

CREATE TABLE IF NOT EXISTS agent_settings (
	user_id INTEGER PRIMARY KEY,
	global_tools_enabled INTEGER NOT NULL DEFAULT 1,
	updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS rate_limit_state (
	id TEXT PRIMARY KEY,
	user_id INTEGER NOT NULL,
	provider_id TEXT NOT NULL,
	model_id TEXT,
	window TEXT NOT NULL,
	limit_value INTEGER,
	remaining INTEGER,
	reset_at TEXT NOT NULL,
	recorded_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_rate_limit_state ON rate_limit_state(user_id, provider_id, model_id, window);

CREATE TABLE IF NOT EXISTS mastra_runs (
	id TEXT PRIMARY KEY,
	workflow_id TEXT NOT NULL,
	school_id INTEGER NOT NULL,
	class_id INTEGER,
	section_id INTEGER,
	user_id INTEGER NOT NULL,
	status TEXT NOT NULL,
	started_at TEXT NOT NULL DEFAULT (datetime('now')),
	completed_at TEXT,
	total_steps INTEGER NOT NULL DEFAULT 0,
	completed_steps INTEGER NOT NULL DEFAULT 0,
	failed_steps INTEGER NOT NULL DEFAULT 0,
	duration_ms INTEGER,
	error TEXT
);

CREATE TABLE IF NOT EXISTS mastra_run_steps (
	id TEXT PRIMARY KEY,
	run_id TEXT NOT NULL REFERENCES mastra_runs(id),
	step_name TEXT NOT NULL,
	step_index INTEGER NOT NULL,
	status TEXT NOT NULL,
	input_payload TEXT,
	output_payload TEXT,
	error TEXT,
	stack_trace TEXT,
	duration_ms INTEGER,
	created_at TEXT NOT NULL DEFAULT (datetime('now'))
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

CREATE TABLE IF NOT EXISTS telegram_parent_link (
	chat_id TEXT PRIMARY KEY,
	parent_id INTEGER NOT NULL,
	user_id INTEGER NOT NULL,
	school_id INTEGER NOT NULL,
	school_name TEXT,
	school_phone TEXT,
	school_email TEXT,
	child_ids TEXT NOT NULL,
	child_names TEXT NOT NULL,
	linked_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS connect_tokens (
	id INTEGER PRIMARY KEY AUTOINCREMENT,
	parent_id INTEGER NOT NULL,
	token TEXT NOT NULL UNIQUE,
	expires_at TEXT NOT NULL,
	used_at TEXT,
	school_id INTEGER NOT NULL DEFAULT 1,
	created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`
	},
	{
		id: '003_create_token_usage',
		name: 'create token_usage table for per-user daily caps',
		upSql: `
CREATE TABLE IF NOT EXISTS token_usage (
	user_id INTEGER NOT NULL,
	day TEXT NOT NULL,
	provider_id TEXT NOT NULL,
	tokens INTEGER NOT NULL DEFAULT 0,
	requests INTEGER NOT NULL DEFAULT 0,
	updated_at TEXT NOT NULL DEFAULT (datetime('now')),
	PRIMARY KEY (user_id, day, provider_id)
);
`
	}
] as const;
