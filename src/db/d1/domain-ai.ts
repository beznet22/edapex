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
import { unique,  sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";

import { users, tenants } from "./domain-core";
import { generateId } from "../utils/id";

// --- CORE CHAT INFRASTRUCTURE ---

// --- AI METADATA TYPES ---

export type SessionMetadata = {
  summary?: string;
  tags?: string[];
  lastMessagePreview?: string;
  tokenStats?: {
    prompt: number;
    completion: number;
    total: number;
  };
};

export type MessageMetadata = {
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  modelName?: string;
  latencyMs?: number;
  cacheBreakpoint?: boolean;
  toolCallId?: string;
};

export type MessagePart = Record<string, any>;

export const aiSessions = sqliteTable("ai_sessions", {
  id: text("id", { length: 36 }).primaryKey(), 
  tenantId: text("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  userId: text("user_id", { length: 36 }).notNull().references(() => users.id),
  parentSessionId: text("parent_session_id", { length: 36 }), // Session lineage
  title: text("title", { length: 255 }).notNull().default("New Session"),
  model: text("model", { length: 100 }),
  visibility: text("visibility", { enum: ["private", "public"] }).default("private"),
  metadata: text("metadata", { mode: "json" }).$type<SessionMetadata>(),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
});

export const aiMessages = sqliteTable("ai_messages", {
  id: text("id", { length: 36 }).primaryKey(),
  tenantId: text("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  chatId: text("chat_id", { length: 36 }).notNull().references(() => aiSessions.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["user", "assistant", "system", "tool"] }).notNull(),
  parts: text("parts", { mode: "json" }).$type<MessagePart[]>().notNull(),
  metadata: text("metadata", { mode: "json" }).$type<MessageMetadata>(),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
}, (table) => ({
  tenantIdx: index("msg_tenant_idx").on(table.tenantId),
  chatIdx: index("msg_chat_idx").on(table.tenantId, table.chatId),
}));

export const aiVotes = sqliteTable("ai_votes", {
  tenantId: text("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  chatId: text("chat_id", { length: 36 }).notNull().references(() => aiSessions.id, { onDelete: "cascade" }),
  messageId: text("message_id", { length: 36 }).notNull().references(() => aiMessages.id, { onDelete: "cascade" }),
  isUpvoted: integer("is_upvoted").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
}, (table) => ({
  pk: index("pk").on(table.tenantId, table.chatId, table.messageId),
}));

export const aiDocuments = sqliteTable("ai_documents", {
  id: text("id", { length: 255 }).primaryKey().$defaultFn(() => generateId()),
  tenantId: text("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  title: text("title", { length: 255 }).notNull(),
  kind: text("kind", { enum: ["text", "code", "image", "sheet"] }).notNull(),
  content: text("content"),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
}, (table) => ({
  tenantIdx: index("doc_tenant_idx").on(table.tenantId),
}));

export const aiSuggestions = sqliteTable("ai_suggestions", {
  id: text("id", { length: 255 }).primaryKey().$defaultFn(() => generateId()),
  tenantId: text("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  documentId: text("document_id", { length: 255 }).notNull().references(() => aiDocuments.id, { onDelete: "cascade" }),
  content: text("content"),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  documentCreatedAt: integer("document_created_at", { mode: "timestamp" }),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
}, (table) => ({
  tenantDocIdx: index("sug_tenant_doc_idx").on(table.tenantId, table.documentId),
}));

// --- ORCHESTRATION & GOVERNANCE ---

export const aiTasks = sqliteTable("ai_tasks", {
  id: text("id", { length: 36 }).primaryKey(),
  tenantId: text("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  goalId: text("goal_id", { length: 36 }),
  sessionId: text("session_id", { length: 36 }).references(() => aiSessions.id),
  title: text("title", { length: 255 }).notNull(),
  description: text("description"),
  status: text("status", { enum: ["backlog", "todo", "in_progress", "completed", "failed", "cancelled", "blocked"] }).default("todo"),
  priority: integer("priority").default(0),
  assigneeAgentId: text("assignee_agent_id", { length: 36 }),
  input: text("input", { mode: "json" }),
  output: text("output", { mode: "json" }),
  error: text("error"),
  startedAt: integer("started_at", { mode: "timestamp" }),
  completedAt: integer("completed_at", { mode: "timestamp" }),
  cancelledAt: integer("cancelled_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
});

export const aiApprovals = sqliteTable("ai_approvals", {
  id: text("id", { length: 36 }).primaryKey(),
  tenantId: text("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  taskId: text("task_id", { length: 36 }).references(() => aiTasks.id),
  requesterAgentId: text("requester_agent_id", { length: 36 }),
  approverUserId: text("approver_user_id", { length: 36 }),
  requestType: text("request_type", { length: 100 }).notNull(),
  status: text("status", { enum: ["pending", "approved", "rejected", "escalated"] }).default("pending"),
  payload: text("payload", { mode: "json" }),
  decisionReason: text("decision_reason"),
  decidedAt: integer("decided_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().defaultNow(),
});

export const aiGoals = sqliteTable("ai_goals", {
  id: text("id", { length: 36 }).primaryKey(),
  tenantId: text("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  parentGoalId: text("parent_goal_id", { length: 36 }), // Recursive hierarchy
  title: text("title", { length: 255 }).notNull(),
  description: text("description"),
  category: text("category", { length: 100 }), // Institution, Department, Agent, Task
  status: text("status", { enum: ["active", "achieved", "abandoned"] }).default("active"),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
});

export const aiCostEvents = sqliteTable("ai_cost_events", {
  id: text("id", { length: 36 }).primaryKey(),
  tenantId: text("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  taskId: text("task_id", { length: 36 }).references(() => aiTasks.id),
  goalId: text("goal_id", { length: 36 }).references(() => aiGoals.id),
  provider: text("provider", { length: 100 }),
  model: text("model", { length: 100 }),
  tokensPrompt: integer("tokens_prompt"),
  tokensCompletion: integer("tokens_completion"),
  costUsd: real("cost_usd"),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
});

export const aiActivityLogs = sqliteTable("ai_activity_logs", {
  id: text("id", { length: 36 }).primaryKey(),
  tenantId: text("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  actorId: text("actor_id", { length: 100 }).notNull(), // Agent ID or User ID
  actorType: text("actor_type", { enum: ["agent", "user", "system"] }).notNull(),
  entityId: text("entity_id", { length: 36 }),
  entityType: text("entity_type", { length: 100 }),
  action: text("action", { length: 100 }).notNull(),
  metadata: text("metadata", { mode: "json" }),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
});

export const aiAgents = sqliteTable("ai_agents", {
  id: text("id", { length: 36 }).primaryKey(),
  tenantId: text("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  name: text("name", { length: 100 }).notNull(),
  agentType: text("agent_type", { length: 50 }).notNull(),
  capabilities: text("capabilities", { mode: "json" }).$type<string[]>(),
  status: text("status", { enum: ["active", "inactive", "maintenance"] }).default("active"),
  config: text("config", { mode: "json" }).$type<Record<string, any>>(),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
}, (table) => ({
  tenantTypeIdx: index("agent_tenant_type_idx").on(table.tenantId, table.agentType),
}));

export const aiAgentActions = sqliteTable("ai_agent_actions", {
  id: text("id", { length: 36 }).primaryKey(),
  agentId: text("agent_id", { length: 36 }).notNull().references(() => aiAgents.id),
  tenantId: text("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  actionType: text("action_type", { length: 100 }).notNull(),
  idempotencyKey: text("idempotency_key", { length: 100 }),
  status: text("status", { enum: ["pending", "running", "completed", "failed"] }).notNull(),
  input: text("input", { mode: "json" }).$type<Record<string, any>>(),
  output: text("output", { mode: "json" }).$type<Record<string, any>>(),
  errorMessage: text("error_message"),
  durationMs: integer("duration_ms"),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  completedAt: integer("completed_at", { mode: "timestamp" }),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
}, (table) => ({
  agentStatusIdx: index("act_agent_status_idx").on(table.tenantId, table.agentId, table.status),
  idempotencyIdx: index("act_idempotency_idx").on(table.tenantId, table.idempotencyKey),
}));

export const aiToolInvocations = sqliteTable("ai_tool_invocations", {
  id: text("id", { length: 36 }).primaryKey(),
  tenantId: text("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  actionId: text("action_id", { length: 36 }).notNull().references(() => aiAgentActions.id, { onDelete: "cascade" }),
  toolName: text("tool_name", { length: 100 }).notNull(),
  parameters: text("parameters", { mode: "json" }).$type<Record<string, any>>(),
  result: text("result", { mode: "json" }).$type<Record<string, any>>(),
  latencyMs: integer("latency_ms"),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
}, (table) => ({
  tenantActionIdx: index("tool_tenant_action_idx").on(table.tenantId, table.actionId),
}));
