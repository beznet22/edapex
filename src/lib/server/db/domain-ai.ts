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
import { users } from "./sms-schema";

export const aiSessions = mysqlTable("edx_ai_sessions", {
  id: varchar("id", { length: 255 })
    .primaryKey()
    .$defaultFn(() => generateId()),
  userId: int("user_id", { unsigned: true })
    .notNull()
    .references(() => users.id),
  expiresAt: datetime("expires_at", { mode: "string" }).default(sql`NULL`),
  deviceFingerprint: varchar("device_fingerprint", { length: 255 }).default(sql`NULL`),
});

export type AISession = typeof aiSessions.$inferSelect;

export const aiChats = mysqlTable("edx_ai_chats", {
  id: varchar("id", { length: 255 })
    .primaryKey()
    .$defaultFn(() => generateId()),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  model: varchar("model", { length: 255 }).notNull(),
  userId: int("user_id", { unsigned: true })
    .default(sql`NULL`)
    .references(() => users.id),
  visibility: varchar("visibility", { length: 10 }).notNull().default("private"),
});
export type AIChat = typeof aiChats.$inferSelect;

export const aiMessages = mysqlTable(
  "edx_ai_messages",
  {
    id: varchar("id", { length: 255 })
      .primaryKey()
      .$defaultFn(() => generateId()),
    chatId: varchar("chatId", { length: 255 })
      .references(() => aiChats.id, { onDelete: "cascade" })
      .notNull(),
    role: varchar("role", { length: 50 }).notNull(),
    parts: json("parts").notNull(),
    metadata: json("metadata"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [
    index("ai_messages_chat_id_idx").on(table.chatId),
    index("ai_messages_chat_id_created_at_idx").on(table.chatId, table.createdAt),
  ]
);
export type AIMessage = typeof aiMessages.$inferSelect;

export const aiVotes = mysqlTable(
  "edx_ai_votes",
  {
    chatId: varchar("chatId", { length: 255 })
      .notNull()
      .references(() => aiChats.id),
    messageId: varchar("messageId", { length: 255 })
      .notNull()
      .references(() => aiMessages.id),
    isUpvoted: boolean("isUpvoted").notNull(),
  },
  (table) => [primaryKey({ columns: [table.chatId, table.messageId] })]
);

export type AIVote = typeof aiVotes.$inferSelect;

export const aiDocuments = mysqlTable(
  "edx_ai_documents",
  {
    id: varchar("id", { length: 255 })
      .notNull()
      .$defaultFn(() => generateId()),
    title: varchar("title", { length: 255 }).notNull(),
    content: text("content"),
    kind: varchar("kind", { length: 20 }).notNull().default("text"),
    userId: int("user_id", { unsigned: true })
      .default(sql`NULL`)
      .references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.id, table.createdAt] })]
);

export type AIDocument = typeof aiDocuments.$inferSelect;

export const aiSuggestions = mysqlTable(
  "edx_ai_suggestions",
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
      .references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.id] }),
    foreignKey({
      columns: [table.documentId, table.documentCreatedAt],
      foreignColumns: [aiDocuments.id, aiDocuments.createdAt],
      name: "edx_ai_suggestions_doc_fk",
    }),
  ]
);
export type AISuggestion = typeof aiSuggestions.$inferSelect;
