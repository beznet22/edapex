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

export const aiChats = mysqlTable("ai_chats", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => generateId()), 
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id),
  title: varchar("title", { length: 255 }).notNull().default("New Chat"),
  model: varchar("model", { length: 100 }),
  visibility: mysqlEnum("visibility", ["private", "public"]).default("private"),
  metadata: json("metadata").$type<ChatMetadata>(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const aiMessages = mysqlTable("ai_messages", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => generateId()),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  chatId: varchar("chat_id", { length: 36 }).notNull().references(() => aiChats.id, { onDelete: "cascade" }),
  role: mysqlEnum("role", ["user", "assistant", "system", "tool"]).notNull(),
  parts: json("parts").$type<MessagePart[]>().notNull(),
  metadata: json("metadata").$type<MessageMetadata>(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
  tenantChatIdx: index("msg_tenant_chat_idx").on(table.tenantId, table.chatId),
}));

export const aiVotes = mysqlTable("ai_votes", {
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  chatId: varchar("chat_id", { length: 36 }).notNull().references(() => aiChats.id, { onDelete: "cascade" }),
  messageId: varchar("message_id", { length: 36 }).notNull().references(() => aiMessages.id, { onDelete: "cascade" }),
  isUpvoted: tinyint("is_upvoted").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
  pk: index("pk").on(table.chatId, table.messageId),
  tenantIdx: index("vote_tenant_idx").on(table.tenantId, table.chatId),
}));

export const aiDocuments = mysqlTable("ai_documents", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => generateId()),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  title: varchar("title", { length: 255 }).notNull(),
  kind: mysqlEnum("kind", ["text", "code", "image", "sheet"]).notNull(),
  content: text("content"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
  tenantIdx: index("doc_tenant_idx").on(table.tenantId),
}));

export const aiSuggestions = mysqlTable("ai_suggestions", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => generateId()),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  documentId: varchar("document_id", { length: 36 }).notNull().references(() => aiDocuments.id, { onDelete: "cascade" }),
  content: text("content"),
  createdAt: timestamp("created_at").defaultNow(),
  documentCreatedAt: timestamp("document_created_at"),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
  tenantDocIdx: index("sug_tenant_doc_idx").on(table.tenantId, table.documentId),
}));

// --- AGENTIC INFRASTRUCTURE ---

export const aiAgents = mysqlTable("ai_agents", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => generateId()),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  name: varchar("name", { length: 100 }).notNull(),
  agentType: varchar("agent_type", { length: 50 }).notNull(),
  capabilities: json("capabilities").$type<string[]>(),
  status: mysqlEnum("status", ["active", "inactive", "maintenance"]).default("active"),
  config: json("config").$type<Record<string, any>>(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
  tenantTypeIdx: index("agent_tenant_type_idx").on(table.tenantId, table.agentType),
}));

export const aiAgentActions = mysqlTable("ai_agent_actions", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => generateId()),
  agentId: varchar("agent_id", { length: 36 }).notNull().references(() => aiAgents.id),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
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
}, (table) => ({
  agentStatusIdx: index("act_agent_status_idx").on(table.agentId, table.status),
  idempotencyIdx: index("act_idempotency_idx").on(table.tenantId, table.idempotencyKey),
}));

export const aiToolInvocations = mysqlTable("ai_tool_invocations", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => generateId()),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  actionId: varchar("action_id", { length: 36 }).notNull().references(() => aiAgentActions.id, { onDelete: "cascade" }),
  toolName: varchar("tool_name", { length: 100 }).notNull(),
  parameters: json("parameters").$type<Record<string, any>>(),
  result: json("result").$type<Record<string, any>>(),
  latencyMs: int("latency_ms"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
  tenantActionIdx: index("tool_tenant_act_idx").on(table.tenantId, table.actionId),
}));
