/**
 * ARCHITECTURE OVERVIEW: Communication Domain
 * 
 * Purpose:
 * Re-architects message dispatching via `communication_events`. Supports polymorphic 
 * `target_ref_id` strings mapping to accounts or roles, handling auditing, and delivery 
 * status of multi-channel logs (SMS, Email, Push) structurally across tenants.
 * 
 * Replaces Legacy Tables:
 * - sm_notice_boards
 * - sm_email_sms_logs
 * - sm_communications / sm_send_messages
 * - chat_conversations / chat_groups / chat_group_message_recipients
 */
import { pgSchema, text, doublePrecision, integer, uuid, numeric, smallint, timestamp, jsonb, boolean, date, varchar, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { users, tenants, accounts } from "./domain-core";

// Universal Communication Events — replaces 6 notification/message tables

export type CommunicationMetadata = {
  channelConfig?: {
    templateId?: string;
    providerResponse?: string;
  };
};
export const communicationSchema = pgSchema("domain_communication");


export const communicationEvents = communicationSchema.table("communication_events", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  channel: varchar("channel", { length: 150 }).notNull(),
  senderId: uuid("sender_id").references(() => users.id), // Staff persona
  targetType: varchar("target_type", { length: 150 }).notNull(),
  targetRefId: uuid("target_ref_id"),
  subject: varchar("subject", { length: 500 }),
  body: text("body"),
  // Scheduling and priority for delivery routing
  priority: varchar("priority", { length: 150 }).default("normal").notNull(),
  scheduledAt: timestamp("scheduled_at"),  // NULL = send immediately
  sentAt: timestamp("sent_at"),  // when actually dispatched
  metadata: jsonb("metadata").$type<CommunicationMetadata>(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  targetIdx: index("comm_target_idx").on(table.targetType, table.targetRefId),
  tenantIdx: index("comm_tenant_idx").on(table.tenantId),
  channelIdx: index("comm_channel_idx").on(table.tenantId, table.channel),
  scheduledIdx: index("comm_scheduled_idx").on(table.scheduledAt),
}));

// --- NEW TABLE ---

// Communication Recipients — per-recipient delivery tracking
export const communicationRecipients = communicationSchema.table("communication_recipients", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  eventId: uuid("event_id").notNull().references(() => communicationEvents.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id), // Recipient persona
  deliveryStatus: varchar("delivery_status", { length: 150 }).notNull().default("pending"),
  readAt: timestamp("read_at"),
  deliveredAt: timestamp("delivered_at"),
  failureReason: varchar("failure_reason", { length: 500 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  eventIdx: index("comr_event_idx").on(table.eventId),
  userIdx: index("comr_user_idx").on(table.userId),
  statusIdx: index("comr_status_idx").on(table.deliveryStatus),
}));
