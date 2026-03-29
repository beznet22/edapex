/**
 * ARCHITECTURE OVERVIEW: System Events & Audit Domain
 * 
 * Purpose:
 * Implements an event-sourcing architectural pattern via `edx_domain_events` and 
 * `edx_audit_log`. Stores heavily indexed immutable payloads detailing systemic 
 * state mutations for security forensics and webhook syndication.
 * 
 * Replaces Legacy Tables:
 * - sm_system_logs
 * - sm_user_logs
 */
import { pgSchema, text, doublePrecision, integer, serial, numeric, smallint, timestamp, jsonb, boolean, date, varchar, index } from "drizzle-orm/pg-core";
import { users, tenants, accounts } from "./domain-core";

export type EventMetadata = {
  ipAddress?: string;
  userAgent?: string;
  sourceSystem?: string;
  agentId?: string;  // links to ai_agents for agent-triggered events
};

export type AuditLogValues = Record<string, unknown>;
export const eventsSchema = pgSchema("domain_events");

export const events = eventsSchema.table("events", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  eventType: varchar("event_type", { length: 100 }).notNull(),
  // e.g. 'student.enrolled', 'exam.completed', 'fee.paid', 'attendance.marked', 'agent.action_completed'
  aggregateType: varchar("aggregate_type", { length: 50 }).notNull(),
  aggregateId: integer("aggregate_id").notNull(),
  actorId: integer("actor_id").references(() => users.id),  // persona who triggered the event
  payload: jsonb("payload").$type<Record<string, any>>().notNull(),
  metadata: jsonb("metadata").$type<EventMetadata>(),
  // Transactional Outbox: tracks event dispatch lifecycle
  deliveryStatus: varchar("delivery_status", { length: 150 }).default("pending").notNull(),
  // Optimistic concurrency control for event versioning
  version: integer("version").default(1).notNull(),
  // Top-level for indexing — traces agent workflow chains across domains
  correlationId: varchar("correlation_id", { length: 100 }),
  occurredAt: timestamp("occurred_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  aggregateIdx: index("evt_aggregate_idx").on(table.aggregateType, table.aggregateId),
  tenantEventIdx: index("evt_tenant_event_idx").on(table.tenantId, table.eventType),
  timeIdx: index("evt_time_idx").on(table.occurredAt),
  correlationIdx: index("evt_correlation_idx").on(table.tenantId, table.correlationId),
  deliveryIdx: index("evt_delivery_idx").on(table.deliveryStatus, table.occurredAt),
}));

export const auditLog = eventsSchema.table("audit_log", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  tableName: varchar("table_name", { length: 100 }).notNull(),
  recordId: integer("record_id").notNull(),
  action: varchar("action", { length: 150 }).notNull(),
  oldValues: jsonb("old_values").$type<AuditLogValues>(),
  newValues: jsonb("new_values").$type<AuditLogValues>(),
  changedBy: integer("changed_by").notNull().references(() => users.id), // Staff persona
  changedAt: timestamp("changed_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  recordIdx: index("audit_record_idx").on(table.tableName, table.recordId),
  tenantIdx: index("audit_tenant_idx").on(table.tenantId),
}));
