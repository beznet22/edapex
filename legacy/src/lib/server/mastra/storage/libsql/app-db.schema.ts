/**
 * App-level Mastra schema — EdApex
 *
 * Owns the application's Drizzle-typed tables on libSQL. Mastra framework
 * tables (mastra_threads, mastra_messages, etc.) are owned separately by
 * LibSQLStore in storage.ts and live in the same physical file with the
 * `mastra_` prefix.
 */
import { sqliteTable, text, integer, unique, primaryKey } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

/**
 * Unified Encrypted Credentials Table (Phase 2)
 *
 * Consolidates `user_credentials` + `potluck_donations` into one table. The
 * `scope` column ('user' | 'school') + `credential_kind` column ('personal' |
 * 'donation' | 'custom') act as a discriminated union:
 *
 * - scope='user'    + credential_kind='personal'  ← personal API key donated by a user
 * - scope='user'    + credential_kind='custom'    ← user-defined provider config
 * - scope='school'  + credential_kind='donation'  ← pot-luck pool donation
 *
 * A CHECK constraint (created by migration 002_create_unified_tables) enforces
 * that user-scope rows have a non-null user_id and null school_id, and vice
 * versa for school-scope rows.
 */
export const encryptedCredentials = sqliteTable(
	'encrypted_credentials',
	{
		id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
		scope: text('scope').notNull().$type<'user' | 'school'>(),
		credentialKind: text('credential_kind').notNull().$type<'personal' | 'donation' | 'custom'>(),
		userId: integer('user_id'),
		schoolId: integer('school_id'),
		providerId: text('provider_id').notNull(),
		encryptedData: text('encrypted_data').notNull(),
		priority: integer('priority').notNull().default(1),
		enabled: integer('enabled').notNull().default(1),
		discoveredModels: text('discovered_models'),
		discoveredAt: text('discovered_at'),
		createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
		updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`)
	},
	(table) => ({
		unqUserPersonal: unique().on(table.scope, table.credentialKind, table.userId, table.providerId)
	})
);

/**
 * Unified Model Visibility Table (Phase 2)
 *
 * Consolidates `user_model_visibility` (per-user toggles) + the per-model rows
 * of `admin_model_overrides` (school-wide allow rules). The `scope` column
 * ('user' | 'school') selects which entity the visibility decision belongs to.
 *
 * School-scope rows win on conflict (handled in resolver.ts: a school-visible
 * model is visible to every user in the school regardless of their personal
 * toggle state).
 */
export const modelVisibility = sqliteTable(
	'model_visibility',
	{
		id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
		scope: text('scope').notNull().$type<'user' | 'school'>(),
		userId: integer('user_id'),
		schoolId: integer('school_id'),
		modelId: text('model_id').notNull(),
		visible: integer('visible').notNull().default(1),
		updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`)
	},
	(table) => ({
		unq: unique().on(table.scope, table.userId, table.schoolId, table.modelId)
	})
);

/**
 * Unified Provider Access Policy Table (Phase 2)
 *
 * Consolidates `admin_model_overrides` (deny rules) + the per-provider rows of
 * `potluck_config.allowed_providers` (allow rules) into one allow/deny table
 * scoped to (school_id, target, provider_id, model_id).
 *
 * - target='provider' disables/allows an entire provider (model_id NULL).
 * - target='model' disables/allows a specific model (model_id NOT NULL).
 *
 * rule_type='deny' is the migration source for `admin_model_overrides`;
 * rule_type='allow' is the migration source for `potluck_config.allowed_providers`.
 */
export const providerAccessPolicy = sqliteTable(
	'provider_access_policy',
	{
		id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
		schoolId: integer('school_id').notNull(),
		ruleType: text('rule_type').notNull().$type<'allow' | 'deny'>(),
		target: text('target').notNull().$type<'provider' | 'model'>(),
		providerId: text('provider_id').notNull(),
		modelId: text('model_id'),
		reason: text('reason'),
		disabledBy: integer('disabled_by'),
		disabledAt: text('disabled_at').notNull().default(sql`(datetime('now'))`)
	},
	(table) => ({
		unq: unique().on(table.schoolId, table.ruleType, table.target, table.providerId, table.modelId)
	})
);


/**
 * Agent Settings Table
 *
 * User-level preferences for the AI experience.
 */
export const agentSettings = sqliteTable('agent_settings', {
	userId: integer('user_id').primaryKey(),
	globalToolsEnabled: integer('global_tools_enabled').notNull().default(1),
	updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`)
});

/**
 * Per-user, per-provider rate limit snapshot.
 *
 * Persists the most recent rate limit state we observed from upstream
 * response headers (`x-ratelimit-*`, `retry-after`). Used for cross-session
 * usage display and proactive warnings.
 */
export const rateLimitState = sqliteTable('rate_limit_state', {
	id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
	userId: integer('user_id').notNull(),
	providerId: text('provider_id').notNull(),
	modelId: text('model_id'),
	window: text('window').notNull(), // 'requests_per_minute' | 'tokens_per_minute' | ...
	limitValue: integer('limit_value'),
	remaining: integer('remaining'),
	resetAt: text('reset_at').notNull(),
	recordedAt: text('recorded_at').notNull().default(sql`(datetime('now'))`)
}, (table) => ({
	unq: unique().on(table.userId, table.providerId, table.modelId, table.window)
}));

/**
 * Mastra Workflow Runs Table
 *
 * Denormalized run-level records for tenant-scoped workflow observability.
 * Verified: no native Mastra API for per-tenant run history queries as of @mastra/core —
 * Mastra's WorkflowsStorage stores run snapshots but lacks tenant-scoped filtering
 * (schoolId, classId, sectionId) and step-level querying.
 */
export const mastraRuns = sqliteTable('mastra_runs', {
	id: text('id').primaryKey(), // workflow run ID (e.g., wf_extract_1234_5_6)
	workflowId: text('workflow_id').notNull(), // 'document-extraction' | 'validation' | 'publish'
	schoolId: integer('school_id').notNull(),
	classId: integer('class_id'),
	sectionId: integer('section_id'),
	userId: integer('user_id').notNull(),
	status: text('status').notNull(), // 'running' | 'suspended' | 'completed' | 'failed'
	startedAt: text('started_at').notNull().default(sql`(datetime('now'))`),
	completedAt: text('completed_at'),
	totalSteps: integer('total_steps').notNull().default(0),
	completedSteps: integer('completed_steps').notNull().default(0),
	failedSteps: integer('failed_steps').notNull().default(0),
	durationMs: integer('duration_ms'),
	error: text('error') // JSON string of last error
});

/**
 * Mastra Workflow Run Steps Table
 *
 * Per-step execution records for detailed observability and debugging.
 * Foreign key references mastra_runs.id for relational queries.
 */
export const mastraRunSteps = sqliteTable('mastra_run_steps', {
	id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
	runId: text('run_id').notNull().references(() => mastraRuns.id),
	stepName: text('step_name').notNull(),
	stepIndex: integer('step_index').notNull(),
	status: text('status').notNull(), // 'running' | 'completed' | 'failed'
	inputPayload: text('input_payload'), // JSON, truncated to 10KB on read
	outputPayload: text('output_payload'), // JSON, truncated to 10KB on read
	error: text('error'), // error message
	stackTrace: text('stack_trace'), // truncated to 5KB on read
	durationMs: integer('duration_ms'),
	createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

/**
 * Pot-Luck Configuration Table
 *
 * School-scoped settings for the shared-API-key pool. One row per schoolId
 * (PRIMARY KEY). Read at request time by the 4-tier router (tier 2) and
 * edited by admins via the PlatformTab Pot-Luck Configuration section.
 */
export const potluckConfig = sqliteTable('potluck_config', {
	schoolId: integer('school_id').primaryKey(),
	enabled: integer('enabled').notNull().default(0),
	// Roles allowed to donate to the pool (JSON array of strings, e.g. ["teacher","admin"]).
	donorRoles: text('donor_roles').notNull().default('[]'),
	// Roles allowed to consume from the pool.
	consumerRoles: text('consumer_roles').notNull().default('[]'),
	// Providers eligible for the pool (empty array = all enabled providers allowed).
	allowedProviders: text('allowed_providers').notNull().default('[]'),
	perUserDailyTokenCap: integer('per_user_daily_token_cap').notNull().default(0),
	perUserDailyRequestCap: integer('per_user_daily_request_cap').notNull().default(0),
	// null means no provider-level cap.
	perProviderDailyTokenCap: integer('per_provider_daily_token_cap'),
	auditRetentionDays: integer('audit_retention_days').notNull().default(90),
	tosVersion: text('tos_version'),
	updatedBy: integer('updated_by').notNull().default(1),
	updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`)
});

/**
 * Parent Auth Codes Table
 *
 * One-time class-level shared codes for the /connect flow. A teacher generates
 * a 6-digit code for their class; any parent whose child is in that class can
 * use it to link their Telegram account. Codes expire after 7 days.
 * The raw 6-digit code is shown to the teacher once; only the bcrypt hash is
 * stored. Consumption tracking is unnecessary — the code is a class-level
 * shared secret, and telegram_parent_link provides the audit trail.
 */
export const parentAuthCodes = sqliteTable('parent_auth_codes', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  classId: integer('class_id').notNull(),
  codeHash: text('code_hash').notNull(),
  generatedBy: integer('generated_by').notNull(),
  expiresAt: text('expires_at').notNull(),
  createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

/**
 * Telegram Parent Link Table
 *
 * Maps a Telegram chat_id to a parent record with denormalized school contact
 * info and JSON-encoded child lists. Eliminates runtime joins to sm_parents,
 * sm_students, and sm_schools on every incoming Telegram message.
 */
export const telegramParentLink = sqliteTable('telegram_parent_link', {
	chatId: text('chat_id').primaryKey(), // Telegram chat_id stored as text
	parentId: integer('parent_id').notNull(), // logical FK to sm_parents.id
	userId: integer('user_id').notNull(), // sm_parents.user_id
	schoolId: integer('school_id').notNull(), // sm_parents.school_id
	schoolName: text('school_name'), // denormalized from sm_schools.school_name
	schoolPhone: text('school_phone'), // denormalized from sm_schools.phone
	schoolEmail: text('school_email'), // denormalized from sm_schools.email
	childIds: text('child_ids').notNull(), // JSON array of sm_students.id e.g. '[101,102]'
	childNames: text('child_names').notNull(), // JSON array of sm_students.full_name
	linkedAt: text('linked_at').notNull().default(sql`(datetime('now'))`), // when parent linked Telegram
});

/**
 * Connect Tokens Table
 *
 * One-time deep-link tokens for the /connect <token> flow. Token is looked up
 * directly (no parentId scan) and consumed atomically to prevent replay.
 */
export const connectTokens = sqliteTable('connect_tokens', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	parentId: integer('parent_id').notNull(),
	token: text('token').notNull().unique(), // random hex string, the lookup key
	expiresAt: text('expires_at').notNull(), // ISO 8601 datetime string
	usedAt: text('used_at'), // null until consumed; ISO 8601 datetime when set
	schoolId: integer('school_id').notNull().default(1),
	createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
});

export type AgentSetting = typeof agentSettings.$inferSelect;
export type RateLimitStateRow = typeof rateLimitState.$inferSelect;
export type MastraRun = typeof mastraRuns.$inferSelect;
export type MastraRunStep = typeof mastraRunSteps.$inferSelect;
export type TelegramParentLink = typeof telegramParentLink.$inferSelect;
export type ConnectToken = typeof connectTokens.$inferSelect;
export type PotluckConfig = typeof potluckConfig.$inferSelect;
export type EncryptedCredential = typeof encryptedCredentials.$inferSelect;
export type ModelVisibility = typeof modelVisibility.$inferSelect;
export type ProviderAccessPolicy = typeof providerAccessPolicy.$inferSelect;

/**
 * Platform Provider Discoveries
 *
 * School-scoped cache of `/models` responses for env-backed (platform)
 * providers. Populated lazily by `discoverPlatformProviderModels` and
 * read by `availability.ts` so platform provider models flow through the
 * same discovery pipeline as user-connected credentials.
 */
export const platformProviderDiscoveries = sqliteTable(
	'platform_provider_discoveries',
	{
		schoolId: integer('school_id').notNull(),
		providerId: text('provider_id').notNull(),
		models: text('models').notNull(),
		discoveredAt: text('discovered_at').notNull().default(sql`(datetime('now'))`)
	},
	(table) => ({
		pk: primaryKey({ columns: [table.schoolId, table.providerId] })
	})
);

export type PlatformProviderDiscovery = typeof platformProviderDiscoveries.$inferSelect;

/**
 * Token Usage Table
 *
 * Per-user daily token + request counters, one row per (userId, day, providerId).
 * Read at request time by the 4-tier router's tier-2 (pool) check: when
 * `potluck_config.perUserDailyTokenCap` is non-zero and today's sum exceeds
 * it, the pool tier short-circuits with `reason: 'quota_exceeded'`.
 *
 * `day` is a `YYYY-MM-DD` UTC string so the daily boundary is a single
 * string comparison — no timezone arithmetic, no `date(...)` gymnastics.
 * `tokens` and `requests` are upserted (`+=` semantics) on every chat turn
 * completion; the writer is the chat-pipeline completion hook in `chat.remote.ts`.
 */
export const tokenUsage = sqliteTable(
	'token_usage',
	{
		userId: integer('user_id').notNull(),
		day: text('day').notNull(), // 'YYYY-MM-DD' UTC
		providerId: text('provider_id').notNull(),
		tokens: integer('tokens').notNull().default(0),
		requests: integer('requests').notNull().default(0),
		updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`)
	},
	(table) => ({
		pk: primaryKey({ columns: [table.userId, table.day, table.providerId] })
	})
);

export type TokenUsage = typeof tokenUsage.$inferSelect;
