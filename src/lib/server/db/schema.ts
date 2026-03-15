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
export * from "./domain-core";
export * from "./domain-academic";
export * from "./domain-assessment";
export * from "./domain-attendance";
export * from "./domain-cms";
export * from "./domain-communication";
export * from "./domain-documents";
export * from "./domain-events";
export * from "./domain-facilities";
export * from "./domain-finance";
export * from "./domain-hr";
export * from "./domain-library";
export * from "./domain-pbac";
export * from "./domain-settings";
import { users, smStaffs, smStudents, smParents } from "./sms-schema";

export type User = typeof users.$inferSelect;
export type Staff = typeof smStaffs.$inferSelect;
export type Student = typeof smStudents.$inferSelect;
export type Parent = typeof smParents.$inferSelect;

export * from "./domain-ai";

export {
  aiSessions as sessions,
  aiChats as chats,
  aiMessages as messages,
  aiVotes as votes,
  aiDocuments as documents,
  aiSuggestions as suggestions,
} from "./domain-ai";

export type {
  AISession as Session,
  AIChat as DBChat,
  AIMessage as DBMessage,
  AIVote as Vote,
  AIDocument as Document,
  AISuggestion as Suggestion,
} from "./domain-ai";
