/**
 * App-level Mastra schema — EdApex
 *
 * Owns the application's Drizzle-typed tables on libSQL. Mastra framework
 * tables (mastra_threads, mastra_messages, etc.) are owned separately by
 * LibSQLStore in storage.ts and live in the same physical file with the
 * `mastra_` prefix.
 */
import { sqliteTable, text, integer, unique } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

/**
 * Sovereign User Credentials Table
 *
 * Stores user-specific provider credentials keyed by `ProviderId` (branded string).
 * Supports three credential sources:
 * - 'env'         — resolved at request time from process env
 * - 'credential' — encrypted API key stored in `encryptedData.apiKey`
 * - 'custom'      — full custom provider config (baseUrl, apiKey, models, headers)
 */
export const userCredentials = sqliteTable('user_credentials', {
	id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
	userId: integer('user_id').notNull(),
	providerId: text('provider_id').notNull(),
	credentialType: text('credential_type').notNull(), // 'env' | 'credential' | 'custom'
	encryptedData: text('encrypted_data'),
	priority: integer('priority').notNull().default(1),
	enabled: integer('enabled').notNull().default(1),
	createdAt: text('created_at').notNull().default(sql`(datetime('now'))`),
	updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`),
	// Snapshot of models discovered by calling the provider's /models endpoint
	// at connect time. Encrypted JSON of ModelInfo[]. Falls back to
	// BUILTIN_MODELS filtered by providerId when this is null.
	discoveredModels: text('discovered_models'),
	discoveredAt: text('discovered_at')
}, (table) => ({
	unq: unique().on(table.userId, table.providerId)
}));

/**
 * Per-user model visibility (Settings → Models tab toggles).
 */
export const userModelVisibility = sqliteTable('user_model_visibility', {
	id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
	userId: integer('user_id').notNull(),
	modelId: text('model_id').notNull(),
	visible: integer('visible').notNull().default(1),
	updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`)
}, (table) => ({
	unq: unique().on(table.userId, table.modelId)
}));

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

export type UserCredential = typeof userCredentials.$inferSelect;
export type UserModelVisibility = typeof userModelVisibility.$inferSelect;
export type AgentSetting = typeof agentSettings.$inferSelect;
export type RateLimitStateRow = typeof rateLimitState.$inferSelect;
export type MastraRun = typeof mastraRuns.$inferSelect;
export type MastraRunStep = typeof mastraRunSteps.$inferSelect;
