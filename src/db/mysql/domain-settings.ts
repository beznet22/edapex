/**
 * ARCHITECTURE OVERVIEW: System Settings Domain
 *
 * Purpose:
 * Decouples system toggles from hardcoded config files into database-driven `settings`.
 * Enforces isolated tenant configurations via `tenant_id` ensuring multi-tenant customization
 * safety for webhooks, gateways, and layout preferences.
 *
 * Replaces Legacy Tables:
 * - sm_general_settings / infixedu__settings / sm_base_setups (partial config extraction)
 * - sm_email_settings / sm_payment_gateway_settings / sm_sms_gateways
 * - sm_dashboard_settings / sm_home_page_settings / invoice_settings / maintenance_settings
 */
import { mysqlTable, varchar, int, timestamp, json, index, unique } from "drizzle-orm/mysql-core";

import { tenants } from "./domain-core";
import { generateId } from "../utils/id";

// Settings Domain - dropped  prefix

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

export type AcademicConfig = {
  termStructure: "semesters" | "trimesters" | "quarters" | "custom";
  termNomenclature: string;
};

export type BaseCurrency = "NGN" | "USD" | "GBP" | "EUR" | "KES" | "GHS" | "ZAR" | "XOF";
export type Locale = "en-NG" | "en-US" | "en-GB" | "fr-FR" | "ha-NG" | "yo-NG" | "ig-NG";

export type FinanceConfig = {
  currency: string;
  baseCurrency?: BaseCurrency;
  locale?: Locale;
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

export type HomeschoolConfig = {
  facilitatorCommissionRate: number;
  allowPublicPortfolios: boolean;
  maxStudentsPerFamily?: number;
};

export type ClassroomConfig = {
  autoSummarizeThreshold: number;
  enableLiveWhiteboard: boolean;
  retentionPolicyDays?: number;
};

export type CommunicationConfig = {
  defaultSmsGateway?: string;
  defaultEmailProvider?: string;
  enableReadReceipts: boolean;
};

export type AttendanceConfig = {
  lateMarkThresholdMinutes: number;
  requireGeoLocation: boolean;
};

export type HrConfig = {
  payrollCycle: "monthly" | "biweekly" | "weekly";
  enableLeaveAutoApproval: boolean;
};

export type LibraryConfig = {
  maxBooksPerStudent: number;
  finePerDay: number;
};

export type SettingConfig =
  | GeneralConfig
  | FinanceConfig
  | LmsConfig
  | HomeschoolConfig
  | ClassroomConfig
  | AcademicConfig
  | Record<string, any>;

export const settings = mysqlTable(
  "settings",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => generateId()),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id),
    domain: varchar("domain", { length: 50 }).notNull(), // 'general', 'finance', 'attendance', 'ai'
    config: json("config").$type<SettingConfig>().notNull(), // Domain-specific JSON configuration
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  },
  (table) => ({
    tenantDomainIdx: unique("setting_tenant_domain_unique").on(table.tenantId, table.domain),
  }),
);

// Feature Flags — tenant-scoped dark launches, A/B testing, module enablement
export type FeatureFlagMetadata = {
  description?: string;
  enabledForUserIds?: string[]; // targeted rollout
  variant?: string; // A/B test variant
};

export const featureFlags = mysqlTable(
  "feature_flags",
  {
    id: varchar("id", { length: 36 })
      .primaryKey()
      .$defaultFn(() => generateId()),
    tenantId: varchar("tenant_id", { length: 36 })
      .notNull()
      .references(() => tenants.id),
    featureKey: varchar("feature_key", { length: 100 }).notNull(), // e.g. 'lms.ai_tutoring', 'finance.digital_wallet'
    isEnabled: int("is_enabled").notNull().default(0),
    rolloutPercentage: int("rollout_percentage").default(0), // 0-100 for gradual rollouts
    metadata: json("metadata").$type<FeatureFlagMetadata>(),
    createdAt: timestamp("created_at").defaultNow(),
    updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
  },
  (table) => ({
    tenantFeatureIdx: unique("ff_tenant_feature_unique").on(table.tenantId, table.featureKey),
  }),
);
