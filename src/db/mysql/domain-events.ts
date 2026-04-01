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
import {

  mysqlTable,
  varchar,
  int,
  timestamp,
  mysqlEnum,
  json,
  index,
} from "drizzle-orm/mysql-core";
import { users, tenants, accounts } from "./domain-core";
import { generateId } from "../utils/id";

export type EventMetadata = {
  ipAddress?: string;
  userAgent?: string;
  sourceSystem?: string;
  agentId?: string;  // links to ai_agents for agent-triggered events
};

export type AuditLogValues = Record<string, unknown>;
export const events = mysqlTable("events", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => generateId()),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  eventType: varchar("event_type", { length: 100 }).notNull(),
  // e.g. 'student.enrolled', 'exam.completed', 'fee.paid', 'attendance.marked', 'agent.action_completed'
  aggregateType: varchar("aggregate_type", { length: 50 }).notNull(),
  aggregateId: varchar("aggregate_id", { length: 36 }).notNull(),
  actorId: varchar("actor_id", { length: 36 }).references(() => users.id),  // persona who triggered the event
  payload: json("payload").$type<Record<string, any>>().notNull(),
  metadata: json("metadata").$type<EventMetadata>(),
  // Transactional Outbox: tracks event dispatch lifecycle
  deliveryStatus: mysqlEnum("delivery_status", ["pending", "dispatched", "failed"]).default("pending").notNull(),
  // Optimistic concurrency control for event versioning
  version: int("version").default(1).notNull(),
  // Top-level for indexing — traces agent workflow chains across domains
  correlationId: varchar("correlation_id", { length: 100 }),
  occurredAt: timestamp("occurred_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
  aggregateIdx: index("evt_aggregate_idx").on(table.aggregateType, table.aggregateId),
  tenantEventIdx: index("evt_tenant_event_idx").on(table.tenantId, table.eventType),
  timeIdx: index("evt_time_idx").on(table.occurredAt),
  correlationIdx: index("evt_correlation_idx").on(table.tenantId, table.correlationId),
  deliveryIdx: index("evt_delivery_idx").on(table.deliveryStatus, table.occurredAt),
}));

export const auditLog = mysqlTable("audit_log", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => generateId()),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  tableName: varchar("table_name", { length: 100 }).notNull(),
  recordId: varchar("record_id", { length: 36 }).notNull(),
  action: mysqlEnum("action", ["INSERT", "UPDATE", "DELETE"]).notNull(),
  oldValues: json("old_values").$type<AuditLogValues>(),
  newValues: json("new_values").$type<AuditLogValues>(),
  changedBy: varchar("changed_by", { length: 36 }).notNull().references(() => users.id), // Staff persona
  changedAt: timestamp("changed_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
  recordIdx: index("audit_record_idx").on(table.tableName, table.recordId),
  tenantIdx: index("audit_tenant_idx").on(table.tenantId),
}));
