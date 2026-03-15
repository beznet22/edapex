import {
  mysqlTable,
  varchar,
  int,
  timestamp,
  mysqlEnum,
  text,
  json,
  index,
} from "drizzle-orm/mysql-core";

import { accounts } from "./domain-core";

// Universal Communication Events — replaces 6 notification/message tables

export type CommunicationMetadata = {
  deliveryStatus?: "pending" | "sent" | "failed" | "delivered";
  readAt?: string;
  channelConfig?: {
    templateId?: string;
    providerResponse?: string;
  };
};

export const communicationEvents = mysqlTable("edx_communication_events", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull(),
  channel: mysqlEnum("channel", [
    "notification", "notice", "message", "email", "sms", "chat"
  ]).notNull(),
  senderId: int("sender_id").references(() => accounts.id),
  targetType: mysqlEnum("target_type", [
    "person", "role", "class", "section", "broadcast"
  ]).notNull(),
  targetRefId: int("target_ref_id"),
  subject: varchar("subject", { length: 500 }),
  body: text("body"),
  metadata: json("metadata").$type<CommunicationMetadata>(),  // { delivery_status, read_at, channel_config }
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  targetIdx: index("comm_target_idx").on(table.targetType, table.targetRefId),
  tenantIdx: index("comm_tenant_idx").on(table.tenantId),
  channelIdx: index("comm_channel_idx").on(table.tenantId, table.channel),
}));
