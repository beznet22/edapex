import {
  mysqlTable,
  int,
  timestamp,
  mysqlEnum,
  date,
  json,
  index,
} from "drizzle-orm/mysql-core";

import { accounts } from "./domain-core";

export type AttendanceMetadata = {
  daysOpened?: number;
  daysAbsent?: number;
  daysPresent?: number;
  notes?: string;
  leaveRequestId?: number;
};

// Universal Attendance — replaces 4 parallel tables
export const attendances = mysqlTable("edx_attendances", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull(),
  accountId: int("account_id").notNull().references(() => accounts.id),
  actorType: mysqlEnum("actor_type", ["student", "staff"]).notNull(),
  scopeType: mysqlEnum("scope_type", ["daily", "subject", "term_summary"]).notNull(),
  scopeRefId: int("scope_ref_id"),  // subject_id or exam_type_id
  attendanceDate: date("attendance_date", { mode: "string" }),
  status: mysqlEnum("status", ["present", "absent", "late", "half_day", "excused"]).notNull(),
  metadata: json("metadata").$type<AttendanceMetadata>(),  // { days_opened, days_absent, days_present, notes }
  recordedBy: int("recorded_by"),
  academicId: int("academic_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
  personDateIdx: index("att_person_date_idx").on(table.accountId, table.attendanceDate),
  tenantDateIdx: index("att_tenant_date_idx").on(table.tenantId, table.attendanceDate),
  tenantAcademicIdx: index("att_tenant_academic_idx").on(table.tenantId, table.academicId),
}));
