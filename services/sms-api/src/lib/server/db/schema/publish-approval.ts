import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

import { statusCheck } from "./common";

const APPROVAL_STATUS = ["pending", "approved", "denied"] as const;

/**
 * A publish that a teacher may not perform alone.
 *
 * The row is the request, not the result: approving it calls the same publish
 * service the direct route calls, so there is one implementation of "publish"
 * and the gate cannot drift from it.
 */
export const publishApprovals = sqliteTable(
  "publish_approvals",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    schoolId: integer("school_id").notNull(),
    examId: integer("exam_id").notNull(),
    requestedBy: integer("requested_by").notNull(),
    studentIdsJson: text("student_ids_json").notNull(),
    status: text("status", { enum: APPROVAL_STATUS }).notNull().default("pending"),
    decidedBy: integer("decided_by"),
    decidedAt: integer("decided_at"),
    note: text("note"),
    createdAt: integer("created_at").notNull()
  },
  (table) => [
    index("publish_approvals_school_status_index").on(table.schoolId, table.status),
    statusCheck("publish_approvals_status_check", table.status, APPROVAL_STATUS)
  ]
);

export const publishApprovalTables = [publishApprovals] as const;
