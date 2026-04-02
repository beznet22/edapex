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
import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";
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
  action: string; // wb_highlight, wb_show_image, wb_pan, etc.
  payload: Record<string, unknown>;
}[];

// ─── classroom_sessions ──────────────────────────────────────────────────────

export const classroomSessions = sqliteTable("domain_classroom_sessions", {
  id: text("id").primaryKey().$defaultFn(() => generateId()),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  courseId: text("course_id").references(() => lmsCourses.id),
  directorAgentId: text("director_agent_id").references(() => aiAgents.id),
  status: text("status", { enum: ["scheduled", "active", "paused", "completed"] }).notNull().default("scheduled"),
  metadata: text("metadata", { mode: "json" }).$type<ClassroomSessionMetadata>(),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
}, (table) => ({
  tenantIdx: index("cls_session_tenant_idx").on(table.tenantId),
  tenantStatusIdx: index("cls_session_tenant_status_idx").on(table.tenantId, table.status),
}));

// ─── classroom_memory_ledger ─────────────────────────────────────────────────

export const classroomMemoryLedger = sqliteTable("domain_classroom_memory_ledger", {
  id: text("id").primaryKey().$defaultFn(() => generateId()),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  sessionId: text("session_id").notNull().references(() => classroomSessions.id),
  turnCount: integer("turn_count").notNull(),
  role: text("role", { enum: ["user", "assistant", "director_node_log"] }).notNull(),
  parsedContent: text("parsed_content", { mode: "json" }).$type<ClassroomMemoryContent>(),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
}, (table) => ({
  tenantSessionIdx: index("cls_memory_tenant_session_idx").on(table.tenantId, table.sessionId),
  sessionTurnIdx: index("cls_memory_session_turn_idx").on(table.sessionId, table.turnCount),
}));

// ─── classroom_participants ──────────────────────────────────────────────────

export const classroomParticipants = sqliteTable("domain_classroom_participants", {
  id: text("id").primaryKey().$defaultFn(() => generateId()),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  sessionId: text("session_id").notNull().references(() => classroomSessions.id),
  userId: text("user_id").notNull().references(() => users.id),
  role: text("role", { enum: ["student", "human_observer"] }).notNull(),
  engagementScore: real("engagement_score").default(0),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
}, (table) => ({
  tenantSessionIdx: index("cls_part_tenant_session_idx").on(table.tenantId, table.sessionId),
  sessionUserIdx: index("cls_part_session_user_idx").on(table.sessionId, table.userId),
}));

// ─── classroom_whiteboard_state ──────────────────────────────────────────────

export const classroomWhiteboardState = sqliteTable("domain_classroom_whiteboard_state", {
  id: text("id").primaryKey().$defaultFn(() => generateId()),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  sessionId: text("session_id").notNull().references(() => classroomSessions.id),
  timeline: text("timeline", { mode: "json" }).$type<ClassroomWhiteboardTimeline>(),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
}, (table) => ({
  tenantSessionIdx: index("cls_wb_tenant_session_idx").on(table.tenantId, table.sessionId),
}));
