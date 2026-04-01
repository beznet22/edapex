/**
 * ARCHITECTURE OVERVIEW: Communication Domain
 * 
 * Purpose:
 * Re-architects message dispatching via `edx_communication_events`. Supports polymorphic 
 * `target_ref_id` strings mapping to accounts or roles, handling auditing, and delivery 
 * status of multi-channel logs (SMS, Email, Push) structurally across tenants.
 * 
 * Replaces Legacy Tables:
 * - sm_notice_boards
 * - sm_email_sms_logs
 * - sm_communications / sm_send_messages
 * - chat_conversations / chat_groups / chat_group_message_recipients
 */
import {

  mysqlTable,
  varchar,
  int,
  timestamp,
  mysqlEnum,
  text,
  json,
  index,
  tinyint,
} from "drizzle-orm/mysql-core";

import { users, tenants, accounts } from "./domain-core";
import { generateId } from "../utils/id";

// Universal Communication Events — replaces 6 notification/message tables

export type CommunicationMetadata = {
  channelConfig?: {
    templateId?: string;
    providerResponse?: string;
  };
};

export const communicationEvents = mysqlTable("communication_events", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => generateId()),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  channel: mysqlEnum("channel", [
    "notification", "notice", "message", "email", "sms", "chat"
  ]).notNull(),
  senderId: varchar("sender_id", { length: 36 }).references(() => users.id), // Staff persona
  targetType: mysqlEnum("target_type", [
    "person", "role", "class", "section", "broadcast"
  ]).notNull(),
  targetRefId: varchar("target_ref_id", { length: 36 }),
  subject: varchar("subject", { length: 500 }),
  body: text("body"),
  // Scheduling and priority for delivery routing
  priority: mysqlEnum("priority", ["low", "normal", "high", "urgent"]).default("normal").notNull(),
  scheduledAt: timestamp("scheduled_at"),  // NULL = send immediately
  sentAt: timestamp("sent_at"),  // when actually dispatched
  metadata: json("metadata").$type<CommunicationMetadata>(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
  targetIdx: index("comm_target_idx").on(table.targetType, table.targetRefId),
  tenantIdx: index("comm_tenant_idx").on(table.tenantId),
  channelIdx: index("comm_channel_idx").on(table.tenantId, table.channel),
  scheduledIdx: index("comm_scheduled_idx").on(table.scheduledAt),
}));

// --- NEW TABLE ---

// Communication Recipients — per-recipient delivery tracking
export const communicationRecipients = mysqlTable("communication_recipients", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => generateId()),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  eventId: varchar("event_id", { length: 36 }).notNull().references(() => communicationEvents.id, { onDelete: "cascade" }),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id), // Recipient persona
  deliveryStatus: mysqlEnum("delivery_status", ["pending", "sent", "delivered", "failed", "bounced"]).notNull().default("pending"),
  readAt: timestamp("read_at"),
  deliveredAt: timestamp("delivered_at"),
  failureReason: varchar("failure_reason", { length: 500 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
  eventIdx: index("comr_event_idx").on(table.eventId),
  userIdx: index("comr_user_idx").on(table.userId),
  statusIdx: index("comr_status_idx").on(table.deliveryStatus),
  tenantEventIdx: index("comr_tenant_evt_idx").on(table.tenantId, table.eventId),
}));
