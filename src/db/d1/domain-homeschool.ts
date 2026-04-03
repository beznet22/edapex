import { sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";
import { accounts, tenants, users, academicYears } from "./domain-core";
import { lmsCourses, lmsLessons, lmsSubmissions } from "./domain-lms";
import { subjects } from "./domain-academic";
import { ledgerEntries } from "./domain-finance";

export const homeschoolSubscriptions = sqliteTable("subscriptions", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  academicId: integer("academic_id").notNull().references(() => academicYears.id),
  plan: text("plan", { enum: ["basic", "family", "premium", "b2b_micro"] }).notNull(),
  status: text("status", { enum: ["active", "past_due", "canceled", "trial"] }).default("active").notNull(),
  renewsAt: integer("renews_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
}, (table) => ({
  tenantIdx: index("hsub_tenant_idx").on(table.tenantId),
}));

export const revenueShares = sqliteTable("revenue_shares", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  facilitatorId: integer("facilitator_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  period: text("period", { length: 20 }).notNull(), 
  baseAmount: real("base_amount").default(0).notNull(),
  performanceBonus: real("performance_bonus").default(0).notNull(),
  totalEarned: real("total_earned").default(0).notNull(),
  status: text("status", { enum: ["pending", "paid"] }).default("pending").notNull(),
  ledgerEntryId: integer("ledger_entry_id").references(() => ledgerEntries.id),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
}, (table) => ({
  facilPeriodIdx: index("rev_facil_period_idx").on(table.facilitatorId, table.period),
}));

export const homeschoolPortfolios = sqliteTable("portfolios", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }), 
  academicId: integer("academic_id").notNull().references(() => academicYears.id),
  courseId: integer("course_id").references(() => lmsCourses.id),
  submissionId: integer("submission_id").references(() => lmsSubmissions.id),
  evidenceType: text("evidence_type", { enum: ["project", "exam", "artwork", "certification"] }).notNull(),
  title: text("title", { length: 255 }).notNull(),
  description: text("description"),
  attachmentUrl: text("attachment_url", { length: 500 }),
  recordedDate: text("recorded_date").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
}, (table) => ({
  userTenantIdx: index("hs_port_user_tenant_idx").on(table.userId, table.tenantId),
}));

export const homeschoolSchedules = sqliteTable("schedules", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }), 
  academicId: integer("academic_id").notNull().references(() => academicYears.id),
  subjectId: integer("subject_id").references(() => subjects.id),
  lessonId: integer("lesson_id").references(() => lmsLessons.id),
  title: text("title", { length: 255 }).notNull(),
  scheduleDate: text("schedule_date").notNull(),
  startTime: text("start_time", { length: 20 }),
  endTime: text("end_time", { length: 20 }),
  status: text("status", { enum: ["planned", "in_progress", "completed", "skipped"] }).default("planned").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
}, (table) => ({
  userDateIdx: index("hs_sched_user_date_idx").on(table.userId, table.scheduleDate),
}));
