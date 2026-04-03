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
import {
  mysqlTable,
  varchar,
  int,
  timestamp,
  mysqlEnum,
  json,
  index,
  text,
  decimal,
  tinyint,
} from "drizzle-orm/mysql-core";

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

export const aiSessions = mysqlTable("ai_sessions", {
  id: varchar("id", { length: 36 })
    .primaryKey()
    .$defaultFn(() => generateId()),
  tenantId: varchar("tenant_id", { length: 36 })
    .notNull()
    .references(() => tenants.id),
  userId: varchar("user_id", { length: 36 })
    .notNull()
    .references(() => users.id),
  parentSessionId: varchar("parent_session_id", { length: 36 }), // Lineage
  title: varchar("title", { length: 255 }).notNull().default("New Session"),
  model: varchar("model", { length: 100 }),
  visibility: mysqlEnum("visibility", ["private", "public"]).default("private"),
  summary: text("summary"), // [HIGH-FIDELITY] Dual-stage summarized context
  tokenStats: json("token_stats").$type<TokenStats>(), // Dialect-agnostic token tracking
  isCompressed: tinyint("is_compressed").default(0), // Compaction flag
  metadata: json("metadata").$type<ChatMetadata>(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const aiMessages = mysqlTable(
  "ai_messages",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => generateId()),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id),
    sessionId: varchar("session_id", { length: 36 })
      .notNull()
      .references(() => aiSessions.id, { onDelete: "cascade" }),
    role: mysqlEnum("role", ["user", "assistant", "system", "tool"]).notNull(),
    parts: json("parts").$type<MessagePart[]>().notNull(),
    cacheBreakpoint: tinyint("cache_breakpoint").default(0), // [HIGH-FIDELITY] Anthropic-style cache control
    toolCallId: varchar("tool_call_id", { length: 255 }), // [HIGH-FIDELITY] Correlation ID for tool_call/tool_result pairs
    metadata: json("metadata").$type<MessageMetadata>(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  },
  (table) => ({
    tenantSessionIdx: index("msg_tenant_session_idx").on(table.tenantId, table.sessionId),
  }),
);

export const aiVotes = mysqlTable(
  "ai_votes",
  {
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id),
    sessionId: varchar("session_id", { length: 36 })
      .notNull()
      .references(() => aiSessions.id, { onDelete: "cascade" }),
    messageId: varchar("message_id", { length: 36 })
      .notNull()
      .references(() => aiMessages.id, { onDelete: "cascade" }),
    isUpvoted: tinyint("is_upvoted").notNull(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  },
  (table) => ({
    pk: index("pk").on(table.sessionId, table.messageId),
    tenantIdx: index("vote_tenant_idx").on(table.tenantId, table.sessionId),
  }),
);

export const aiDocuments = mysqlTable(
  "ai_documents",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => generateId()),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id),
    title: varchar("title", { length: 255 }).notNull(),
    kind: mysqlEnum("kind", ["text", "code", "image", "sheet"]).notNull(),
    content: text("content"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  },
  (table) => ({
    tenantIdx: index("doc_tenant_idx").on(table.tenantId),
  }),
);

export const aiSuggestions = mysqlTable(
  "ai_suggestions",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => generateId()),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id),
    documentId: varchar("document_id", { length: 36 })
      .notNull()
      .references(() => aiDocuments.id, { onDelete: "cascade" }),
    content: text("content"),
    createdAt: timestamp("created_at").defaultNow(),
    documentCreatedAt: timestamp("document_created_at"),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  },
  (table) => ({
    tenantDocIdx: index("sug_tenant_doc_idx").on(table.tenantId, table.documentId),
  }),
);

// --- AGENTIC INFRASTRUCTURE ---

export const aiAgents = mysqlTable(
  "ai_agents",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => generateId()),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id),
    name: varchar("name", { length: 100 }).notNull(),
    agentType: varchar("agent_type", { length: 50 }).notNull(),
    capabilities: json("capabilities").$type<string[]>(),
    status: mysqlEnum("status", ["active", "inactive", "maintenance"]).default("active"),
    config: json("config").$type<Record<string, any>>(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  },
  (table) => ({
    tenantTypeIdx: index("agent_tenant_type_idx").on(table.tenantId, table.agentType),
  }),
);

export const aiAgentActions = mysqlTable(
  "ai_agent_actions",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => generateId()),
    agentId: varchar("agent_id", { length: 36 })
      .notNull()
      .references(() => aiAgents.id),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id),
    actionType: varchar("action_type", { length: 100 }).notNull(),
    idempotencyKey: varchar("idempotency_key", { length: 100 }),
    status: mysqlEnum("status", ["pending", "running", "completed", "failed"]).notNull(),
    input: json("input").$type<Record<string, any>>(),
    output: json("output").$type<Record<string, any>>(),
    errorMessage: text("error_message"),
    durationMs: int("duration_ms"),
    createdAt: timestamp("created_at").defaultNow(),
    completedAt: timestamp("completed_at"),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  },
  (table) => ({
    agentStatusIdx: index("act_agent_status_idx").on(table.agentId, table.status),
    idempotencyIdx: index("act_idempotency_idx").on(table.tenantId, table.idempotencyKey),
  }),
);

export const aiToolInvocations = mysqlTable(
  "ai_tool_invocations",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => generateId()),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id),
    actionId: varchar("action_id", { length: 36 })
      .notNull()
      .references(() => aiAgentActions.id, { onDelete: "cascade" }),
    toolName: varchar("tool_name", { length: 100 }).notNull(),
    parameters: json("parameters").$type<Record<string, any>>(),
    result: json("result").$type<Record<string, any>>(),
    latencyMs: int("latency_ms"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  },
  (table) => ({
    tenantActionIdx: index("tool_tenant_act_idx").on(table.tenantId, table.actionId),
  }),
);

// --- RECURSIVE STRATEGY & TASKS ---

export const aiGoals = mysqlTable(
  "ai_goals",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => generateId()),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    level: mysqlEnum("level", ["institution", "department", "agent", "task"]).notNull(),
    parentId: varchar("parent_id", { length: 36 }).references((): any => aiGoals.id),
    ownerAgentId: varchar("owner_agent_id", { length: 36 }).references(() => aiAgents.id),
    status: mysqlEnum("status", ["planned", "active", "achieved", "cancelled"]).default("planned"),
    academicYearId: varchar("academic_year_id", { length: 36 }),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
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

export const aiTasks = mysqlTable(
  "ai_tasks",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => generateId()),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id),
    sessionId: varchar("session_id", { length: 36 }).references(() => aiSessions.id), // [CONTROL PLANE] Lineage to Session
    projectId: varchar("project_id", { length: 36 }),
    goalId: varchar("goal_id", { length: 36 }).references(() => aiGoals.id),
    parentId: varchar("parent_id", { length: 36 }).references((): any => aiTasks.id),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    status: mysqlEnum("status", [
      "backlog",
      "todo",
      "in_progress",
      "in_review",
      "done",
      "blocked",
      "cancelled",
    ]).default("todo"),
    invocationType: mysqlEnum("invocation_type", ["scheduler", "manual", "event"]).default("manual"), // [CONTROL PLANE]
    priority: mysqlEnum("priority", ["critical", "high", "medium", "low"]).default("medium"),
    assigneeAgentId: varchar("assignee_agent_id", { length: 36 }).references(() => aiAgents.id),
    createdByAgentId: varchar("created_by_agent_id", { length: 36 }).references(() => aiAgents.id),
    createdByUserId: varchar("created_by_user_id", { length: 36 }).references(() => users.id),
    billingCode: varchar("billing_code", { length: 100 }),
    usageJson: json("usage_json").$type<TaskUsageJson>(), // [CONTROL PLANE] Tokens/Cost
    logRef: varchar("log_ref", { length: 500 }), // [CONTROL PLANE] Pointer to 8-layer forensic trace
    errorCode: varchar("error_code", { length: 100 }), // [CONTROL PLANE] Diagnostic ID
    exitCode: varchar("exit_code", { length: 50 }), // [CONTROL PLANE] Process exit code
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    cancelledAt: timestamp("cancelled_at"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  },
  (table) => ({
    tenantIdx: index("task_tenant_idx").on(table.tenantId),
    assigneeIdx: index("task_assignee_idx").on(table.tenantId, table.assigneeAgentId, table.status),
    sessionIdx: index("task_session_idx").on(table.tenantId, table.sessionId),
  }),
);

export const aiApprovals = mysqlTable(
  "ai_approvals",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => generateId()),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id),
    type: mysqlEnum("type", ["hire_agent", "approve_strategy", "budget_override"]).notNull(),
    requestedByAgentId: varchar("requested_by_agent_id", { length: 36 }).references(() => aiAgents.id),
    requestedByUserId: varchar("requested_by_user_id", { length: 36 }).references(() => users.id),
    status: mysqlEnum("status", ["pending", "approved", "rejected", "cancelled"]).default("pending"),
    payload: json("payload").notNull(),
    decisionNote: text("decision_note"),
    decidedByUserId: varchar("decided_by_user_id", { length: 36 }).references(() => users.id),
    decidedAt: timestamp("decided_at"),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  },
  (table) => ({
    tenantIdx: index("appr_tenant_idx").on(table.tenantId, table.status),
  }),
);

export const aiCostEvents = mysqlTable(
  "ai_cost_events",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => generateId()),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id),
    agentId: varchar("agent_id", { length: 36 })
      .notNull()
      .references(() => aiAgents.id),
    taskId: varchar("task_id", { length: 36 }).references(() => aiTasks.id),
    projectId: varchar("project_id", { length: 36 }),
    goalId: varchar("goal_id", { length: 36 }).references(() => aiGoals.id),
    billingCode: varchar("billing_code", { length: 100 }),
    provider: varchar("provider", { length: 100 }).notNull(),
    model: varchar("model", { length: 100 }).notNull(),
    inputTokens: int("input_tokens").notNull().default(0),
    outputTokens: int("output_tokens").notNull().default(0),
    costCents: int("cost_cents").notNull(),
    occurredAt: timestamp("occurred_at").notNull(),
  },
  (table) => ({
    tenantTimeIdx: index("cost_tenant_time_idx").on(table.tenantId, table.occurredAt),
  }),
);

export const aiActivityLogs = mysqlTable(
  "ai_activity_logs",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => generateId()),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id),
    actorType: mysqlEnum("actor_type", ["agent", "user", "system"]).notNull(),
    actorId: varchar("actor_id", { length: 255 }).notNull(),
    action: varchar("action", { length: 255 }).notNull(),
    entityType: varchar("entity_type", { length: 100 }).notNull(),
    entityId: varchar("entity_id", { length: 255 }).notNull(),
    details: json("details"),
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    tenantTimeIdx: index("log_tenant_time_idx").on(table.tenantId, table.createdAt),
  }),
);
