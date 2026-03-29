/**
 * ARCHITECTURE OVERVIEW: Finance & Accounting Domain
 * 
 * Purpose:
 * Overhauls the cashflow architecture employing a robust `edx_ledger_entries` model enforcing 
 * transactional duality (credits/debits). Consolidates disparate fee and expense tables onto a 
 * unified chart of accounts linked tightly across the multi-tenant `account_id` space.
 * 
 * Replaces Legacy Tables:
 * - sm_fees_masters / sm_fees_groups / sm_fees_types / fm_fees_groups / fm_fees_types
 * - sm_fees_assigns / sm_fees_payments / sm_bank_payment_slips
 * - sm_add_incomes / sm_add_expenses / sm_expense_heads / sm_income_heads
 * - sm_chart_of_accounts / transcations / wallet_transactions
 */
import {

  mysqlTable,
  varchar,
  int,
  timestamp,
  mysqlEnum,
  decimal,
  json,
  index,
  tinyint,
  text,
  date,
} from "drizzle-orm/mysql-core";

import { users, tenants, academicYears, accounts } from "./domain-core";
import { classes, enrollments, sections } from "./domain-academic";

// Universal Ledger — replaces 9 parallel financial tables

export type LedgerMetadata = {
  paymentMethod?: string;
  receiptNo?: string;
  notes?: string;
  bankId?: number;
};

export const ledgerEntries = mysqlTable("ledger_entries", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id),
  transactionType: mysqlEnum("transaction_type", [
    "fee_payment", "fee_waiver", "salary", "expense", "income", "refund", "wallet_topup"
  ]).notNull(),
  // Double-entry accounting: every transaction has a direction
  direction: mysqlEnum("direction", ["credit", "debit"]).notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  userId: int("user_id").references(() => users.id), // Participant Persona
  enrollmentId: int("enrollment_id"), // Student record ID if applicable
  referenceType: varchar("reference_type", { length: 50 }),
  referenceId: int("reference_id"),
  metadata: json("metadata").$type<LedgerMetadata>(),
  postedAt: timestamp("posted_at").defaultNow(),
  createdBy: int("created_by").references(() => users.id), // Staff Persona
  academicId: int("academic_id").references(() => academicYears.id),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
  tenantIdx: index("ledger_tenant_idx").on(table.tenantId),
  userIdx: index("ledger_user_idx").on(table.userId),
  typeIdx: index("ledger_type_idx").on(table.tenantId, table.transactionType),
  postedAtIdx: index("ledger_posted_idx").on(table.tenantId, table.postedAt),
}));

export const feeGroups = mysqlTable("fee_groups", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id),
  name: varchar("name", { length: 200 }).notNull(),
  description: varchar("description", { length: 500 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const feeTypes = mysqlTable("fee_types", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id),
  feeGroupId: int("fee_group_id").references(() => feeGroups.id),
  name: varchar("name", { length: 200 }).notNull(),
  description: varchar("description", { length: 500 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const feeMasters = mysqlTable("fee_masters", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id),
  feeTypeId: int("fee_type_id").notNull().references(() => feeTypes.id),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  academicId: int("academic_id").notNull().references(() => academicYears.id),
  dueDate: timestamp("due_date"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const bankAccounts = mysqlTable("bank_accounts", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id),
  bankName: varchar("bank_name", { length: 255 }).notNull(),
  accountName: varchar("account_name", { length: 255 }).notNull(),
  accountNumber: varchar("account_number", { length: 100 }).notNull(),
  accountType: varchar("account_type", { length: 50 }),
  bankAddress: varchar("bank_address", { length: 500 }),
  openingBalance: decimal("opening_balance", { precision: 12, scale: 2 }).default("0.00"),
  currentBalance: decimal("current_balance", { precision: 12, scale: 2 }).default("0.00"),
  activeStatus: tinyint("active_status").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

// --- NEW TABLES ---

// Fee Assignments — which fees apply to which students (replaces smFeesAssigns)
export const feeAssignments = mysqlTable("fee_assignments", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id),
  feeMasterId: int("fee_master_id").notNull().references(() => feeMasters.id),
  userId: int("user_id").notNull().references(() => users.id), // Student Persona
  enrollmentId: int("enrollment_id").references(() => enrollments.id),
  classId: int("class_id").references(() => classes.id),
  sectionId: int("section_id").references(() => sections.id),
  assignedAmount: decimal("assigned_amount", { precision: 12, scale: 2 }).notNull(),
  paidAmount: decimal("paid_amount", { precision: 12, scale: 2 }).default("0.00"),
  waivedAmount: decimal("waived_amount", { precision: 12, scale: 2 }).default("0.00"),
  status: mysqlEnum("status", ["pending", "partial", "paid", "overdue", "waived"]).notNull().default("pending"),
  academicId: int("academic_id").notNull().references(() => academicYears.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
  userFeeIdx: index("fa_user_fee_idx").on(table.userId, table.feeMasterId),
  tenantStatusIdx: index("fa_tenant_status_idx").on(table.tenantId, table.status),
}));

// Fee Discounts — discount definitions (replaces smFeesDiscounts)
export const feeDiscounts = mysqlTable("fee_discounts", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id),
  name: varchar("name", { length: 200 }).notNull(),
  discountType: mysqlEnum("discount_type", ["percentage", "fixed"]).notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  description: varchar("description", { length: 500 }),
  academicId: int("academic_id").references(() => academicYears.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

// Fee Installments — payment plans (replaces directFeesInstallments)
export const feeInstallments = mysqlTable("fee_installments", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id),
  feeAssignmentId: int("fee_assignment_id").notNull().references(() => feeAssignments.id),
  title: varchar("title", { length: 200 }).notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  dueDate: date("due_date", { mode: "string" }).notNull(),
  paidAmount: decimal("paid_amount", { precision: 12, scale: 2 }).default("0.00"),
  status: mysqlEnum("status", ["pending", "partial", "paid", "overdue"]).notNull().default("pending"),
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
  assignmentIdx: index("fi_assignment_idx").on(table.feeAssignmentId),
  dueDateIdx: index("fi_due_date_idx").on(table.tenantId, table.dueDate),
}));

// Invoices — generated invoices (replaces multiple invoice tables)
export type InvoiceMetadata = {
  items?: { description: string; amount: number }[];
  notes?: string;
};

export const invoices = mysqlTable("invoices", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id),
  invoiceNumber: varchar("invoice_number", { length: 50 }).notNull(),
  userId: int("user_id").notNull().references(() => users.id), // Student Persona
  totalAmount: decimal("total_amount", { precision: 12, scale: 2 }).notNull(),
  paidAmount: decimal("paid_amount", { precision: 12, scale: 2 }).default("0.00"),
  status: mysqlEnum("status", ["draft", "issued", "paid", "partial", "overdue", "cancelled"]).notNull().default("draft"),
  issuedAt: timestamp("issued_at"),
  dueDate: date("due_date", { mode: "string" }),
  metadata: json("metadata").$type<InvoiceMetadata>(),
  academicId: int("academic_id").references(() => academicYears.id),
  createdBy: int("created_by").references(() => users.id), // Staff Persona
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
  userIdx: index("inv_user_idx").on(table.userId),
  tenantStatusIdx: index("inv_tenant_status_idx").on(table.tenantId, table.status),
  invoiceNoIdx: index("inv_number_idx").on(table.tenantId, table.invoiceNumber),
}));
