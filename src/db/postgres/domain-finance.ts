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
import { pgSchema, text, doublePrecision, integer, serial, numeric, smallint, timestamp, jsonb, boolean, date, varchar, index } from "drizzle-orm/pg-core";

import { users, tenants, academicYears, accounts } from "./domain-core";
import { classes, enrollments, sections } from "./domain-academic";

// Universal Ledger — replaces 9 parallel financial tables

export type LedgerMetadata = {
  paymentMethod?: string;
  receiptNo?: string;
  notes?: string;
  bankId?: number;
};
export const financeSchema = pgSchema("domain_finance");


export const ledgerEntries = financeSchema.table("ledger_entries", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  transactionType: varchar("transaction_type", { length: 150 }).notNull(),
  // Double-entry accounting: every transaction has a direction
  direction: varchar("direction", { length: 150 }).notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  userId: integer("user_id").references(() => users.id), // Participant Persona
  enrollmentId: integer("enrollment_id"), // Student record ID if applicable
  referenceType: varchar("reference_type", { length: 50 }),
  referenceId: integer("reference_id"),
  metadata: jsonb("metadata").$type<LedgerMetadata>(),
  postedAt: timestamp("posted_at").defaultNow(),
  createdBy: integer("created_by").references(() => users.id), // Staff Persona
  academicId: integer("academic_id").references(() => academicYears.id),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  tenantIdx: index("ledger_tenant_idx").on(table.tenantId),
  userIdx: index("ledger_user_idx").on(table.userId),
  typeIdx: index("ledger_type_idx").on(table.tenantId, table.transactionType),
  postedAtIdx: index("ledger_posted_idx").on(table.tenantId, table.postedAt),
}));

export const feeGroups = financeSchema.table("fee_groups", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  name: varchar("name", { length: 200 }).notNull(),
  description: varchar("description", { length: 500 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const feeTypes = financeSchema.table("fee_types", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  feeGroupId: integer("fee_group_id").references(() => feeGroups.id),
  name: varchar("name", { length: 200 }).notNull(),
  description: varchar("description", { length: 500 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const feeMasters = financeSchema.table("fee_masters", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  feeTypeId: integer("fee_type_id").notNull().references(() => feeTypes.id),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  academicId: integer("academic_id").notNull().references(() => academicYears.id),
  dueDate: timestamp("due_date"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const bankAccounts = financeSchema.table("bank_accounts", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  bankName: varchar("bank_name", { length: 255 }).notNull(),
  accountName: varchar("account_name", { length: 255 }).notNull(),
  accountNumber: varchar("account_number", { length: 100 }).notNull(),
  accountType: varchar("account_type", { length: 50 }),
  bankAddress: varchar("bank_address", { length: 500 }),
  openingBalance: numeric("opening_balance", { precision: 12, scale: 2 }).default("0.00"),
  currentBalance: numeric("current_balance", { precision: 12, scale: 2 }).default("0.00"),
  activeStatus: smallint("active_status").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// --- NEW TABLES ---

// Fee Assignments — which fees apply to which students (replaces smFeesAssigns)
export const feeAssignments = financeSchema.table("fee_assignments", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  feeMasterId: integer("fee_master_id").notNull().references(() => feeMasters.id),
  userId: integer("user_id").notNull().references(() => users.id), // Student Persona
  enrollmentId: integer("enrollment_id").references(() => enrollments.id),
  classId: integer("class_id").references(() => classes.id),
  sectionId: integer("section_id").references(() => sections.id),
  assignedAmount: numeric("assigned_amount", { precision: 12, scale: 2 }).notNull(),
  paidAmount: numeric("paid_amount", { precision: 12, scale: 2 }).default("0.00"),
  waivedAmount: numeric("waived_amount", { precision: 12, scale: 2 }).default("0.00"),
  status: varchar("status", { length: 150 }).notNull().default("pending"),
  academicId: integer("academic_id").notNull().references(() => academicYears.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  userFeeIdx: index("fa_user_fee_idx").on(table.userId, table.feeMasterId),
  tenantStatusIdx: index("fa_tenant_status_idx").on(table.tenantId, table.status),
}));

// Fee Discounts — discount definitions (replaces smFeesDiscounts)
export const feeDiscounts = financeSchema.table("fee_discounts", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  name: varchar("name", { length: 200 }).notNull(),
  discountType: varchar("discount_type", { length: 150 }).notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  description: varchar("description", { length: 500 }),
  academicId: integer("academic_id").references(() => academicYears.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Fee Installments — payment plans (replaces directFeesInstallments)
export const feeInstallments = financeSchema.table("fee_installments", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  feeAssignmentId: integer("fee_assignment_id").notNull().references(() => feeAssignments.id),
  title: varchar("title", { length: 200 }).notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  dueDate: date("due_date", { mode: "string" }).notNull(),
  paidAmount: numeric("paid_amount", { precision: 12, scale: 2 }).default("0.00"),
  status: varchar("status", { length: 150 }).notNull().default("pending"),
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  assignmentIdx: index("fi_assignment_idx").on(table.feeAssignmentId),
  dueDateIdx: index("fi_due_date_idx").on(table.tenantId, table.dueDate),
}));

// Invoices — generated invoices (replaces multiple invoice tables)
export type InvoiceMetadata = {
  items?: { description: string; amount: number }[];
  notes?: string;
};

export const invoices = financeSchema.table("invoices", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  invoiceNumber: varchar("invoice_number", { length: 50 }).notNull(),
  userId: integer("user_id").notNull().references(() => users.id), // Student Persona
  totalAmount: numeric("total_amount", { precision: 12, scale: 2 }).notNull(),
  paidAmount: numeric("paid_amount", { precision: 12, scale: 2 }).default("0.00"),
  status: varchar("status", { length: 150 }).notNull().default("draft"),
  issuedAt: timestamp("issued_at"),
  dueDate: date("due_date", { mode: "string" }),
  metadata: jsonb("metadata").$type<InvoiceMetadata>(),
  academicId: integer("academic_id").references(() => academicYears.id),
  createdBy: integer("created_by").references(() => users.id), // Staff Persona
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  userIdx: index("inv_user_idx").on(table.userId),
  tenantStatusIdx: index("inv_tenant_status_idx").on(table.tenantId, table.status),
  invoiceNoIdx: index("inv_number_idx").on(table.tenantId, table.invoiceNumber),
}));
