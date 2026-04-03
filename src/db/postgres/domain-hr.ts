/**
 * ARCHITECTURE OVERVIEW: Human Resources & Payroll Domain
 * 
 * Purpose:
 * Decouples employee payroll and leave metadata from the core `accounts` table. 
 * Utilizes native relational constraints connecting `department_id` and `designation_id` 
 * directly to the identity layer, handling automated payroll generation securely.
 * 
 * Replaces Legacy Tables:
 * - sm_leave_requests / sm_leave_types / sm_leave_defines / sm_leave_deduction_infos
 * - sm_hr_payroll_generates / sm_hr_salary_templates
 * - sm_human_departments
 * - sm_designations
 */
import { pgSchema, text, doublePrecision, integer, uuid, numeric, smallint, timestamp, jsonb, boolean, date, varchar, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { users, tenants, academicYears, accounts } from "./domain-core";

// Extracts HR-specific data from sm_staffs
export const hrSchema = pgSchema("domain_hr");


export const hrDepartments = hrSchema.table("departments", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  departmentName: varchar("department_name", { length: 191 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const hrDesignations = hrSchema.table("designations", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  designationName: varchar("designation_name", { length: 191 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Leave Types — configurable leave categories (replaces smLeaveTypes)
export const leaveTypes = hrSchema.table("leave_types", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  name: varchar("name", { length: 100 }).notNull(), // medical, casual, maternity, etc.
  totalDays: integer("total_days"),  // annual allowance
  activeStatus: smallint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const hrLeaveRequests = hrSchema.table("leave_requests", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  userId: uuid("user_id").notNull().references(() => users.id), // Staff persona
  leaveTypeId: uuid("leave_type_id").references(() => leaveTypes.id),
  leaveType: varchar("leave_type", { length: 100 }).notNull(), // kept for flexibility
  applyDate: date("apply_date", { mode: "string" }).notNull(),
  fromDate: date("from_date", { mode: "string" }).notNull(),
  toDate: date("to_date", { mode: "string" }).notNull(),
  reason: text("reason"),
  status: varchar("status", { length: 150 }).notNull().default("pending"),
  approvedBy: uuid("approved_by").references(() => users.id), // Staff persona
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
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

export const salaryTemplates = hrSchema.table("salary_templates", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  name: varchar("name", { length: 200 }).notNull(),
  components: jsonb("components").$type<SalaryComponent[]>().notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  tenantIdx: index("st_tenant_idx").on(table.tenantId),
}));

export const payrollRuns = hrSchema.table("payroll_runs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  userId: uuid("user_id").notNull().references(() => users.id), // Staff persona
  salaryTemplateId: uuid("salary_template_id").references(() => salaryTemplates.id),
  payrollMonth: varchar("payroll_month", { length: 20 }).notNull(),
  payrollYear: varchar("payroll_year", { length: 20 }).notNull(),
  basicSalary: numeric("basic_salary", { precision: 12, scale: 2 }).notNull(),
  totalEarnings: numeric("total_earnings", { precision: 12, scale: 2 }).notNull(),
  totalDeductions: numeric("total_deductions", { precision: 12, scale: 2 }).notNull(),
  netSalary: numeric("net_salary", { precision: 12, scale: 2 }).notNull(),
  status: varchar("status", { length: 150 }).notNull().default("draft"),
  paymentGenerated: smallint("payment_generated").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
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

export const staffEvaluations = hrSchema.table("staff_evaluations", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  userId: uuid("user_id").notNull().references(() => users.id), // Staff being evaluated
  evaluatorId: uuid("evaluator_id").notNull().references(() => users.id), // Staff persona
  evaluationDate: date("evaluation_date", { mode: "string" }).notNull(),
  overallScore: numeric("overall_score", { precision: 5, scale: 2 }),
  remarks: text("remarks"),
  metadata: jsonb("metadata").$type<EvaluationMetadata>(),
  academicId: uuid("academic_id").references(() => academicYears.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  userIdx: index("eval_user_idx").on(table.userId),
  tenantAcademicIdx: index("eval_tenant_academic_idx").on(table.tenantId, table.academicId),
}));
