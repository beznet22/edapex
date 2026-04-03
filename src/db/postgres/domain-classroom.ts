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
  pgSchema,
  text,
  doublePrecision,
  integer,
  uuid,
  timestamp,
  jsonb,
  boolean,
  varchar,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

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

// ─── Postgres Schema Namespace ───────────────────────────────────────────────

export const classroomSchema = pgSchema("domain_classroom");

// ─── classroom_sessions ──────────────────────────────────────────────────────

export const classroomSessions = classroomSchema.table(
  "sessions",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    courseId: uuid("course_id").references(() => lmsCourses.id),
    directorAgentId: uuid("director_agent_id").references(() => aiAgents.id),
    status: varchar("status", { length: 150 }).notNull().default("scheduled"),
    metadata: jsonb("metadata").$type<ClassroomSessionMetadata>(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    tenantIdx: index("cls_session_tenant_idx").on(table.tenantId),
    tenantStatusIdx: index("cls_session_tenant_status_idx").on(table.tenantId, table.status),
  }),
);

// ─── classroom_memory_ledger ─────────────────────────────────────────────────

export const classroomMemoryLedger = classroomSchema.table(
  "memory_ledger",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => classroomSessions.id),
    parentLedgerId: uuid("parent_ledger_id"), // Session lineage for compacted chains
    turnCount: integer("turn_count").notNull(),
    role: varchar("role", { length: 150 }).notNull(),
    parsedContent: jsonb("parsed_content").$type<ClassroomMemoryContent>(),
    isCompacted: boolean("is_compacted").default(false), // Memory ledger compaction flag
    createdAt: timestamp("created_at").defaultNow(),
  },
  (table) => ({
    tenantSessionIdx: index("cls_memory_tenant_session_idx").on(table.tenantId, table.sessionId),
    sessionTurnIdx: index("cls_memory_session_turn_idx").on(table.sessionId, table.turnCount),
  }),
);

// ─── classroom_participants ──────────────────────────────────────────────────

export const classroomParticipants = classroomSchema.table(
  "participants",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => classroomSessions.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    role: varchar("role", { length: 150 }).notNull(),
    engagementScore: doublePrecision("engagement_score").default(0),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    tenantSessionIdx: index("cls_part_tenant_session_idx").on(table.tenantId, table.sessionId),
    sessionUserIdx: index("cls_part_session_user_idx").on(table.sessionId, table.userId),
  }),
);

// ─── classroom_whiteboard_state ──────────────────────────────────────────────

export const classroomWhiteboardState = classroomSchema.table(
  "whiteboard_state",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => classroomSessions.id),
    timeline: jsonb("timeline").$type<ClassroomWhiteboardTimeline>(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow(),
  },
  (table) => ({
    tenantSessionIdx: index("cls_wb_tenant_session_idx").on(table.tenantId, table.sessionId),
  }),
);
