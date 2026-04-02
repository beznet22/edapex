/**
 * ARCHITECTURE OVERVIEW: Classroom Domain (Domain 18)
 * 
 * Purpose:
 * Encapsulates the OpenMAIC-powered Agentic Classroom state entirely within its own
 * domain boundary. Prevents high-frequency stateless LangGraph events from polluting
 * the static Course (LMS) or Academic term tables.
 * 
 * Tables:
 * - classroom_sessions: Core session lifecycle (scheduled -> active -> completed)
 * - classroom_memory_ledger: LangGraph state buffer for interleaved action/text arrays
 * - classroom_participants: Session roster with dynamic engagement scoring
 * - classroom_whiteboard_state: WhiteboardLedger replica for wb_ actions
 * 
 * Cross-Domain Edges:
 * - LMS (course_id) -> Director's pedagogical blueprint
 * - AI (director_agent_id) -> Orchestration budget & adapters
 * - Core (tenant_id, user_id) -> Authentication & tenant isolation
 */
import {
  mysqlTable,
  int,
  timestamp,
  mysqlEnum,
  json,
  index,
  varchar,
  double,
} from "drizzle-orm/mysql-core";
import { generateId } from "../utils/id";

import { tenants, users } from "./domain-core";
import { lmsCourses } from "./domain-lms";
import { aiAgents } from "./domain-ai";

// ─── Types ───────────────────────────────────────────────────────────────────

export type ClassroomSessionMetadata = {
  langGraphNodeState?: Record<string, unknown>;
  directorConfig?: Record<string, unknown>;
  standaloneMode?: boolean;
};

export type ClassroomMemoryContent = {
  type: "action" | "text";
  content: unknown;
}[];

export type ClassroomWhiteboardTimeline = {
  timestamp: number;
  action: string;
  payload: Record<string, unknown>;
}[];

// ─── classroom_sessions ──────────────────────────────────────────────────────

export const classroomSessions = mysqlTable("classroom_sessions", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => generateId()),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  courseId: varchar("course_id", { length: 36 }).references(() => lmsCourses.id),
  directorAgentId: varchar("director_agent_id", { length: 36 }).references(() => aiAgents.id),
  status: mysqlEnum("status", ["scheduled", "active", "paused", "completed"]).notNull().default("scheduled"),
  metadata: json("metadata").$type<ClassroomSessionMetadata>(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
  tenantIdx: index("cls_session_tenant_idx").on(table.tenantId),
  tenantStatusIdx: index("cls_session_tenant_status_idx").on(table.tenantId, table.status),
}));

// ─── classroom_memory_ledger ─────────────────────────────────────────────────

export const classroomMemoryLedger = mysqlTable("classroom_memory_ledger", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => generateId()),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  sessionId: varchar("session_id", { length: 36 }).notNull().references(() => classroomSessions.id),
  turnCount: int("turn_count").notNull(),
  role: mysqlEnum("role", ["user", "assistant", "director_node_log"]).notNull(),
  parsedContent: json("parsed_content").$type<ClassroomMemoryContent>(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  tenantSessionIdx: index("cls_memory_tenant_session_idx").on(table.tenantId, table.sessionId),
  sessionTurnIdx: index("cls_memory_session_turn_idx").on(table.sessionId, table.turnCount),
}));

// ─── classroom_participants ──────────────────────────────────────────────────

export const classroomParticipants = mysqlTable("classroom_participants", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => generateId()),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  sessionId: varchar("session_id", { length: 36 }).notNull().references(() => classroomSessions.id),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id),
  role: mysqlEnum("role", ["student", "human_observer"]).notNull(),
  engagementScore: double("engagement_score").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
  tenantSessionIdx: index("cls_part_tenant_session_idx").on(table.tenantId, table.sessionId),
  sessionUserIdx: index("cls_part_session_user_idx").on(table.sessionId, table.userId),
}));

// ─── classroom_whiteboard_state ──────────────────────────────────────────────

export const classroomWhiteboardState = mysqlTable("classroom_whiteboard_state", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => generateId()),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  sessionId: varchar("session_id", { length: 36 }).notNull().references(() => classroomSessions.id),
  timeline: json("timeline").$type<ClassroomWhiteboardTimeline>(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
  tenantSessionIdx: index("cls_wb_tenant_session_idx").on(table.tenantId, table.sessionId),
}));
