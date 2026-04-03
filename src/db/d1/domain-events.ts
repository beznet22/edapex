/**
 * ARCHITECTURE OVERVIEW: System Events & Audit Domain
 * 
 * Purpose:
 * Implements an event-sourcing architectural pattern via `domain_events` and 
 * `audit_log`. Stores heavily indexed immutable payloads detailing systemic 
 * state mutations for security forensics and webhook syndication.
 * 
 * Replaces Legacy Tables:
 * - sm_system_logs
 * - sm_user_logs
 */
import { unique,  sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";
import { users, tenants, accounts } from "./domain-core";

export type EventMetadata = {
  ipAddress?: string;
  userAgent?: string;
  sourceSystem?: string;
  agentId?: string;  // links to ai_agents for agent-triggered events
};

export type AuditLogValues = Record<string, unknown>;
export const events = sqliteTable("events", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  eventType: text("event_type", { length: 100 }).notNull(),
  // e.g. 'student.enrolled', 'exam.completed', 'fee.paid', 'attendance.marked', 'agent.action_completed'
  aggregateType: text("aggregate_type", { length: 50 }).notNull(),
  aggregateId: integer("aggregate_id").notNull(),
  actorId: integer("actor_id").references(() => users.id),  // persona who triggered the event
  payload: text("payload", { mode: "json" }).$type<Record<string, any>>().notNull(),
  metadata: text("metadata", { mode: "json" }).$type<EventMetadata>(),
  // Transactional Outbox: tracks event dispatch lifecycle
  deliveryStatus: text("delivery_status", { enum: ["pending", "dispatched", "failed"] }).default("pending").notNull(),
  // Optimistic concurrency control for event versioning
  version: integer("version").default(1).notNull(),
  // Top-level for indexing — traces agent workflow chains across domains
  correlationId: text("correlation_id", { length: 100 }),
  occurredAt: integer("occurred_at", { mode: "timestamp" }).defaultNow().notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
}, (table) => ({
  aggregateIdx: index("evt_aggregate_idx").on(table.aggregateType, table.aggregateId),
  tenantEventIdx: index("evt_tenant_event_idx").on(table.tenantId, table.eventType),
  timeIdx: index("evt_time_idx").on(table.occurredAt),
  correlationIdx: index("evt_correlation_idx").on(table.tenantId, table.correlationId),
  deliveryIdx: index("evt_delivery_idx").on(table.deliveryStatus, table.occurredAt),
}));

export const auditLog = sqliteTable("audit_log", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  tableName: text("table_name", { length: 100 }).notNull(),
  recordId: integer("record_id").notNull(),
  action: text("action", { enum: ["INSERT", "UPDATE", "DELETE"] }).notNull(),
  oldValues: text("old_values", { mode: "json" }).$type<AuditLogValues>(),
  newValues: text("new_values", { mode: "json" }).$type<AuditLogValues>(),
  changedBy: integer("changed_by").notNull().references(() => users.id), // Staff persona
  changedAt: integer("changed_at", { mode: "timestamp" }).defaultNow().notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
}, (table) => ({
  recordIdx: index("audit_record_idx").on(table.tableName, table.recordId),
  tenantIdx: index("audit_tenant_idx").on(table.tenantId),
}));
