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
} from "drizzle-orm/mysql-core";

import { accounts } from "./domain-core";

// Universal Ledger — replaces 9 parallel financial tables

export type LedgerMetadata = {
  paymentMethod?: string;
  receiptNo?: string;
  notes?: string;
  bankId?: number;
};

export const ledgerEntries = mysqlTable("edx_ledger_entries", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull(),
  transactionType: mysqlEnum("transaction_type", [
    "fee_payment", "fee_waiver", "salary", "expense", "income", "refund", "wallet_topup"
  ]).notNull(),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  accountId: int("account_id").references(() => accounts.id),
  referenceType: varchar("reference_type", { length: 50 }),
  referenceId: int("reference_id"),
  metadata: json("metadata").$type<LedgerMetadata>(),  // { payment_method, receipt_no, notes, bank_id }
  postedAt: timestamp("posted_at").defaultNow(),
  createdBy: int("created_by"),
  academicId: int("academic_id"),
}, (table) => ({
  tenantIdx: index("ledger_tenant_idx").on(table.tenantId),
  accountIdx: index("ledger_account_idx").on(table.accountId),
  typeIdx: index("ledger_type_idx").on(table.tenantId, table.transactionType),
}));

export const feeGroups = mysqlTable("edx_fee_groups", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull(),
  name: varchar("name", { length: 200 }).notNull(),
  description: varchar("description", { length: 500 }),
  createdAt: timestamp("created_at").defaultNow(),
});

export const feeTypes = mysqlTable("edx_fee_types", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull(),
  feeGroupId: int("fee_group_id").references(() => feeGroups.id),
  name: varchar("name", { length: 200 }).notNull(),
  description: varchar("description", { length: 500 }),
  createdAt: timestamp("created_at").defaultNow(),
});

export const feeMasters = mysqlTable("edx_fee_masters", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull(),
  feeTypeId: int("fee_type_id").notNull().references(() => feeTypes.id),
  amount: decimal("amount", { precision: 12, scale: 2 }).notNull(),
  academicId: int("academic_id").notNull(),
  dueDate: timestamp("due_date"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const bankAccounts = mysqlTable("edx_bank_accounts", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull(),
  bankName: varchar("bank_name", { length: 255 }).notNull(),
  accountName: varchar("account_name", { length: 255 }).notNull(),
  accountNumber: varchar("account_number", { length: 100 }).notNull(),
  accountType: varchar("account_type", { length: 50 }),
  bankAddress: varchar("bank_address", { length: 500 }),
  openingBalance: decimal("opening_balance", { precision: 12, scale: 2 }).default("0.00"),
  currentBalance: decimal("current_balance", { precision: 12, scale: 2 }).default("0.00"),
  activeStatus: tinyint("active_status").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow(),
});
