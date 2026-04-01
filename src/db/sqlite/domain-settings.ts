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
import { unique,  sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";
import { generateId } from "../utils/id";
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
  academicYearId?: string;
};

export type LmsConfig = {
  isStandalone: boolean;
  allowGuestCheckout: boolean;
  instructorRevenueShare?: number;
};

export type SettingConfig = GeneralConfig | FinanceConfig | LmsConfig | Record<string, any>;

export const settings = sqliteTable("domain_settings_settings", {
  id: text("id").primaryKey().$defaultFn(() => generateId()),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  domain: text("domain", { length: 50 }).notNull(), // 'general', 'finance', 'attendance', 'ai'
  config: text("config", { mode: "json" }).$type<SettingConfig>().notNull(), // Domain-specific JSON configuration
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
}, (table) => ({
  tenantDomainIdx: unique("setting_tenant_domain_unique").on(table.tenantId, table.domain),
}));

// Feature Flags — tenant-scoped dark launches, A/B testing, module enablement
export type FeatureFlagMetadata = {
  description?: string;
  enabledForUserIds?: string[];  // targeted rollout
  variant?: string;  // A/B test variant
};

export const featureFlags = sqliteTable("domain_settings_feature_flags", {
  id: text("id").primaryKey().$defaultFn(() => generateId()),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  featureKey: text("feature_key", { length: 100 }).notNull(), // e.g. 'lms.ai_tutoring', 'finance.digital_wallet'
  isEnabled: integer("is_enabled").notNull().default(0),
  rolloutPercentage: integer("rollout_percentage").default(0), // 0-100 for gradual rollouts
  metadata: text("metadata", { mode: "json" }).$type<FeatureFlagMetadata>(),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
}, (table) => ({
  tenantFeatureIdx: unique("ff_tenant_feature_unique").on(table.tenantId, table.featureKey),
}));
