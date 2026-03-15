import {
  mysqlTable,
  varchar,
  int,
  timestamp,
  mysqlEnum,
  json,
  index,
} from "drizzle-orm/mysql-core";
export type EventMetadata = {
  ipAddress?: string;
  userAgent?: string;
  sourceSystem?: string;
};

export type AuditLogValues = Record<string, unknown>;
export const domainEvents = mysqlTable("edx_domain_events", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull(),
  eventType: varchar("event_type", { length: 100 }).notNull(),
  // e.g. 'student.enrolled', 'exam.completed', 'fee.paid', 'attendance.marked'
  aggregateType: varchar("aggregate_type", { length: 50 }).notNull(),
  aggregateId: int("aggregate_id").notNull(),
  actorId: int("actor_id"),  // who triggered the event
  payload: json("payload").notNull(),
  metadata: json("metadata").$type<EventMetadata>(),  // { ip, user_agent, source_system }
  occurredAt: timestamp("occurred_at").defaultNow().notNull(),
}, (table) => ({
  aggregateIdx: index("evt_aggregate_idx").on(table.aggregateType, table.aggregateId),
  tenantEventIdx: index("evt_tenant_event_idx").on(table.tenantId, table.eventType),
  timeIdx: index("evt_time_idx").on(table.occurredAt),
}));

export const auditLog = mysqlTable("edx_audit_log", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull(),
  tableName: varchar("table_name", { length: 100 }).notNull(),
  recordId: int("record_id").notNull(),
  action: mysqlEnum("action", ["INSERT", "UPDATE", "DELETE"]).notNull(),
  oldValues: json("old_values").$type<AuditLogValues>(),
  newValues: json("new_values").$type<AuditLogValues>(),
  changedBy: int("changed_by").notNull(),
  changedAt: timestamp("changed_at").defaultNow().notNull(),
}, (table) => ({
  recordIdx: index("audit_record_idx").on(table.tableName, table.recordId),
  tenantIdx: index("audit_tenant_idx").on(table.tenantId),
}));
