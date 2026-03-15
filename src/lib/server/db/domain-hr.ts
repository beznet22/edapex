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
} from "drizzle-orm/mysql-core";

import { accounts } from "./domain-core";

// Extracts HR-specific data from sm_staffs

export const hrDepartments = mysqlTable("edx_departments", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull(),
  departmentName: varchar("department_name", { length: 191 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const hrDesignations = mysqlTable("edx_designations", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull(),
  designationName: varchar("designation_name", { length: 191 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const hrLeaveRequests = mysqlTable("edx_leave_requests", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull(),
  accountId: int("account_id").notNull().references(() => accounts.id), // Staff
  leaveType: varchar("leave_type", { length: 100 }).notNull(), // medical, casual, maternity
  applyDate: date("apply_date", { mode: "string" }).notNull(),
  fromDate: date("from_date", { mode: "string" }).notNull(),
  toDate: date("to_date", { mode: "string" }).notNull(),
  reason: text("reason"),
  status: mysqlEnum("status", ["pending", "approved", "rejected"]).notNull().default("pending"),
  approvedBy: int("approved_by").references(() => accounts.id),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  accountIdx: index("leave_account_idx").on(table.accountId),
}));

export const payrollRuns = mysqlTable("edx_payroll_runs", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull(),
  accountId: int("account_id").notNull().references(() => accounts.id), // Staff
  payrollMonth: varchar("payroll_month", { length: 20 }).notNull(),
  payrollYear: varchar("payroll_year", { length: 20 }).notNull(),
  basicSalary: decimal("basic_salary", { precision: 12, scale: 2 }).notNull(),
  totalEarnings: decimal("total_earnings", { precision: 12, scale: 2 }).notNull(),
  totalDeductions: decimal("total_deductions", { precision: 12, scale: 2 }).notNull(),
  netSalary: decimal("net_salary", { precision: 12, scale: 2 }).notNull(),
  paymentGenerated: tinyint("payment_generated").default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  payrollAccountIdx: index("pr_acct_period_idx").on(table.accountId, table.payrollMonth, table.payrollYear),
}));
