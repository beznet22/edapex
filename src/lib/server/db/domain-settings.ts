import {
  mysqlTable,
  varchar,
  int,
  timestamp,
  json,
  unique,
} from "drizzle-orm/mysql-core";

// JSONB Settings Store — replaces sm_general_settings (100+ cols), sm_sms_gateways, admit_card_settings, etc.

export type SettingsConfig = Record<string, unknown>;

export const settings = mysqlTable("edx_settings", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull(),
  domain: varchar("domain", { length: 50 }).notNull(),
  // 'school_profile', 'branding', 'email', 'sms', 'attendance',
  // 'exam', 'result_display', 'admit_card', 'features'
  config: json("config").$type<SettingsConfig>().notNull(),
  schemaVersion: int("schema_version").default(1),
  updatedBy: int("updated_by"),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
  tenantDomainUnique: unique("settings_unique").on(table.tenantId, table.domain),
}));
