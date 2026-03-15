import { pgSchema, text, timestamp, uuid, jsonb, pgTable, numeric, boolean } from "drizzle-orm/pg-core";
import { tenants, users } from "./core-schema";
import { sql } from "drizzle-orm";

export const ai = pgSchema("ai");

/**
 * THREADS (Conversation sessions)
 */
export const threads = ai.table("threads", {
  id: uuid("id").primaryKey().default(sql`gen_uuidv7()`),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id),
  title: text("title"),
  context: jsonb("context").default({}), // Transient context for agent reasoning
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * MESSAGES (Thread items)
 */
export const messages = ai.table("messages", {
  id: uuid("id").primaryKey().default(sql`gen_uuidv7()`),
  threadId: uuid("thread_id")
    .notNull()
    .references(() => threads.id, { onDelete: "cascade" }),
  role: text("role", { enum: ["user", "assistant", "system", "tool"] }).notNull(),
  content: text("content"),
  toolCalls: jsonb("tool_calls"), // Structured tool data
  feedback: jsonb("feedback"), // User ratings/corrections
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * TOOL REGISTRY (Self-Evolving Agent Infrastructure)
 * Allows the system to register and optimize its own tools.
 */
export const toolRegistry = ai.table("tool_registry", {
  id: uuid("id").primaryKey().default(sql`gen_uuidv7()`),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"), // LLM-facing prompt/manual
  parameters: jsonb("parameters"), // JSON Schema for tool input
  handlerUrl: text("handler_url"), // Optional dynamic tool endpoint
  performanceScore: numeric("performance_score", { precision: 3, scale: 2 }).default("0"),
  version: numeric("version").default("1"),
  isActive: boolean("is_active").default(true).notNull(),
}, (table) => {
  return [
    {
      uniqueToolPerTenant: sql`UNIQUE(${table.tenantId}, ${table.name})`,
    }
  ];
});

/**
 * EVOLUTION LOG (Autonomic Self-Correction)
 * Records observations about agent failures and suggested improvements.
 */
export const evolutionLog = ai.table("evolution_log", {
  id: uuid("id").primaryKey().default(sql`gen_uuidv7()`),
  tenantId: uuid("tenant_id").notNull(),
  toolId: uuid("tool_id").references(() => toolRegistry.id),
  observation: text("observation").notNull(), // e.g., "Agent failed to parse date formats in Tool X"
  suggestedFix: jsonb("suggested_fix"), // { new_prompt, parameter_change }
  status: text("status", { enum: ["pending", "applied", "revoked"] }).default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
