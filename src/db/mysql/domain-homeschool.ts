import { mysqlTable, varchar, int, timestamp, mysqlEnum, date, json, tinyint, index, double, text } from "drizzle-orm/mysql-core";
import { accounts, tenants, users, academicYears } from "./domain-core";
import { lmsCourses, lmsLessons, lmsSubmissions } from "./domain-lms";
import { subjects } from "./domain-academic";
import { ledgerEntries } from "./domain-finance";

export const homeschoolSubscriptions = mysqlTable("homeschool_subscriptions", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  academicId: int("academic_id").notNull().references(() => academicYears.id),
  plan: mysqlEnum("plan", ["basic", "family", "premium", "b2b_micro"]).notNull(),
  status: mysqlEnum("status", ["active", "past_due", "canceled", "trial"]).default("active").notNull(),
  renewsAt: timestamp("renews_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
  tenantIdx: index("hsub_tenant_idx").on(table.tenantId),
}));

export const revenueShares = mysqlTable("revenue_shares", {
  id: int("id").autoincrement().primaryKey(),
  facilitatorId: int("facilitator_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  period: varchar("period", { length: 20 }).notNull(), // e.g. '2026-03'
  baseAmount: double("base_amount", { precision: 10, scale: 2 }).default(0).notNull(),
  performanceBonus: double("performance_bonus", { precision: 10, scale: 2 }).default(0).notNull(),
  totalEarned: double("total_earned", { precision: 10, scale: 2 }).default(0).notNull(),
  status: mysqlEnum("status", ["pending", "paid"]).default("pending").notNull(),
  ledgerEntryId: int("ledger_entry_id").references(() => ledgerEntries.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
  facilPeriodIdx: index("rev_facil_period_idx").on(table.facilitatorId, table.period),
}));

export const homeschoolPortfolios = mysqlTable("homeschool_portfolios", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  userId: int("user_id").notNull().references(() => users.id, { onDelete: "cascade" }), 
  academicId: int("academic_id").notNull().references(() => academicYears.id),
  courseId: int("course_id").references(() => lmsCourses.id),
  submissionId: int("submission_id").references(() => lmsSubmissions.id),
  evidenceType: mysqlEnum("evidence_type", ["project", "exam", "artwork", "certification"]).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  attachmentUrl: varchar("attachment_url", { length: 500 }),
  recordedDate: date("recorded_date", { mode: "string" }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
  userTenantIdx: index("hs_port_user_tenant_idx").on(table.userId, table.tenantId),
}));

export const homeschoolSchedules = mysqlTable("homeschool_schedules", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  userId: int("user_id").notNull().references(() => users.id, { onDelete: "cascade" }), 
  academicId: int("academic_id").notNull().references(() => academicYears.id),
  subjectId: int("subject_id").references(() => subjects.id),
  lessonId: int("lesson_id").references(() => lmsLessons.id),
  title: varchar("title", { length: 255 }).notNull(),
  scheduleDate: date("schedule_date", { mode: "string" }).notNull(),
  startTime: varchar("start_time", { length: 20 }),
  endTime: varchar("end_time", { length: 20 }),
  status: mysqlEnum("status", ["planned", "in_progress", "completed", "skipped"]).default("planned").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
  userDateIdx: index("hs_sched_user_date_idx").on(table.userId, table.scheduleDate),
}));
