/**
 * Bootstrap migration 001_init — creates the _MIGRATIONS tracking table.
 *
 * This is the only migration the runner handles specially: it runs before
 * pending-detection logic, on every cold start, because _MIGRATIONS is the
 * very thing pending detection reads. After it applies (idempotently via
 * CREATE TABLE IF NOT EXISTS) the runner records `001_init` as applied and
 * proceeds with the registry below.
 */
export const MIGRATION_001_INIT_SQL = `
CREATE TABLE IF NOT EXISTS _MIGRATIONS (
	id TEXT PRIMARY KEY,
	name TEXT NOT NULL,
	applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

export const BOOTSTRAP_MIGRATION_ID = '001_init';
export const BOOTSTRAP_MIGRATION_NAME = 'create migrations tracking table';
