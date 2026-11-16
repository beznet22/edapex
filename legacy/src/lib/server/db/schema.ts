/**
 * SMS Schema Barrel Export
 *
 * Re-exports the school management system schema for Drizzle ORM.
 * All legacy AI chat tables (ai_chats, ai_messages, ai_votes,
 * ai_documents, ai_suggestions) have been decommissioned.
 * Chat memory and agent state now live in Mastra sovereign storage (mastra.db).
 *
 * The sessions table is retained here — it serves the auth system,
 * not the AI chat pipeline.
 */
import {
  int,
  mysqlTable,
  varchar,
  datetime,
} from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";
import { randomUUID } from "crypto";

export * from "./sms-schema";
import { users, smStaffs, smStudents, smParents } from "./sms-schema";

export type User = typeof users.$inferSelect;
export type Staff = typeof smStaffs.$inferSelect;
export type Student = typeof smStudents.$inferSelect;
export type Parent = typeof smParents.$inferSelect;

/**
 * Auth sessions table — used for user session management & refresh tokens.
 * NOT part of the AI/chat system (retained despite the ai_ prefix).
 */
export const sessions = mysqlTable("ai_sessions", {
  id: varchar("id", { length: 255 })
    .primaryKey()
    .$defaultFn(() => randomUUID()),
  userId: int("user_id", { unsigned: true })
    .notNull()
    .references(() => users.id, { onDelete: "cascade", onUpdate: "restrict" }),
  expiresAt: datetime("expires_at", { mode: "string" }).default(sql`NULL`),
  deviceFingerprint: varchar("device_fingerprint", { length: 255 }).default(sql`NULL`),
});

export type Session = typeof sessions.$inferSelect;

