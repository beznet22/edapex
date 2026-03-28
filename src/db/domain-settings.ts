/**
 * ARCHITECTURE OVERVIEW: System Settings Domain
 * 
 * Purpose:
 * Decouples system toggles from hardcoded config files into database-driven `edx_settings`. 
 * Enforces isolated tenant configurations via `tenant_id` ensuring multi-tenant customization 
 * safety for webhooks, gateways, and layout preferences.
 * 
 * Replaces Legacy Tables:
 * - sm_general_settings / infixedu__settings / sm_base_setups (partial config extraction)
 * - sm_email_settings / sm_payment_gateway_settings / sm_sms_gateways
 * - sm_dashboard_settings / sm_home_page_settings / invoice_settings / maintenance_settings
 */
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
