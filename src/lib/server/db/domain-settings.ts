import {
  mysqlTable,
  varchar,
  int,
  timestamp,
  json,
  index,
  unique,
} from "drizzle-orm/mysql-core";

import { tenants } from "./domain-core";

// Settings Domain - dropped edx_ prefix

// --- SETTINGS METADATA TYPES ---

export type GeneralConfig = {
  schoolName: string;
  address?: string;
  phone?: string;
  email?: string;
  session?: number;
  schoolCode?: string;
  logo?: string;
};

export type FinanceConfig = {
  currency: string;
  currencySymbol?: string;
  feeReceiptPrefix?: string;
  invoicePrefix?: string;
  academicYearId?: number;
};

export type SettingConfig = GeneralConfig | FinanceConfig | Record<string, any>;

export const settings = mysqlTable("settings", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id),
  domain: varchar("domain", { length: 50 }).notNull(), // 'general', 'finance', 'attendance', 'ai'
  config: json("config").$type<SettingConfig>().notNull(), // Domain-specific JSON configuration
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
  tenantDomainIdx: unique("setting_tenant_domain_unique").on(table.tenantId, table.domain),
}));
