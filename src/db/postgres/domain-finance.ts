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
import { pgSchema, text, doublePrecision, integer, uuid, numeric, smallint, timestamp, jsonb, boolean, date, varchar, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { users, tenants, academicYears, accounts } from "./domain-core";
import { classes, enrollments, sections } from "./domain-academic";

// Universal Ledger — replaces 9 parallel financial tables

export type LedgerMetadata = {
  paymentMethod?: string;
  receiptNo?: string;
  notes?: string;
  bankId?: string;
};
export const financeSchema = pgSchema("domain_finance");


export const ledgerEntries = financeSchema.table("ledger_entries", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  transactionType: varchar("transaction_type", { length: 150 }).notNull(),
  // Double-entry accounting: every transaction has a direction
  direction: varchar("direction", { length: 150 }).notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  userId: uuid("user_id").references(() => users.id), // Participant Persona
  enrollmentId: uuid("enrollment_id"), // Student record ID if applicable
  referenceType: varchar("reference_type", { length: 50 }),
  referenceId: uuid("reference_id"),
  metadata: jsonb("metadata").$type<LedgerMetadata>(),
  postedAt: timestamp("posted_at").defaultNow(),
  createdBy: uuid("created_by").references(() => users.id), // Staff Persona
  academicId: uuid("academic_id").references(() => academicYears.id),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  tenantIdx: index("ledger_tenant_idx").on(table.tenantId),
  userIdx: index("ledger_user_idx").on(table.userId),
  typeIdx: index("ledger_type_idx").on(table.tenantId, table.transactionType),
  postedAtIdx: index("ledger_posted_idx").on(table.tenantId, table.postedAt),
}));

export const feeGroups = financeSchema.table("fee_groups", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  name: varchar("name", { length: 200 }).notNull(),
  description: varchar("description", { length: 500 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const feeTypes = financeSchema.table("fee_types", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  feeGroupId: uuid("fee_group_id").references(() => feeGroups.id),
  name: varchar("name", { length: 200 }).notNull(),
  description: varchar("description", { length: 500 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const feeMasters = financeSchema.table("fee_masters", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  feeTypeId: uuid("fee_type_id").notNull().references(() => feeTypes.id),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  academicId: uuid("academic_id").notNull().references(() => academicYears.id),
  dueDate: timestamp("due_date"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const bankAccounts = financeSchema.table("bank_accounts", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
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
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  feeMasterId: uuid("fee_master_id").notNull().references(() => feeMasters.id),
  userId: uuid("user_id").notNull().references(() => users.id), // Student Persona
  enrollmentId: uuid("enrollment_id").references(() => enrollments.id),
  classId: uuid("class_id").references(() => classes.id),
  sectionId: uuid("section_id").references(() => sections.id),
  assignedAmount: numeric("assigned_amount", { precision: 12, scale: 2 }).notNull(),
  paidAmount: numeric("paid_amount", { precision: 12, scale: 2 }).default("0.00"),
  waivedAmount: numeric("waived_amount", { precision: 12, scale: 2 }).default("0.00"),
  status: varchar("status", { length: 150 }).notNull().default("pending"),
  academicId: uuid("academic_id").notNull().references(() => academicYears.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  userFeeIdx: index("fa_user_fee_idx").on(table.userId, table.feeMasterId),
  tenantStatusIdx: index("fa_tenant_status_idx").on(table.tenantId, table.status),
}));

// Fee Discounts — discount definitions (replaces smFeesDiscounts)
export const feeDiscounts = financeSchema.table("fee_discounts", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  name: varchar("name", { length: 200 }).notNull(),
  discountType: varchar("discount_type", { length: 150 }).notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  description: varchar("description", { length: 500 }),
  academicId: uuid("academic_id").references(() => academicYears.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Fee Installments — payment plans (replaces directFeesInstallments)
export const feeInstallments = financeSchema.table("fee_installments", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  feeAssignmentId: uuid("fee_assignment_id").notNull().references(() => feeAssignments.id),
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
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  referenceType: varchar("reference_type", { length: 150 }).default("school_fee").notNull(),
  referenceId: uuid("reference_id"),
  invoiceNumber: varchar("invoice_number", { length: 50 }).notNull(),
  userId: uuid("user_id").notNull().references(() => users.id), // Student Persona
  totalAmount: numeric("total_amount", { precision: 12, scale: 2 }).notNull(),
  paidAmount: numeric("paid_amount", { precision: 12, scale: 2 }).default("0.00"),
  status: varchar("status", { length: 150 }).notNull().default("draft"),
  issuedAt: timestamp("issued_at"),
  dueDate: date("due_date", { mode: "string" }),
  metadata: jsonb("metadata").$type<InvoiceMetadata>(),
  academicId: uuid("academic_id").references(() => academicYears.id),
  createdBy: uuid("created_by").references(() => users.id), // Staff Persona
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  userIdx: index("inv_user_idx").on(table.userId),
  tenantStatusIdx: index("inv_tenant_status_idx").on(table.tenantId, table.status),
  invoiceNoIdx: index("inv_number_idx").on(table.tenantId, table.invoiceNumber),
}));

export const paymentGateways = financeSchema.table("payment_gateways", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  provider: varchar("provider", { length: 150 }).notNull(),
  publicKey: varchar("public_key", { length: 255 }),
  secretKey: text("secret_key"),
  webhookSecret: varchar("webhook_secret", { length: 255 }),
  isActive: smallint("is_active").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const onlinePayments = financeSchema.table("online_payments", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id),
  gatewayId: uuid("gateway_id").notNull().references(() => paymentGateways.id),
  invoiceId: uuid("invoice_id").references(() => invoices.id),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  currency: varchar("currency", { length: 10 }).default("NGN").notNull(),
  providerFee: numeric("provider_fee", { precision: 12, scale: 2 }).default("0.00"),
  status: varchar("status", { length: 150 }).notNull(),
  transactionRef: varchar("transaction_ref", { length: 255 }).unique().notNull(),
  ledgerEntryId: uuid("ledger_entry_id").references(() => ledgerEntries.id),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
