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

// Universal Communication Events — replaces 6 notification/message tables

export type CommunicationMetadata = {
  channelConfig?: {
    templateId?: string;
    providerResponse?: string;
  };
};

export const communicationEvents = mysqlTable("communication_events", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id),
  channel: mysqlEnum("channel", [
    "notification", "notice", "message", "email", "sms", "chat"
  ]).notNull(),
  senderId: int("sender_id").references(() => users.id), // Staff persona
  targetType: mysqlEnum("target_type", [
    "person", "role", "class", "section", "broadcast"
  ]).notNull(),
  targetRefId: int("target_ref_id"),
  subject: varchar("subject", { length: 500 }),
  body: text("body"),
  metadata: json("metadata").$type<CommunicationMetadata>(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
  targetIdx: index("comm_target_idx").on(table.targetType, table.targetRefId),
  tenantIdx: index("comm_tenant_idx").on(table.tenantId),
  channelIdx: index("comm_channel_idx").on(table.tenantId, table.channel),
}));

// --- NEW TABLE ---

// Communication Recipients — per-recipient delivery tracking
export const communicationRecipients = mysqlTable("communication_recipients", {
  id: int("id").autoincrement().primaryKey(),
  eventId: int("event_id").notNull().references(() => communicationEvents.id, { onDelete: "cascade" }),
  userId: int("user_id").notNull().references(() => users.id), // Recipient persona
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
}));
