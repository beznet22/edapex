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
import { unique, sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";

import { users, tenants } from "./domain-core";
import { generateId } from "../utils/id";

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

// --- AI Token Stats Type ---

export type TokenStats = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  cachedTokens?: number;
  costCents?: number;
};

export const aiSessions = sqliteTable("ai_sessions", {
  id: text("id", { length: 255 })
    .primaryKey()
    .$defaultFn(() => generateId()),
  tenantId: text("tenant_id")
    .notNull()
    .references(() => tenants.id),
  userId: text("user_id")
    .notNull()
    .references(() => users.id),
  parentSessionId: text("parent_session_id", { length: 255 }), // Lineage
  title: text("title", { length: 255 }).notNull().default("New Session"),
  model: text("model", { length: 100 }),
  visibility: text("visibility", { enum: ["private", "public"] }).default("private"),
  summary: text("summary"), // [HIGH-FIDELITY] Dual-stage summarized context
  tokenStats: text("token_stats", { mode: "json" }).$type<TokenStats>(), // Dialect-agnostic token tracking
  isCompressed: integer("is_compressed", { mode: "boolean" }).default(false), // Compaction flag
  metadata: text("metadata", { mode: "json" }).$type<ChatMetadata>(),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
});

export const aiMessages = sqliteTable(
  "ai_messages",
  {
    id: text("id", { length: 255 })
      .primaryKey()
      .$defaultFn(() => generateId()),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    sessionId: text("session_id", { length: 255 })
      .notNull()
      .references(() => aiSessions.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["user", "assistant", "system", "tool"] }).notNull(),
    parts: text("parts", { mode: "json" }).$type<MessagePart[]>().notNull(),
    cacheBreakpoint: integer("cache_breakpoint", { mode: "boolean" }).default(false), // [HIGH-FIDELITY] Anthropic-style cache control
    toolCallId: text("tool_call_id", { length: 255 }), // [HIGH-FIDELITY] Correlation ID for tool_call/tool_result pairs
    metadata: text("metadata", { mode: "json" }).$type<MessageMetadata>(),
    createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
  },
  (table) => ({
    tenantIdx: index("msg_tenant_idx").on(table.tenantId),
    sessionIdx: index("msg_session_idx").on(table.tenantId, table.sessionId),
  }),
);

export const aiVotes = sqliteTable(
  "ai_votes",
  {
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    sessionId: text("session_id", { length: 255 })
      .notNull()
      .references(() => aiSessions.id, { onDelete: "cascade" }),
    messageId: text("message_id", { length: 255 })
      .notNull()
      .references(() => aiMessages.id, { onDelete: "cascade" }),
    isUpvoted: integer("is_upvoted").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
  },
  (table) => ({
    pk: index("pk").on(table.tenantId, table.sessionId, table.messageId),
  }),
);

export const aiDocuments = sqliteTable(
  "ai_documents",
  {
    id: text("id", { length: 255 })
      .primaryKey()
      .$defaultFn(() => generateId()),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    title: text("title", { length: 255 }).notNull(),
    kind: text("kind", { enum: ["text", "code", "image", "sheet"] }).notNull(),
    content: text("content"),
    createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
  },
  (table) => ({
    tenantIdx: index("doc_tenant_idx").on(table.tenantId),
  }),
);

export const aiSuggestions = sqliteTable(
  "ai_suggestions",
  {
    id: text("id", { length: 255 })
      .primaryKey()
      .$defaultFn(() => generateId()),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    documentId: text("document_id", { length: 255 })
      .notNull()
      .references(() => aiDocuments.id, { onDelete: "cascade" }),
    content: text("content"),
    createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
    documentCreatedAt: integer("document_created_at", { mode: "timestamp" }),
    updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
  },
  (table) => ({
    tenantDocIdx: index("sug_tenant_doc_idx").on(table.tenantId, table.documentId),
  }),
);

// --- AGENTIC INFRASTRUCTURE ---

export const aiAgents = sqliteTable(
  "ai_agents",
  {
    id: text("id", { length: 255 })
      .primaryKey()
      .$defaultFn(() => generateId()),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    name: text("name", { length: 100 }).notNull(),
    agentType: text("agent_type", { length: 50 }).notNull(),
    capabilities: text("capabilities", { mode: "json" }).$type<string[]>(),
    status: text("status", { enum: ["active", "inactive", "maintenance"] }).default("active"),
    config: text("config", { mode: "json" }).$type<Record<string, any>>(),
    createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
  },
  (table) => ({
    tenantTypeIdx: index("agent_tenant_type_idx").on(table.tenantId, table.agentType),
  }),
);

export const aiAgentActions = sqliteTable(
  "ai_agent_actions",
  {
    id: text("id", { length: 255 })
      .primaryKey()
      .$defaultFn(() => generateId()),
    agentId: text("agent_id")
      .notNull()
      .references(() => aiAgents.id),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
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
  },
  (table) => ({
    agentStatusIdx: index("act_agent_status_idx").on(table.tenantId, table.agentId, table.status),
    idempotencyIdx: index("act_idempotency_idx").on(table.tenantId, table.idempotencyKey),
  }),
);

export const aiToolInvocations = sqliteTable(
  "ai_tool_invocations",
  {
    id: text("id", { length: 255 })
      .primaryKey()
      .$defaultFn(() => generateId()),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    actionId: text("action_id")
      .notNull()
      .references(() => aiAgentActions.id, { onDelete: "cascade" }),
    toolName: text("tool_name", { length: 100 }).notNull(),
    parameters: text("parameters", { mode: "json" }).$type<Record<string, any>>(),
    result: text("result", { mode: "json" }).$type<Record<string, any>>(),
    latencyMs: integer("latency_ms"),
    createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
  },
  (table) => ({
    tenantActionIdx: index("tool_tenant_action_idx").on(table.tenantId, table.actionId),
  }),
);

// --- RECURSIVE STRATEGY & TASKS ---

export const aiGoals = sqliteTable(
  "ai_goals",
  {
    id: text("id", { length: 255 })
      .primaryKey()
      .$defaultFn(() => generateId()),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    title: text("title", { length: 255 }).notNull(),
    description: text("description"),
    level: text("level", { enum: ["institution", "department", "agent", "task"] }).notNull(),
    parentId: text("parent_id", { length: 255 }).references((): any => aiGoals.id),
    ownerAgentId: text("owner_agent_id", { length: 255 }).references(() => aiAgents.id),
    status: text("status", { enum: ["planned", "active", "achieved", "cancelled"] }).default("planned"),
    academicYearId: text("academic_year_id", { length: 255 }), // Placeholder FK
    createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
  },
  (table) => ({
    tenantIdx: index("goal_tenant_idx").on(table.tenantId),
  }),
);

// --- USAGE JSON TYPE ---

export type TaskUsageJson = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  latencyMs?: number;
  costCents?: number;
  provider?: string;
  model?: string;
};

export const aiTasks = sqliteTable(
  "ai_tasks",
  {
    id: text("id", { length: 255 })
      .primaryKey()
      .$defaultFn(() => generateId()),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    sessionId: text("session_id", { length: 255 }).references(() => aiSessions.id), // [CONTROL PLANE] Lineage to Session
    projectId: text("project_id", { length: 255 }),
    goalId: text("goal_id", { length: 255 }).references(() => aiGoals.id),
    parentId: text("parent_id", { length: 255 }).references((): any => aiTasks.id),
    title: text("title", { length: 255 }).notNull(),
    description: text("description"),
    status: text("status", {
      enum: ["backlog", "todo", "in_progress", "in_review", "done", "blocked", "cancelled"],
    }).default("todo"),
    invocationType: text("invocation_type", { enum: ["scheduler", "manual", "event"] }).default("manual"), // [CONTROL PLANE]
    priority: text("priority", { enum: ["critical", "high", "medium", "low"] }).default("medium"),
    assigneeAgentId: text("assignee_agent_id", { length: 255 }).references(() => aiAgents.id),
    createdByAgentId: text("created_by_agent_id", { length: 255 }).references(() => aiAgents.id),
    createdByUserId: text("created_by_user_id", { length: 255 }).references(() => users.id),
    billingCode: text("billing_code", { length: 100 }),
    usageJson: text("usage_json", { mode: "json" }).$type<TaskUsageJson>(), // [CONTROL PLANE] Tokens/Cost
    logRef: text("log_ref", { length: 500 }), // [CONTROL PLANE] Pointer to 8-layer forensic trace
    errorCode: text("error_code", { length: 100 }), // [CONTROL PLANE] Diagnostic ID
    exitCode: text("exit_code", { length: 50 }), // [CONTROL PLANE] Process exit code
    startedAt: integer("started_at", { mode: "timestamp" }),
    completedAt: integer("completed_at", { mode: "timestamp" }),
    cancelledAt: integer("cancelled_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
  },
  (table) => ({
    tenantIdx: index("task_tenant_idx").on(table.tenantId),
    assigneeIdx: index("task_assignee_idx").on(table.tenantId, table.assigneeAgentId, table.status),
    sessionIdx: index("task_session_idx").on(table.tenantId, table.sessionId),
  }),
);

export const aiApprovals = sqliteTable(
  "ai_approvals",
  {
    id: text("id", { length: 255 })
      .primaryKey()
      .$defaultFn(() => generateId()),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    type: text("type", { enum: ["hire_agent", "approve_strategy", "budget_override"] }).notNull(),
    requestedByAgentId: text("requested_by_agent_id", { length: 255 }).references(() => aiAgents.id),
    requestedByUserId: text("requested_by_user_id", { length: 255 }).references(() => users.id),
    status: text("status", { enum: ["pending", "approved", "rejected", "cancelled"] }).default("pending"),
    payload: text("payload", { mode: "json" }).$type<Record<string, any>>().notNull(),
    decisionNote: text("decision_note"),
    decidedByUserId: text("decided_by_user_id", { length: 255 }).references(() => users.id),
    decidedAt: integer("decided_at", { mode: "timestamp" }),
    createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
    updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
  },
  (table) => ({
    tenantIdx: index("appr_tenant_idx").on(table.tenantId, table.status),
  }),
);

export const aiCostEvents = sqliteTable(
  "ai_cost_events",
  {
    id: text("id", { length: 255 })
      .primaryKey()
      .$defaultFn(() => generateId()),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    agentId: text("agent_id")
      .notNull()
      .references(() => aiAgents.id),
    taskId: text("task_id", { length: 255 }).references(() => aiTasks.id),
    projectId: text("project_id", { length: 255 }),
    goalId: text("goal_id", { length: 255 }).references(() => aiGoals.id),
    billingCode: text("billing_code", { length: 100 }),
    provider: text("provider", { length: 100 }).notNull(),
    model: text("model", { length: 100 }).notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    costCents: integer("cost_cents").notNull(),
    occurredAt: integer("occurred_at", { mode: "timestamp" }).notNull(),
  },
  (table) => ({
    tenantTimeIdx: index("cost_tenant_time_idx").on(table.tenantId, table.occurredAt),
  }),
);

export const aiActivityLogs = sqliteTable(
  "ai_activity_logs",
  {
    id: text("id", { length: 255 })
      .primaryKey()
      .$defaultFn(() => generateId()),
    tenantId: text("tenant_id")
      .notNull()
      .references(() => tenants.id),
    actorType: text("actor_type", { enum: ["agent", "user", "system"] }).notNull(),
    actorId: text("actor_id", { length: 255 }).notNull(),
    action: text("action", { length: 255 }).notNull(),
    entityType: text("entity_type", { length: 100 }).notNull(),
    entityId: text("entity_id", { length: 255 }).notNull(),
    details: text("details", { mode: "json" }).$type<Record<string, any>>(),
    createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  },
  (table) => ({
    tenantTimeIdx: index("log_tenant_time_idx").on(table.tenantId, table.createdAt),
  }),
);
