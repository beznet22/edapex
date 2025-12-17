import {
  index,
  int,
  mysqlTable,
  text,
  varchar,
  timestamp,
  json,
  boolean,
  primaryKey,
  foreignKey,
  datetime,
} from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";
import { generateId } from "ai";
export * from "./sms-schema";
import { users, smStaffs, smStudents, smParents } from "./sms-schema";
import { DrizzleMySQLAdapter } from "@lucia-auth/adapter-drizzle";

export type User = typeof users.$inferSelect;
export type Staff = typeof smStaffs.$inferSelect;
export type Student = typeof smStudents.$inferSelect;
export type Parent = typeof smParents.$inferSelect;

export const sessions = mysqlTable("ai_sessions", {
  id: varchar("id", { length: 255 })
    .primaryKey()
    .$defaultFn(() => generateId()),
  userId: int("user_id", { unsigned: true })
    .notNull()
    .references(() => users.id, { onDelete: "cascade", onUpdate: "restrict" }),
  expiresAt: datetime("expires_at", { mode: "string" }).default(sql`NULL`),
  deviceFingerprint: varchar("device_fingerprint", { length: 255 }).default(sql`NULL`),
});

export type Session = typeof sessions.$inferSelect;

export const chats = mysqlTable("ai_chats", {
  id: varchar("id", { length: 255 })
    .primaryKey()
    .$defaultFn(() => generateId()),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  // https://github.com/copilot-is/copilot.is/blob/main/server/db/schema.ts#L34
  model: varchar("model", { length: 255 }).notNull(),
  userId: int("user_id", { unsigned: true })
    .default(sql`NULL`)
    .references(() => users.id, { onDelete: "set null", onUpdate: "restrict" }),
  visibility: varchar("visibility", { length: 10 }).notNull().default("private"),
});
export type DBChat = typeof chats.$inferSelect;

export const messages = mysqlTable(
  "ai_messages",
  {
    id: varchar("id", { length: 255 })
      .primaryKey()
      .$defaultFn(() => generateId()),
    chatId: varchar("chatId", { length: 255 })
      .references(() => chats.id, { onDelete: "cascade" })
      .notNull(),
    role: varchar("role", { length: 50 }).notNull(),
    parts: json("parts").notNull(),
    metadata: json("metadata"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [
    index("messages_chat_id_idx").on(table.chatId),
    index("messages_chat_id_created_at_idx").on(table.chatId, table.createdAt),
  ]
);
export type DBMessage = typeof messages.$inferSelect;

export const votes = mysqlTable(
  "ai-votes",
  {
    chatId: varchar("chatId", { length: 255 })
      .notNull()
      .references(() => chats.id),
    messageId: varchar("messageId", { length: 255 })
      .notNull()
      .references(() => messages.id),
    isUpvoted: boolean("isUpvoted").notNull(),
  },
  (table) => [primaryKey({ columns: [table.chatId, table.messageId] })]
);

export type Vote = typeof votes.$inferSelect;

export const documents = mysqlTable(
  "ai_documents",
  {
    id: varchar("id", { length: 255 })
      .notNull()
      .$defaultFn(() => generateId()),
    title: varchar("title", { length: 255 }).notNull(),
    content: text("content"),
    kind: varchar("kind", { length: 20 }).notNull().default("text"),
    userId: int("user_id", { unsigned: true })
      .default(sql`NULL`)
      .references(() => users.id, { onDelete: "set null", onUpdate: "restrict" }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.id, table.createdAt] })]
);

export type Document = typeof documents.$inferSelect;

export const suggestions = mysqlTable(
  "ai_suggestions",
  {
    id: varchar("id", { length: 255 })
      .notNull()
      .$defaultFn(() => generateId()),
    documentId: varchar("documentId", { length: 255 }).notNull(),
    documentCreatedAt: timestamp("documentCreatedAt").defaultNow().notNull(),
    originalText: varchar("originalText", { length: 255 }).notNull(),
    suggestedText: varchar("suggestedText", { length: 255 }).notNull(),
    description: text("description"),
    isResolved: boolean("isResolved").notNull().default(false),
    userId: int("user_id", { unsigned: true })
      .default(sql`NULL`)
      .references(() => users.id, { onDelete: "set null", onUpdate: "restrict" }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.id] }),
    foreignKey({
      columns: [table.documentId, table.documentCreatedAt],
      foreignColumns: [documents.id, documents.createdAt],
      name: "suggestions_doc_fk",
    }),
  ]
);
export type Suggestion = typeof suggestions.$inferSelect;
