/**
 * ARCHITECTURE OVERVIEW: Finance & Accounting Domain
 * 
 * Purpose:
 * Overhauls the cashflow architecture employing a robust `ledger_entries` model enforcing 
 * transactional duality (credits/debits). Consolidates disparate fee and expense tables onto a 
 * unified chart of accounts linked tightly across the multi-tenant `account_id` space.
 * 
 * Replaces Legacy Tables:
 * - sm_fees_masters / sm_fees_groups / sm_fees_types / fm_fees_groups / fm_fees_types
 * - sm_fees_assigns / sm_fees_payments / sm_bank_payment_slips
 * - sm_add_incomes / sm_add_expenses / sm_expense_heads / sm_income_heads
 * - sm_chart_of_accounts / transcations / wallet_transactions
 */
import { unique,  sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";

import { users, tenants, academicYears, accounts } from "./domain-core";
import { classes, enrollments, sections } from "./domain-academic";

// Universal Ledger — replaces 9 parallel financial tables

export type LedgerMetadata = {
  paymentMethod?: string;
  receiptNo?: string;
  notes?: string;
  bankId?: number;
};

export const ledgerEntries = sqliteTable("ledger_entries", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  transactionType: text("transaction_type", { enum: [
    "fee_payment", "fee_waiver", "salary", "expense", "income", "refund", "wallet_topup"
  ] }).notNull(),
  // Double-entry accounting: every transaction has a direction
  direction: text("direction", { enum: ["credit", "debit"] }).notNull(),
  amount: real("amount").notNull(),
  userId: integer("user_id").references(() => users.id), // Participant Persona
  enrollmentId: integer("enrollment_id"), // Student record ID if applicable
  referenceType: text("reference_type", { length: 50 }),
  referenceId: integer("reference_id"),
  metadata: text("metadata", { mode: "json" }).$type<LedgerMetadata>(),
  postedAt: integer("posted_at", { mode: "timestamp" }).defaultNow(),
  createdBy: integer("created_by").references(() => users.id), // Staff Persona
  academicId: integer("academic_id").references(() => academicYears.id),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
}, (table) => ({
  tenantIdx: index("ledger_tenant_idx").on(table.tenantId),
  userIdx: index("ledger_user_idx").on(table.userId),
  typeIdx: index("ledger_type_idx").on(table.tenantId, table.transactionType),
  postedAtIdx: index("ledger_posted_idx").on(table.tenantId, table.postedAt),
}));

export const feeGroups = sqliteTable("fee_groups", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  name: text("name", { length: 200 }).notNull(),
  description: text("description", { length: 500 }),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
});

export const feeTypes = sqliteTable("fee_types", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  feeGroupId: integer("fee_group_id").references(() => feeGroups.id),
  name: text("name", { length: 200 }).notNull(),
  description: text("description", { length: 500 }),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
});

export const feeMasters = sqliteTable("fee_masters", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  feeTypeId: integer("fee_type_id").notNull().references(() => feeTypes.id),
  amount: real("amount").notNull(),
  academicId: integer("academic_id").notNull().references(() => academicYears.id),
  dueDate: integer("due_date", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
});

export const bankAccounts = sqliteTable("bank_accounts", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  bankName: text("bank_name", { length: 255 }).notNull(),
  accountName: text("account_name", { length: 255 }).notNull(),
  accountNumber: text("account_number", { length: 100 }).notNull(),
  accountType: text("account_type", { length: 50 }),
  bankAddress: text("bank_address", { length: 500 }),
  openingBalance: real("opening_balance").default(0.00),
  currentBalance: real("current_balance").default(0.00),
  activeStatus: integer("active_status").notNull().default(1),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
});

// --- NEW TABLES ---

// Fee Assignments — which fees apply to which students (replaces smFeesAssigns)
export const feeAssignments = sqliteTable("fee_assignments", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  feeMasterId: integer("fee_master_id").notNull().references(() => feeMasters.id),
  userId: integer("user_id").notNull().references(() => users.id), // Student Persona
  enrollmentId: integer("enrollment_id").references(() => enrollments.id),
  classId: integer("class_id").references(() => classes.id),
  sectionId: integer("section_id").references(() => sections.id),
  assignedAmount: real("assigned_amount").notNull(),
  paidAmount: real("paid_amount").default(0.00),
  waivedAmount: real("waived_amount").default(0.00),
  status: text("status", { enum: ["pending", "partial", "paid", "overdue", "waived"] }).notNull().default("pending"),
  academicId: integer("academic_id").notNull().references(() => academicYears.id),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
}, (table) => ({
  userFeeIdx: index("fa_user_fee_idx").on(table.userId, table.feeMasterId),
  tenantStatusIdx: index("fa_tenant_status_idx").on(table.tenantId, table.status),
}));

// Fee Discounts — discount definitions (replaces smFeesDiscounts)
export const feeDiscounts = sqliteTable("fee_discounts", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  name: text("name", { length: 200 }).notNull(),
  discountType: text("discount_type", { enum: ["percentage", "fixed"] }).notNull(),
  amount: real("amount").notNull(),
  description: text("description", { length: 500 }),
  academicId: integer("academic_id").references(() => academicYears.id),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
});

// Fee Installments — payment plans (replaces directFeesInstallments)
export const feeInstallments = sqliteTable("fee_installments", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  feeAssignmentId: integer("fee_assignment_id").notNull().references(() => feeAssignments.id),
  title: text("title", { length: 200 }).notNull(),
  amount: real("amount").notNull(),
  dueDate: text("due_date").notNull(),
  paidAmount: real("paid_amount").default(0.00),
  status: text("status", { enum: ["pending", "partial", "paid", "overdue"] }).notNull().default("pending"),
  paidAt: integer("paid_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
}, (table) => ({
  assignmentIdx: index("fi_assignment_idx").on(table.feeAssignmentId),
  dueDateIdx: index("fi_due_date_idx").on(table.tenantId, table.dueDate),
}));

// Invoices — generated invoices (replaces multiple invoice tables)
export type InvoiceMetadata = {
  items?: { description: string; amount: number }[];
  notes?: string;
};

export const invoices = sqliteTable("invoices", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  referenceType: text("reference_type", { enum: ["school_fee", "lms_course", "homeschool_subscription", "other"] }).default("school_fee").notNull(),
  referenceId: integer("reference_id"),
  invoiceNumber: text("invoice_number", { length: 50 }).notNull(),
  userId: integer("user_id").notNull().references(() => users.id), // Student Persona
  totalAmount: real("total_amount").notNull(),
  paidAmount: real("paid_amount").default(0.00),
  status: text("status", { enum: ["draft", "issued", "paid", "partial", "overdue", "cancelled"] }).notNull().default("draft"),
  issuedAt: integer("issued_at", { mode: "timestamp" }),
  dueDate: text("due_date"),
  metadata: text("metadata", { mode: "json" }).$type<InvoiceMetadata>(),
  academicId: integer("academic_id").references(() => academicYears.id),
  createdBy: integer("created_by").references(() => users.id), // Staff Persona
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
}, (table) => ({
  userIdx: index("inv_user_idx").on(table.userId),
  tenantStatusIdx: index("inv_tenant_status_idx").on(table.tenantId, table.status),
  invoiceNoIdx: index("inv_number_idx").on(table.tenantId, table.invoiceNumber),
}));

export const paymentGateways = sqliteTable("payment_gateways", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  provider: text("provider", { enum: ["stripe", "paystack", "flutterwave", "paypal"] }).notNull(),
  publicKey: text("public_key", { length: 255 }),
  secretKey: text("secret_key"),
  webhookSecret: text("webhook_secret", { length: 255 }),
  isActive: integer("is_active", { mode: "boolean" }).default(true).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
});

export const onlinePayments = sqliteTable("online_payments", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  userId: integer("user_id").notNull().references(() => users.id),
  gatewayId: integer("gateway_id").notNull().references(() => paymentGateways.id),
  invoiceId: integer("invoice_id").references(() => invoices.id),
  amount: real("amount").notNull(),
  currency: text("currency", { length: 10 }).default("NGN").notNull(),
  providerFee: real("provider_fee").default(0),
  status: text("status", { enum: ["intent_created", "processing", "succeeded", "failed", "refunded"] }).notNull(),
  transactionRef: text("transaction_ref", { length: 255 }).unique().notNull(),
  ledgerEntryId: integer("ledger_entry_id").references(() => ledgerEntries.id),
  metadata: text("metadata", { mode: "json" }),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
});
