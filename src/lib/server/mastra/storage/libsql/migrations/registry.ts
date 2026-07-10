/**
 * Migration registry — the single source of truth for ordered DDL/DML changes
 * applied to the application database.
 *
 * The bootstrap migration (`001_init`) is hardcoded inside `runner.ts` because
 * it must run before _MIGRATIONS exists. Everything else lives here.
 *
 * Steps 2/3 of this phase fill in the real SQL strings; for now each entry
 * is a placeholder so the runner can list exactly 5 pending migrations in
 * dry-run mode (matches the step-1 verify command).
 */
export interface Migration {
	readonly id: string;
	readonly name: string;
	readonly upSql: string;
}

export const MIGRATIONS: readonly Migration[] = [
	{
		id: '002_create_unified_tables',
		name: 'create unified tables (encrypted_credentials, model_visibility, provider_access_policy)',
		upSql: `
CREATE TABLE encrypted_credentials (
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
CREATE TABLE model_visibility (
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
CREATE UNIQUE INDEX uniq_model_visibility_user ON model_visibility(user_id, model_id) WHERE scope = 'user';
CREATE UNIQUE INDEX uniq_model_visibility_school ON model_visibility(school_id, model_id) WHERE scope = 'school';
CREATE TABLE provider_access_policy (
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
CREATE UNIQUE INDEX uniq_provider_access_policy ON provider_access_policy(school_id, target, provider_id, COALESCE(model_id, ''));
`
	},
	{
		id: '003_migrate_credentials',
		name: 'migrate user_credentials + potluck_donations into encrypted_credentials',
		upSql: `
INSERT INTO encrypted_credentials (
	id, scope, credential_kind, user_id, school_id, provider_id,
	encrypted_data, priority, enabled,
	discovered_models, discovered_at,
	created_at, updated_at
)
SELECT
	'mig-uc-' || id,
	'user',
	CASE credential_type WHEN 'custom' THEN 'custom' ELSE 'personal' END,
	user_id,
	NULL,
	provider_id,
	encrypted_data,
	priority,
	enabled,
	discovered_models,
	discovered_at,
	COALESCE(created_at, datetime('now')),
	COALESCE(updated_at, datetime('now'))
FROM user_credentials
WHERE credential_type != 'env' AND encrypted_data IS NOT NULL;
INSERT INTO encrypted_credentials (
	id, scope, credential_kind, user_id, school_id, provider_id,
	encrypted_data, priority, enabled,
	discovered_models, discovered_at,
	created_at, updated_at
)
SELECT
	'mig-pd-' || id,
	'school',
	'donation',
	NULL,
	school_id,
	provider_id,
	api_key_encrypted,
	1,
	is_active,
	NULL,
	NULL,
	COALESCE(donated_at, datetime('now')),
	COALESCE(donated_at, datetime('now'))
FROM potluck_donations;
`
	},
	{
		id: '004_migrate_visibility',
		name: 'migrate user_model_visibility into model_visibility',
		upSql: `
INSERT INTO model_visibility (id, scope, user_id, school_id, model_id, visible, updated_at)
SELECT
	'mig-umv-' || id,
	'user',
	user_id,
	NULL,
	model_id,
	visible,
	COALESCE(updated_at, datetime('now'))
FROM user_model_visibility;
`
	},
	{
		id: '005_migrate_access_policy',
		name: 'migrate admin_model_overrides (deny rules) + potluck_config.allowed_providers (allow rules) into provider_access_policy',
		upSql: `
INSERT INTO provider_access_policy (
	id, school_id, rule_type, target, provider_id, model_id, reason, disabled_by, disabled_at
)
SELECT
	'mig-deny-' || id,
	school_id,
	'deny',
	CASE WHEN model_id IS NULL THEN 'provider' ELSE 'model' END,
	provider_id,
	model_id,
	reason,
	disabled_by,
	COALESCE(disabled_at, datetime('now'))
FROM admin_model_overrides;
INSERT INTO provider_access_policy (
	id, school_id, rule_type, target, provider_id, model_id, reason, disabled_by, disabled_at
)
SELECT
	'mig-allow-' || pc.school_id || '-' || je.value,
	pc.school_id,
	'allow',
	'provider',
	je.value,
	NULL,
	'potluck allowed_providers',
	NULL,
	COALESCE(pc.updated_at, datetime('now'))
FROM potluck_config pc, json_each(pc.allowed_providers) je;
`
	},
	{
		id: '006_drop_source_tables',
		name: 'drop user_credentials, user_model_visibility, admin_model_overrides, potluck_donations; drop allowed_providers column from potluck_config',
		upSql: `
DROP TABLE IF EXISTS user_credentials;
DROP TABLE IF EXISTS user_model_visibility;
DROP TABLE IF EXISTS admin_model_overrides;
DROP TABLE IF EXISTS potluck_donations;
CREATE TABLE potluck_config_new (
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
INSERT INTO potluck_config_new (
	school_id, enabled, donor_roles, consumer_roles,
	per_user_daily_token_cap, per_user_daily_request_cap,
	per_provider_daily_token_cap, audit_retention_days,
	tos_version, updated_by, updated_at
)
SELECT
	school_id, enabled, donor_roles, consumer_roles,
	per_user_daily_token_cap, per_user_daily_request_cap,
	per_provider_daily_token_cap, audit_retention_days,
	tos_version, updated_by, updated_at
FROM potluck_config;
DROP TABLE potluck_config;
ALTER TABLE potluck_config_new RENAME TO potluck_config;
`
	},
	{
		id: '007_colon_id_normalize',
		name: 'normalize remaining colon-format model_ids to slash format',
		upSql: `
UPDATE encrypted_credentials
   SET model_id = replace(model_id, ':', '/')
 WHERE model_id LIKE '%:%'
   AND model_id NOT LIKE '%/%';

UPDATE model_visibility
   SET model_id = replace(model_id, ':', '/')
 WHERE model_id LIKE '%:%'
   AND model_id NOT LIKE '%/%';

UPDATE provider_access_policy
   SET model_id = replace(model_id, ':', '/')
 WHERE model_id LIKE '%:%'
   AND model_id NOT LIKE '%/%';
`
	}
] as const;
