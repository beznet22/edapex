/**
 * ARCHITECTURE OVERVIEW: AI Integration Domain
 * 
 * Purpose:
 * Manages the context windows, token billing, and historical conversational trees of AI 
 * assistant integrations directly on the relational plane for tight data security, tying 
 * `chat_id` and `message_id` sequentially, enforcing tenant and user isolation implicitly.
 * 
 * Replaces Legacy Tables:
 * - Unifies external disparate ML scripts and custom scripts (No legacy table equivalents).
 */
import { pgSchema, text, doublePrecision, integer, uuid, numeric, smallint, timestamp, jsonb, boolean, date, varchar, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { users, tenants } from "./domain-core";

// --- CORE CHAT INFRASTRUCTURE ---

// --- AI METADATA TYPES ---

export type ChatMetadata = {
  summary?: string;
  tags?: string[];
  lastMessagePreview?: string;
};

export type MessageMetadata = {
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  modelName?: string;
  latencyMs?: number;
};

export type MessagePart = Record<string, any>;
export const aiSchema = pgSchema("domain_ai");


export const aiSessions = aiSchema.table("ai_sessions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`), 
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  parentSessionId: uuid("parent_session_id"), // Lineage
  title: varchar("title", { length: 255 }).notNull().default("New Session"),
  model: varchar("model", { length: 100 }),
  visibility: varchar("visibility", { length: 150 }).default("private"),
  metadata: jsonb("metadata").$type<ChatMetadata>(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const aiMessages = aiSchema.table("ai_messages", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  sessionId: uuid("session_id").notNull().references(() => aiSessions.id, { onDelete: "cascade" }),
  role: varchar("role", { length: 150 }).notNull(),
  parts: jsonb("parts").$type<MessagePart[]>().notNull(),
  metadata: jsonb("metadata").$type<MessageMetadata>(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  tenantIdx: index("msg_tenant_idx").on(table.tenantId),
  sessionIdx: index("msg_session_idx").on(table.tenantId, table.sessionId),
}));

export const aiVotes = aiSchema.table("ai_votes", {
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  sessionId: uuid("session_id").notNull().references(() => aiSessions.id, { onDelete: "cascade" }),
  messageId: uuid("message_id").notNull().references(() => aiMessages.id, { onDelete: "cascade" }),
  isUpvoted: smallint("is_upvoted").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  pk: index("pk").on(table.tenantId, table.sessionId, table.messageId),
}));

export const aiDocuments = aiSchema.table("ai_documents", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  title: varchar("title", { length: 255 }).notNull(),
  kind: varchar("kind", { length: 150 }).notNull(),
  content: text("content"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  tenantIdx: index("doc_tenant_idx").on(table.tenantId),
}));

export const aiSuggestions = aiSchema.table("ai_suggestions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  documentId: uuid("document_id").notNull().references(() => aiDocuments.id, { onDelete: "cascade" }),
  content: text("content"),
  createdAt: timestamp("created_at").defaultNow(),
  documentCreatedAt: timestamp("document_created_at"),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  tenantDocIdx: index("sug_tenant_doc_idx").on(table.tenantId, table.documentId),
}));

// --- AGENTIC INFRASTRUCTURE ---

export const aiAgents = aiSchema.table("ai_agents", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  name: varchar("name", { length: 100 }).notNull(),
  agentType: varchar("agent_type", { length: 50 }).notNull(),
  capabilities: jsonb("capabilities").$type<string[]>(),
  status: varchar("status", { length: 150 }).default("active"),
  config: jsonb("config").$type<Record<string, any>>(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  tenantTypeIdx: index("agent_tenant_type_idx").on(table.tenantId, table.agentType),
}));

export const aiAgentActions = aiSchema.table("ai_agent_actions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  agentId: uuid("agent_id").notNull().references(() => aiAgents.id),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  actionType: varchar("action_type", { length: 100 }).notNull(),
  idempotencyKey: varchar("idempotency_key", { length: 100 }),
  status: varchar("status", { length: 150 }).notNull(),
  input: jsonb("input").$type<Record<string, any>>(),
  output: jsonb("output").$type<Record<string, any>>(),
  errorMessage: text("error_message"),
  durationMs: integer("duration_ms"),
  createdAt: timestamp("created_at").defaultNow(),
  completedAt: timestamp("completed_at"),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  agentStatusIdx: index("act_agent_status_idx").on(table.agentId, table.status),
  idempotencyIdx: index("act_idempotency_idx").on(table.tenantId, table.idempotencyKey),
}));

export const aiToolInvocations = aiSchema.table("ai_tool_invocations", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  actionId: uuid("action_id").notNull().references(() => aiAgentActions.id, { onDelete: "cascade" }),
  toolName: varchar("tool_name", { length: 100 }).notNull(),
  parameters: jsonb("parameters").$type<Record<string, any>>(),
  result: jsonb("result").$type<Record<string, any>>(),
  latencyMs: integer("latency_ms"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  tenantActionIdx: index("tool_tenant_action_idx").on(table.tenantId, table.actionId),
}));

// --- RECURSIVE STRATEGY & TASKS ---

export const aiGoals = aiSchema.table("ai_goals", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  level: varchar("level", { length: 50 }).notNull(), // institution, department, agent, task
  parentId: uuid("parent_id").references((): any => aiGoals.id),
  ownerAgentId: uuid("owner_agent_id").references(() => aiAgents.id),
  status: varchar("status", { length: 50 }).default("planned"),
  academicYearId: uuid("academic_year_id"), 
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  tenantIdx: index("goal_tenant_idx").on(table.tenantId),
}));

export const aiTasks = aiSchema.table("ai_tasks", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  projectId: uuid("project_id"),
  goalId: uuid("goal_id").references(() => aiGoals.id),
  parentId: uuid("parent_id").references((): any => aiTasks.id),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  status: varchar("status", { length: 50 }).default("todo"),
  priority: varchar("priority", { length: 50 }).default("medium"),
  assigneeAgentId: uuid("assignee_agent_id").references(() => aiAgents.id),
  createdByAgentId: uuid("created_by_agent_id").references(() => aiAgents.id),
  createdByUserId: uuid("created_by_user_id").references(() => users.id),
  billingCode: varchar("billing_code", { length: 100 }),
  startedAt: timestamp("started_at"),
  completedAt: timestamp("completed_at"),
  cancelledAt: timestamp("cancelled_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  tenantIdx: index("task_tenant_idx").on(table.tenantId),
  assigneeIdx: index("task_assignee_idx").on(table.tenantId, table.assigneeAgentId, table.status),
}));

export const aiApprovals = aiSchema.table("ai_approvals", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  type: varchar("type", { length: 100 }).notNull(),
  requestedByAgentId: uuid("requested_by_agent_id").references(() => aiAgents.id),
  requestedByUserId: uuid("requested_by_user_id").references(() => users.id),
  status: varchar("status", { length: 50 }).default("pending"),
  payload: jsonb("payload").notNull(),
  decisionNote: text("decision_note"),
  decidedByUserId: uuid("decided_by_user_id").references(() => users.id),
  decidedAt: timestamp("decided_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  tenantIdx: index("appr_tenant_idx").on(table.tenantId, table.status),
}));

export const aiCostEvents = aiSchema.table("ai_cost_events", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  agentId: uuid("agent_id").notNull().references(() => aiAgents.id),
  taskId: uuid("task_id").references(() => aiTasks.id),
  projectId: uuid("project_id"),
  goalId: uuid("goal_id").references(() => aiGoals.id),
  billingCode: varchar("billing_code", { length: 100 }),
  provider: varchar("provider", { length: 100 }).notNull(),
  model: varchar("model", { length: 100 }).notNull(),
  inputTokens: integer("input_tokens").notNull().default(0),
  outputTokens: integer("output_tokens").notNull().default(0),
  costCents: integer("cost_cents").notNull(),
  occurredAt: timestamp("occurred_at").notNull(),
}, (table) => ({
  tenantTimeIdx: index("cost_tenant_time_idx").on(table.tenantId, table.occurredAt),
}));

export const aiActivityLogs = aiSchema.table("ai_activity_logs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  actorType: varchar("actor_type", { length: 50 }).notNull(),
  actorId: varchar("actor_id", { length: 255 }).notNull(),
  action: varchar("action", { length: 255 }).notNull(),
  entityType: varchar("entity_type", { length: 100 }).notNull(),
  entityId: varchar("entity_id", { length: 255 }).notNull(),
  details: jsonb("details"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  tenantTimeIdx: index("log_tenant_time_idx").on(table.tenantId, table.createdAt),
}));
