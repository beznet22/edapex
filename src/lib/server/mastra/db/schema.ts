import { sqliteTable, text, integer, unique } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

/**
 * AI Provider Credentials Table
 * 
 * Stores user-specific API keys and custom base URLs.
 * Strict multi-tenant isolation via userId.
 */
export const providerCredentials = sqliteTable('provider_credentials', {
	id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
	userId: integer('user_id').notNull(),
	provider: text('provider').notNull(), // 'anthropic' | 'openai' | 'deepseek' | 'groq'
	apiKeyEncrypted: text('api_key_encrypted'),
	baseUrl: text('base_url').notNull().default(''),
	priority: integer('priority').notNull().default(1),
	enabled: integer('enabled').notNull().default(1),
	updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`)
}, (table) => ({
	unq: unique().on(table.userId, table.provider)
}));

/**
 * Agent Routing Table
 * 
 * Maps agent roles (Supervisor, Assistant, Default) to specific models.
 */
export const agentRouting = sqliteTable('agent_routing', {
	id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
	userId: integer('user_id').notNull(),
	role: text('role').notNull(), // 'supervisor' | 'assistant' | 'default'
	provider: text('provider').notNull(),
	model: text('model').notNull(),
	updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`)
}, (table) => ({
	unq: unique().on(table.userId, table.role)
}));

/**
 * Agent Settings Table
 * 
 * User-level preferences for the AI experience.
 */
export const agentSettings = sqliteTable('agent_settings', {
	userId: integer('user_id').primaryKey(),
	profile: text('profile').notNull().default('balanced'), // 'strong' | 'balanced' | 'simple'
	globalToolsEnabled: integer('global_tools_enabled').notNull().default(1),
	updatedAt: text('updated_at').notNull().default(sql`(datetime('now'))`)
});

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

export type ProviderCredential = typeof providerCredentials.$inferSelect;
export type AgentRoute = typeof agentRouting.$inferSelect;
export type AgentSetting = typeof agentSettings.$inferSelect;
export type MastraRun = typeof mastraRuns.$inferSelect;
export type MastraRunStep = typeof mastraRunSteps.$inferSelect;
