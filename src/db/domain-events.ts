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

export type EventMetadata = {
  ipAddress?: string;
  userAgent?: string;
  sourceSystem?: string;
  agentId?: string;  // links to ai_agents for agent-triggered events
  correlationId?: string;  // traces agent workflow chains
};

export type AuditLogValues = Record<string, unknown>;
export const events = mysqlTable("events", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id),
  eventType: varchar("event_type", { length: 100 }).notNull(),
  // e.g. 'student.enrolled', 'exam.completed', 'fee.paid', 'attendance.marked', 'agent.action_completed'
  aggregateType: varchar("aggregate_type", { length: 50 }).notNull(),
  aggregateId: int("aggregate_id").notNull(),
  actorId: int("actor_id").references(() => users.id),  // persona who triggered the event
  payload: json("payload").$type<Record<string, any>>().notNull(),
  metadata: json("metadata").$type<EventMetadata>(),
  occurredAt: timestamp("occurred_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
  aggregateIdx: index("evt_aggregate_idx").on(table.aggregateType, table.aggregateId),
  tenantEventIdx: index("evt_tenant_event_idx").on(table.tenantId, table.eventType),
  timeIdx: index("evt_time_idx").on(table.occurredAt),
  correlationIdx: index("evt_correlation_idx").on(table.tenantId),
}));

export const auditLog = mysqlTable("audit_log", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id),
  tableName: varchar("table_name", { length: 100 }).notNull(),
  recordId: int("record_id").notNull(),
  action: mysqlEnum("action", ["INSERT", "UPDATE", "DELETE"]).notNull(),
  oldValues: json("old_values").$type<AuditLogValues>(),
  newValues: json("new_values").$type<AuditLogValues>(),
  changedBy: int("changed_by").notNull().references(() => users.id), // Staff persona
  changedAt: timestamp("changed_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
  recordIdx: index("audit_record_idx").on(table.tableName, table.recordId),
  tenantIdx: index("audit_tenant_idx").on(table.tenantId),
}));
