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

export const aiChats = sqliteTable("domain_ai_ai_chats", {
  id: text("id", { length: 255 }).primaryKey(), 
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  userId: integer("user_id").notNull().references(() => users.id),
  title: text("title", { length: 255 }).notNull().default("New Chat"),
  model: text("model", { length: 100 }),
  visibility: text("visibility", { enum: ["private", "public"] }).default("private"),
  metadata: text("metadata", { mode: "json" }).$type<ChatMetadata>(),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
});

export const aiMessages = sqliteTable("domain_ai_ai_messages", {
  id: text("id", { length: 255 }).primaryKey(),
  chatId: text("chat_id", { length: 255 }).notNull().references(() => aiChats.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["user", "assistant", "system", "tool"] }).notNull(),
  parts: text("parts", { mode: "json" }).$type<MessagePart[]>().notNull(),
  metadata: text("metadata", { mode: "json" }).$type<MessageMetadata>(),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
});

export const aiVotes = sqliteTable("domain_ai_ai_votes", {
  chatId: text("chat_id", { length: 255 }).notNull().references(() => aiChats.id, { onDelete: "cascade" }),
  messageId: text("message_id", { length: 255 }).notNull().references(() => aiMessages.id, { onDelete: "cascade" }),
  isUpvoted: integer("is_upvoted").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
}, (table) => ({
  pk: index("pk").on(table.chatId, table.messageId),
}));

export const aiDocuments = sqliteTable("domain_ai_ai_documents", {
  id: text("id", { length: 255 }).primaryKey(),
  title: text("title", { length: 255 }).notNull(),
  kind: text("kind", { enum: ["text", "code", "image", "sheet"] }).notNull(),
  content: text("content"),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
});

export const aiSuggestions = sqliteTable("domain_ai_ai_suggestions", {
  id: text("id", { length: 255 }).primaryKey(),
  documentId: text("document_id", { length: 255 }).notNull().references(() => aiDocuments.id, { onDelete: "cascade" }),
  content: text("content"),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  documentCreatedAt: integer("document_created_at", { mode: "timestamp" }),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
});

// --- AGENTIC INFRASTRUCTURE ---

export const aiAgents = sqliteTable("domain_ai_ai_agents", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
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

export const aiAgentActions = sqliteTable("domain_ai_ai_agent_actions", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  agentId: integer("agent_id").notNull().references(() => aiAgents.id),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
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
  agentStatusIdx: index("act_agent_status_idx").on(table.agentId, table.status),
  idempotencyIdx: index("act_idempotency_idx").on(table.tenantId, table.idempotencyKey),
}));

export const aiToolInvocations = sqliteTable("domain_ai_ai_tool_invocations", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  actionId: integer("action_id").notNull().references(() => aiAgentActions.id, { onDelete: "cascade" }),
  toolName: text("tool_name", { length: 100 }).notNull(),
  parameters: text("parameters", { mode: "json" }).$type<Record<string, any>>(),
  result: text("result", { mode: "json" }).$type<Record<string, any>>(),
  latencyMs: integer("latency_ms"),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
});
