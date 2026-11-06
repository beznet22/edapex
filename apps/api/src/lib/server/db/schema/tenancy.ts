import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";

import { auditTimestamps, boolean01, calendarDate, statusCheck } from "./common";

const ACADEMIC_YEAR_STATUS = ["planned", "active", "closing", "archived", "restoring", "archived_readable"] as const;
const ADMINISTRATOR_FLAG = ["yes", "no"] as const;
const CONTACT_TYPE = ["yearly", "monthly", "once"] as const;

export const smSchools = sqliteTable("sm_schools", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  schoolName: text("school_name"),
  createdBy: integer("created_by").notNull().default(1),
  updatedBy: integer("updated_by").notNull().default(1),
  email: text("email"),
  domain: text("domain").notNull().default("school"),
  address: text("address"),
  phone: text("phone"),
  schoolCode: text("school_code"),
  isEmailVerified: boolean01("is_email_verified"),
  startingDate: calendarDate("starting_date"),
  endingDate: calendarDate("ending_date"),
  packageId: integer("package_id"),
  planType: text("plan_type"),
  region: integer("region"),
  contactType: text("contact_type", { enum: CONTACT_TYPE }),
  activeStatus: boolean01("active_status", 1),
  isEnabled: text("is_enabled").notNull().default("yes"),
  ...auditTimestamps()
});

export const infixRoles = sqliteTable(
  "infix_roles",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    name: text("name"),
    type: text("type").notNull().default("System"),
    activeStatus: boolean01("active_status", 1),
    createdBy: text("created_by").default("1"),
    updatedBy: text("updated_by").default("1"),
    ...auditTimestamps(),
    schoolId: integer("school_id")
      .default(1)
      .references(() => smSchools.id, { onDelete: "cascade", onUpdate: "restrict" }),
    isSaas: integer("is_saas").default(0)
  },
  (table) => [index("infix_roles_school_id_foreign").on(table.schoolId)]
);

export const users = sqliteTable(
  "users",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    fullName: text("full_name"),
    username: text("username"),
    phoneNumber: text("phone_number"),
    email: text("email"),
    password: text("password"),
    userType: text("usertype"),
    activeStatus: boolean01("active_status", 1),
    randomCode: text("random_code"),
    notificationToken: text("notification_token"),
    rememberToken: text("remember_token"),
    ...auditTimestamps(),
    language: text("language").default("en"),
    styleId: integer("style_id").default(1),
    rtlLtl: integer("rtl_ltl").default(2),
    selectedSession: integer("selected_session").default(1),
    createdBy: integer("created_by").default(1),
    updatedBy: integer("updated_by").default(1),
    accessStatus: integer("access_status").default(1),
    schoolId: integer("school_id")
      .default(1)
      .references(() => smSchools.id, { onDelete: "cascade", onUpdate: "restrict" }),
    roleId: integer("role_id").references(() => infixRoles.id, {
      onDelete: "cascade",
      onUpdate: "restrict"
    }),
    isAdministrator: text("is_administrator", { enum: ADMINISTRATOR_FLAG }).notNull().default("no"),
    isRegistered: boolean01("is_registered"),
    deviceToken: text("device_token"),
    stripeId: text("stripe_id"),
    cardBrand: text("card_brand"),
    cardLastFour: text("card_last_four"),
    verified: text("verified"),
    trialEndsAt: integer("trial_ends_at"),
    walletBalance: integer("wallet_balance").notNull().default(0),
    emailVerifiedAt: integer("email_verified_at")
  },
  (table) => [
    index("users_role_id_foreign").on(table.roleId),
    index("users_school_id_foreign").on(table.schoolId),
    index("users_email_index").on(table.email)
  ]
);

export const smAcademicYears = sqliteTable(
  "sm_academic_years",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    year: text("year").notNull(),
    title: text("title").notNull(),
    startingDate: calendarDate("starting_date").notNull(),
    endingDate: calendarDate("ending_date").notNull(),
    copyWithAcademicYear: text("copy_with_academic_year"),
    activeStatus: boolean01("active_status", 1),
    createdAt: integer("created_at"),
    updatedAt: integer("updated_at"),
    createdBy: integer("created_by").default(1),
    updatedBy: integer("updated_by").default(1),
    schoolId: integer("school_id")
      .default(1)
      .references(() => smSchools.id, { onDelete: "cascade", onUpdate: "restrict" }),
    status: text("status", { enum: ACADEMIC_YEAR_STATUS }).notNull().default("planned"),
    archivedAt: integer("archived_at"),
    archiveManifestKey: text("archive_manifest_key"),
    copiedFromId: integer("copied_from_id").references((): AnySQLiteColumn => smAcademicYears.id, {
      onDelete: "set null",
      onUpdate: "restrict"
    })
  },
  (table) => [
    index("sm_academic_years_school_id_foreign").on(table.schoolId),
    uniqueIndex("sm_academic_years_school_year_unique").on(table.schoolId, table.year),
    statusCheck("sm_academic_years_status_check", table.status, ACADEMIC_YEAR_STATUS)
  ]
);

export const smLanguages = sqliteTable(
  "sm_languages",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    languageName: text("language_name"),
    native: text("native"),
    languageUniversal: text("language_universal"),
    activeStatus: boolean01("active_status", 1),
    ...auditTimestamps(),
    langId: integer("lang_id")
      .default(1)
      .references(() => languages.id, { onDelete: "cascade", onUpdate: "restrict" }),
    createdBy: integer("created_by").default(1),
    updatedBy: integer("updated_by").default(1),
    schoolId: integer("school_id")
      .default(1)
      .references(() => smSchools.id, { onDelete: "cascade", onUpdate: "restrict" })
  },
  (table) => [
    index("sm_languages_lang_id_foreign").on(table.langId),
    index("sm_languages_school_id_foreign").on(table.schoolId)
  ]
);

export const languages = sqliteTable(
  "languages",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    native: text("native").notNull(),
    rtl: integer("rtl").notNull(),
    ...auditTimestamps(),
    activeStatus: boolean01("active_status"),
    schoolId: integer("school_id")
      .default(1)
      .references(() => smSchools.id, { onDelete: "cascade", onUpdate: "restrict" })
  },
  (table) => [index("languages_school_id_foreign").on(table.schoolId)]
);

export const smDateFormats = sqliteTable(
  "sm_date_formats",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    format: text("format"),
    normalView: text("normal_view"),
    activeStatus: boolean01("active_status", 1),
    ...auditTimestamps(),
    createdBy: integer("created_by").default(1),
    updatedBy: integer("updated_by").default(1),
    schoolId: integer("school_id")
      .default(1)
      .references(() => smSchools.id, { onDelete: "cascade", onUpdate: "restrict" })
  },
  (table) => [index("sm_date_formats_school_id_foreign").on(table.schoolId)]
);

/**
 * 106 legacy columns split per 01a §6: the active surface stays queryable, the
 * remaining 95 fields live verbatim in `extras`.
 */
export const smGeneralSettings = sqliteTable(
  "sm_general_settings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    schoolId: integer("school_id")
      .default(1)
      .references(() => smSchools.id, { onDelete: "cascade", onUpdate: "restrict" }),
    academicId: integer("academic_id").references(() => smAcademicYears.id, {
      onDelete: "set null",
      onUpdate: "restrict"
    }),
    sessionId: integer("session_id").references(() => smAcademicYears.id, {
      onDelete: "set null",
      onUpdate: "restrict"
    }),
    languageId: integer("language_id")
      .default(1)
      .references(() => smLanguages.id, { onDelete: "set null", onUpdate: "restrict" }),
    dateFormatId: integer("date_format_id")
      .default(1)
      .references(() => smDateFormats.id, { onDelete: "set null", onUpdate: "restrict" }),
    schoolName: text("school_name"),
    phone: text("phone"),
    email: text("email"),
    address: text("address"),
    logo: text("logo"),
    identity: text("identity"),
    extras: text("extras")
  },
  (table) => [
    index("sm_general_settings_academic_id_foreign").on(table.academicId),
    index("sm_general_settings_date_format_id_foreign").on(table.dateFormatId),
    index("sm_general_settings_language_id_foreign").on(table.languageId),
    index("sm_general_settings_school_id_foreign").on(table.schoolId),
    index("sm_general_settings_session_id_foreign").on(table.sessionId)
  ]
);

export const tenancyTables = [
  smSchools,
  infixRoles,
  users,
  smAcademicYears,
  smLanguages,
  languages,
  smDateFormats,
  smGeneralSettings
];
