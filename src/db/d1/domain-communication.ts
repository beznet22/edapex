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
import { unique,  sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";

import { users, tenants, accounts } from "./domain-core";

// Universal Communication Events — replaces 6 notification/message tables

export type CommunicationMetadata = {
  channelConfig?: {
    templateId?: string;
    providerResponse?: string;
  };
};

export const communicationEvents = sqliteTable("communication_events", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  channel: text("channel", { enum: [
    "notification", "notice", "message", "email", "sms", "chat"
  ] }).notNull(),
  senderId: integer("sender_id").references(() => users.id), // Staff persona
  targetType: text("target_type", { enum: [
    "person", "role", "class", "section", "broadcast"
  ] }).notNull(),
  targetRefId: integer("target_ref_id"),
  subject: text("subject", { length: 500 }),
  body: text("body"),
  // Scheduling and priority for delivery routing
  priority: text("priority", { enum: ["low", "normal", "high", "urgent"] }).default("normal").notNull(),
  scheduledAt: integer("scheduled_at", { mode: "timestamp" }),  // NULL = send immediately
  sentAt: integer("sent_at", { mode: "timestamp" }),  // when actually dispatched
  metadata: text("metadata", { mode: "json" }).$type<CommunicationMetadata>(),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
}, (table) => ({
  targetIdx: index("comm_target_idx").on(table.targetType, table.targetRefId),
  tenantIdx: index("comm_tenant_idx").on(table.tenantId),
  channelIdx: index("comm_channel_idx").on(table.tenantId, table.channel),
  scheduledIdx: index("comm_scheduled_idx").on(table.scheduledAt),
}));

// --- NEW TABLE ---

// Communication Recipients — per-recipient delivery tracking
export const communicationRecipients = sqliteTable("communication_recipients", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  eventId: integer("event_id").notNull().references(() => communicationEvents.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id), // Recipient persona
  deliveryStatus: text("delivery_status", { enum: ["pending", "sent", "delivered", "failed", "bounced"] }).notNull().default("pending"),
  readAt: integer("read_at", { mode: "timestamp" }),
  deliveredAt: integer("delivered_at", { mode: "timestamp" }),
  failureReason: text("failure_reason", { length: 500 }),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
}, (table) => ({
  eventIdx: index("comr_event_idx").on(table.eventId),
  userIdx: index("comr_user_idx").on(table.userId),
  statusIdx: index("comr_status_idx").on(table.deliveryStatus),
}));
