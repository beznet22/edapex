/**
 * ARCHITECTURE OVERVIEW: Human Resources & Payroll Domain
 * 
 * Purpose:
 * Decouples employee payroll and leave metadata from the core `edx_accounts` table. 
 * Utilizes native relational constraints connecting `department_id` and `designation_id` 
 * directly to the identity layer, handling automated payroll generation securely.
 * 
 * Replaces Legacy Tables:
 * - sm_leave_requests / sm_leave_types / sm_leave_defines / sm_leave_deduction_infos
 * - sm_hr_payroll_generates / sm_hr_salary_templates
 * - sm_human_departments
 * - sm_designations
 */
import {

  mysqlTable,
  varchar,
  int,
  timestamp,
  mysqlEnum,
  decimal,
  date,
  text,
  tinyint,
  index,
  json,
} from "drizzle-orm/mysql-core";

import { users, tenants, academicYears, accounts } from "./domain-core";

// Extracts HR-specific data from sm_staffs

export const hrDepartments = mysqlTable("departments", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id),
  departmentName: varchar("department_name", { length: 191 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const hrDesignations = mysqlTable("designations", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id),
  designationName: varchar("designation_name", { length: 191 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

// Leave Types — configurable leave categories (replaces smLeaveTypes)
export const leaveTypes = mysqlTable("leave_types", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id),
  name: varchar("name", { length: 100 }).notNull(), // medical, casual, maternity, etc.
  totalDays: int("total_days"),  // annual allowance
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const hrLeaveRequests = mysqlTable("leave_requests", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id),
  userId: int("user_id").notNull().references(() => users.id), // Staff persona
  leaveTypeId: int("leave_type_id").references(() => leaveTypes.id),
  leaveType: varchar("leave_type", { length: 100 }).notNull(), // kept for flexibility
  applyDate: date("apply_date", { mode: "string" }).notNull(),
  fromDate: date("from_date", { mode: "string" }).notNull(),
  toDate: date("to_date", { mode: "string" }).notNull(),
  reason: text("reason"),
  status: mysqlEnum("status", ["pending", "approved", "rejected"]).notNull().default("pending"),
  approvedBy: int("approved_by").references(() => users.id), // Staff persona
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
  userIdx: index("leave_user_idx").on(table.userId),
  tenantStatusIdx: index("leave_tenant_status_idx").on(table.tenantId, table.status),
}));

// Salary Templates — configurable payroll components (replaces smHrSalaryTemplates)
export type SalaryComponent = {
  name: string;
  type: "earning" | "deduction";
  amount: number;
  isPercentage?: boolean;  // if true, amount is % of basic
};

export const salaryTemplates = mysqlTable("salary_templates", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id),
  name: varchar("name", { length: 200 }).notNull(),
  components: json("components").$type<SalaryComponent[]>().notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
  tenantIdx: index("st_tenant_idx").on(table.tenantId),
}));

export const payrollRuns = mysqlTable("payroll_runs", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id),
  userId: int("user_id").notNull().references(() => users.id), // Staff persona
  salaryTemplateId: int("salary_template_id").references(() => salaryTemplates.id),
  payrollMonth: varchar("payroll_month", { length: 20 }).notNull(),
  payrollYear: varchar("payroll_year", { length: 20 }).notNull(),
  basicSalary: decimal("basic_salary", { precision: 12, scale: 2 }).notNull(),
  totalEarnings: decimal("total_earnings", { precision: 12, scale: 2 }).notNull(),
  totalDeductions: decimal("total_deductions", { precision: 12, scale: 2 }).notNull(),
  netSalary: decimal("net_salary", { precision: 12, scale: 2 }).notNull(),
  status: mysqlEnum("status", ["draft", "approved", "disbursed", "cancelled"]).notNull().default("draft"),
  paymentGenerated: tinyint("payment_generated").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
  payrollUserIdx: index("pr_user_period_idx").on(table.userId, table.payrollMonth, table.payrollYear),
  tenantStatusIdx: index("pr_tenant_status_idx").on(table.tenantId, table.status),
}));

// --- NEW TABLE ---

// Staff Evaluations — teacher performance evaluations (replaces teacherEvaluations)
export type EvaluationMetadata = {
  criteria?: { name: string; score: number; maxScore: number }[];
  observerNotes?: string;
};

export const staffEvaluations = mysqlTable("staff_evaluations", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id),
  userId: int("user_id").notNull().references(() => users.id), // Staff being evaluated
  evaluatorId: int("evaluator_id").notNull().references(() => users.id), // Staff persona
  evaluationDate: date("evaluation_date", { mode: "string" }).notNull(),
  overallScore: decimal("overall_score", { precision: 5, scale: 2 }),
  remarks: text("remarks"),
  metadata: json("metadata").$type<EvaluationMetadata>(),
  academicId: int("academic_id").references(() => academicYears.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
  userIdx: index("eval_user_idx").on(table.userId),
  tenantAcademicIdx: index("eval_tenant_academic_idx").on(table.tenantId, table.academicId),
}));
