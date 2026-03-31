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
import { unique,  sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";

import { users, tenants, academicYears, accounts } from "./domain-core";

// Extracts HR-specific data from sm_staffs

export const hrDepartments = sqliteTable("domain_hr_departments", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  departmentName: text("department_name", { length: 191 }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
});

export const hrDesignations = sqliteTable("domain_hr_designations", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  designationName: text("designation_name", { length: 191 }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
});

// Leave Types — configurable leave categories (replaces smLeaveTypes)
export const leaveTypes = sqliteTable("domain_hr_leave_types", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  name: text("name", { length: 100 }).notNull(), // medical, casual, maternity, etc.
  totalDays: integer("total_days"),  // annual allowance
  activeStatus: integer("active_status").default(1).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
});

export const hrLeaveRequests = sqliteTable("domain_hr_leave_requests", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  userId: integer("user_id").notNull().references(() => users.id), // Staff persona
  leaveTypeId: integer("leave_type_id").references(() => leaveTypes.id),
  leaveType: text("leave_type", { length: 100 }).notNull(), // kept for flexibility
  applyDate: text("apply_date").notNull(),
  fromDate: text("from_date").notNull(),
  toDate: text("to_date").notNull(),
  reason: text("reason"),
  status: text("status", { enum: ["pending", "approved", "rejected"] }).notNull().default("pending"),
  approvedBy: integer("approved_by").references(() => users.id), // Staff persona
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
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

export const salaryTemplates = sqliteTable("domain_hr_salary_templates", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  name: text("name", { length: 200 }).notNull(),
  components: text("components", { mode: "json" }).$type<SalaryComponent[]>().notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
}, (table) => ({
  tenantIdx: index("st_tenant_idx").on(table.tenantId),
}));

export const payrollRuns = sqliteTable("domain_hr_payroll_runs", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  userId: integer("user_id").notNull().references(() => users.id), // Staff persona
  salaryTemplateId: integer("salary_template_id").references(() => salaryTemplates.id),
  payrollMonth: text("payroll_month", { length: 20 }).notNull(),
  payrollYear: text("payroll_year", { length: 20 }).notNull(),
  basicSalary: real("basic_salary").notNull(),
  totalEarnings: real("total_earnings").notNull(),
  totalDeductions: real("total_deductions").notNull(),
  netSalary: real("net_salary").notNull(),
  status: text("status", { enum: ["draft", "approved", "disbursed", "cancelled"] }).notNull().default("draft"),
  paymentGenerated: integer("payment_generated").default(0),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
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

export const staffEvaluations = sqliteTable("domain_hr_staff_evaluations", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  userId: integer("user_id").notNull().references(() => users.id), // Staff being evaluated
  evaluatorId: integer("evaluator_id").notNull().references(() => users.id), // Staff persona
  evaluationDate: text("evaluation_date").notNull(),
  overallScore: real("overall_score"),
  remarks: text("remarks"),
  metadata: text("metadata", { mode: "json" }).$type<EvaluationMetadata>(),
  academicId: integer("academic_id").references(() => academicYears.id),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
}, (table) => ({
  userIdx: index("eval_user_idx").on(table.userId),
  tenantAcademicIdx: index("eval_tenant_academic_idx").on(table.tenantId, table.academicId),
}));
