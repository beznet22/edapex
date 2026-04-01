import { pgSchema, text, doublePrecision, integer, serial, timestamp, jsonb, smallint, varchar, index, date, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { accounts, tenants, users, academicYears } from "./domain-core";
import { lmsCourses, lmsLessons, lmsSubmissions } from "./domain-lms";
import { subjects } from "./domain-academic";
import { ledgerEntries } from "./domain-finance";

export const homeschoolSchema = pgSchema("domain_homeschool");

export const homeschoolSubscriptions = homeschoolSchema.table("homeschool_subscriptions", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  academicId: uuid("academic_id").notNull().references(() => academicYears.id),
  plan: varchar("plan", { length: 150 }).notNull(),
  status: varchar("status", { length: 50 }).default("active").notNull(),
  renewsAt: timestamp("renews_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  tenantIdx: index("hsub_tenant_idx").on(table.tenantId),
}));

export const revenueShares = homeschoolSchema.table("revenue_shares", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  facilitatorId: uuid("facilitator_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  period: varchar("period", { length: 20 }).notNull(), 
  baseAmount: doublePrecision("base_amount").default(0).notNull(),
  performanceBonus: doublePrecision("performance_bonus").default(0).notNull(),
  totalEarned: doublePrecision("total_earned").default(0).notNull(),
  status: varchar("status", { length: 50 }).default("pending").notNull(),
  ledgerEntryId: uuid("ledger_entry_id").references(() => ledgerEntries.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  facilPeriodIdx: index("rev_facil_period_idx").on(table.tenantId, table.facilitatorId, table.period),
}));

export const homeschoolPortfolios = homeschoolSchema.table("homeschool_portfolios", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }), 
  academicId: uuid("academic_id").notNull().references(() => academicYears.id),
  courseId: uuid("course_id").references(() => lmsCourses.id),
  submissionId: uuid("submission_id").references(() => lmsSubmissions.id),
  evidenceType: varchar("evidence_type", { length: 100 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  attachmentUrl: varchar("attachment_url", { length: 500 }),
  recordedDate: date("recorded_date", { mode: "string" }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  userTenantIdx: index("hs_port_user_tenant_idx").on(table.userId, table.tenantId),
}));

export const homeschoolSchedules = homeschoolSchema.table("homeschool_schedules", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }), 
  academicId: uuid("academic_id").notNull().references(() => academicYears.id),
  subjectId: uuid("subject_id").references(() => subjects.id),
  lessonId: uuid("lesson_id").references(() => lmsLessons.id),
  title: varchar("title", { length: 255 }).notNull(),
  scheduleDate: date("schedule_date", { mode: "string" }).notNull(),
  startTime: varchar("start_time", { length: 20 }),
  endTime: varchar("end_time", { length: 20 }),
  status: varchar("status", { length: 100 }).default("planned").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  userDateIdx: index("hs_sched_user_date_idx").on(table.userId, table.scheduleDate),
}));
