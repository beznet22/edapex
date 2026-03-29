/**
 * ARCHITECTURE OVERVIEW: Core Domain
 * 
 * Purpose:
 * Establishes global platform multi-tenancy utilizing a native `tenant_id` foreign key. 
 * Centralizes identities into a polymorphic-ready `edx_accounts` table, reducing table 
 * bloat and eliminating dual-writes across disparate user tables. Extends type safety 
 * with `metadata` JSON blobs for role-specific attributes, and utilizes `edx_enumerations`
 * for centralized taxonomy mapping.
 * 
 * Replaces Legacy Tables:
 * - sm_schools -> edx_tenants
 * - sm_academic_years -> edx_academic_years
 * - sm_base_setups / sm_base_groups -> edx_enumerations
 * - users / sm_students / sm_staffs / sm_parents -> edx_accounts
 */
import { pgSchema, text, doublePrecision, integer, serial, numeric, smallint, timestamp, jsonb, boolean, date, varchar, index, unique } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// Tenant context injected into all repositories
export interface TenantContext {
  tenantId: number;    // school_id (stays integer for now, UUID in PG phase)
  academicId: number;  // academic_year_id
  userId: number;      // authenticated user
}

// --- CORE TABLES ---

// Tenants Table — replaces sm_schools
export type TenantMetadata = {
  logo?: string;
  favicon?: string;
  themeColor?: string;
  tagline?: string;
  socialLinks?: {
    facebook?: string;
    twitter?: string;
    linkedin?: string;
    youtube?: string;
  };
  contactPerson?: string;
  currency?: string;
  timeZone?: string;
};
export const coreSchema = pgSchema("domain_core");


export const tenants = coreSchema.table("tenants", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  code: varchar("code", { length: 50 }),
  email: varchar("email", { length: 191 }),
  subscriptionTier: varchar("subscription_tier", { length: 150 }).default("free"),
  metadata: jsonb("metadata").$type<TenantMetadata>(),
  activeStatus: smallint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Accounts Table — Authentication Identity (Identity Layer)
/**
 * @legacy The following fields are remnants of the V1 schema and should be migrated:
 * - `styleId`, `rtlLtl` → Move to `settings` domain (UI preferences)
 * - `stripeId`, `cardBrand`, `cardLastFour`, `trialEndsAt` → Move to a `billing` domain
 * - `walletBalance` → Move to `finance` domain (ledger-backed balance)
 * - `selectedSession` → Derive from `academicYears.isCurrent`
 * - `randomCode`, `notificationToken`, `deviceToken` → Move to `sessions` or `communication` domain
 */
export const accounts = coreSchema.table("accounts", {
  id: varchar("id", { length: 255 }).primaryKey(),
  name: varchar("name", { length: 192 }).notNull(), // better-auth display name
  email: varchar("email", { length: 192 }),
  emailVerified: smallint("email_verified").default(0).notNull(), // better-auth requirement
  image: varchar("image", { length: 500 }), // better-auth requirement
  password: varchar("password", { length: 100 }), // legacy/local password tracking
  username: varchar("username", { length: 192 }),
  phoneNumber: varchar("phone_number", { length: 191 }),
  activeStatus: smallint("active_status").default(1).notNull(),
  randomCode: text("random_code"),
  notificationToken: text("notification_token"),
  rememberToken: varchar("remember_token", { length: 100 }),
  refreshToken: varchar("refresh_token", { length: 100 }),
  language: varchar("language", { length: 191 }).default("en"),
  styleId: integer("style_id").default(1),
  rtlLtl: integer("rtl_ltl").default(2),
  selectedSession: integer("selected_session").default(1),
  accessStatus: integer("access_status").default(1),
  tenantId: integer("tenant_id").references(() => tenants.id, { onDelete: "cascade" }), 
  roleId: integer("role_id"), 
  isAdministrator: varchar("is_administrator", { length: 150 }).default("no").notNull(),
  isRegistered: smallint("is_registered").default(0).notNull(),
  deviceToken: text("device_token"),
  stripeId: varchar("stripe_id", { length: 191 }),
  cardBrand: varchar("card_brand", { length: 191 }),
  cardLastFour: varchar("card_last_four", { length: 4 }),
  verified: varchar("verified", { length: 191 }),
  trialEndsAt: timestamp("trial_ends_at"),
  walletBalance: doublePrecision("wallet_balance").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  emailTenantIdx: index("acct_email_tenant_idx").on(table.email, table.tenantId),
  tenantIdx: index("acct_tenant_idx").on(table.tenantId),
}));

// Sessions Table — Better-Auth Session Store
export const sessions = coreSchema.table("sessions", {
  id: varchar("id", { length: 255 }).primaryKey(),
  userId: varchar("user_id", { length: 255 }).notNull().references(() => accounts.id, { onDelete: "cascade" }),
  token: varchar("token", { length: 255 }).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Auth Accounts Table — Better-Auth OAuth link & Credential Store
export const authAccounts = coreSchema.table("auth_accounts", {
  id: varchar("id", { length: 255 }).primaryKey(),
  accountId: varchar("account_id", { length: 255 }).notNull().references(() => accounts.id, { onDelete: "cascade" }), // maps to user_id
  providerId: varchar("provider_id", { length: 192 }).notNull(), // 'github', 'credential'
  accountIdProvider: varchar("account_id_provider", { length: 192 }).notNull(), // 'github-user-id'
  userId: varchar("user_id", { length: 255 }).notNull().references(() => accounts.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Verification Table — Better-Auth Magic Links / OTP
export const authVerifications = coreSchema.table("auth_verifications", {
  id: varchar("id", { length: 255 }).primaryKey(),
  identifier: varchar("identifier", { length: 192 }).notNull(),
  value: varchar("value", { length: 192 }).notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// --- PERSONA METADATA TYPES ---

export type StudentMetadata = {
  admissionNo?: number;
  admissionDate?: string;
  studentCategoryId?: number;
  category?: string;
  bloodGroup?: string;
  religion?: string;
  height?: string;
  weight?: string;
  isHostelResident?: boolean;
  isTransportUser?: boolean;
};

export type StaffMetadata = {
  staffNumber?: string;
  joiningDate?: string;
  designationId?: number;
  departmentId?: number;
  roleId?: number;
  qualification?: string;
  experience?: string;
  contractType?: string;
  emergencyContactName?: string;
  emergencyContactNumber?: string;
};

export type ParentMetadata = {
  fatherName?: string;
  fatherOccupation?: string;
  fatherPhone?: string;
  motherName?: string;
  motherOccupation?: string;
  motherPhone?: string;
  guardianName?: string;
  guardianRelation?: string;
};

export type DriverMetadata = {
  licenseNumber: string;
  licenseExpiry: string;
  vehicleType?: string;
};

export type UserMetadata = StudentMetadata | StaffMetadata | ParentMetadata | DriverMetadata;

// Users Table — Domain Personas (Student, Staff, Parent)
export const users = coreSchema.table("users", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  accountId: varchar("account_id", { length: 255 }).references(() => accounts.id),
  userType: varchar("user_type", { length: 150 }).notNull(),
  firstName: varchar("first_name", { length: 100 }).notNull(),
  lastName: varchar("last_name", { length: 100 }).notNull(),
  email: varchar("email", { length: 191 }),
  mobile: varchar("mobile", { length: 100 }),
  dateOfBirth: date("date_of_birth", { mode: "string" }),
  genderId: integer("gender_id").references(() => enumerations.id),
  photo: varchar("photo", { length: 500 }),
  idNumber: varchar("id_number", { length: 100 }),  // national ID / passport
  parentUserId: integer("parent_user_id"),  // self-ref FK for parent-child linking
  metadata: jsonb("metadata").$type<UserMetadata>(),  // role-specific fields
  activeStatus: smallint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  tenantIdx: index("users_tenant_idx").on(table.tenantId),
  tenantTypeIdx: index("users_tenant_type_idx").on(table.tenantId, table.userType),
  emailIdx: index("users_email_idx").on(table.email),
  accountIdx: index("users_account_idx").on(table.accountId),
  parentIdx: index("users_parent_idx").on(table.parentUserId),
}));

// Academic Years — replaces sm_academic_years
export const academicYears = coreSchema.table("academic_years", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  title: varchar("title", { length: 200 }).notNull(),
  year: varchar("year", { length: 20 }),
  startingDate: date("starting_date", { mode: "string" }),
  endingDate: date("ending_date", { mode: "string" }),
  isCurrent: smallint("is_current").default(0),
  activeStatus: smallint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Enumerations — replaces sm_base_setups, sm_student_categories, etc
export type EnumerationMetadata = {
  color?: string;
  icon?: string;
  isSystem?: boolean;
  parentCode?: string;
};

export const enumerations = coreSchema.table("enumerations", {
  id: serial("id").primaryKey(),
  tenantId: integer("tenant_id").references(() => tenants.id),  // NULL = global
  domain: varchar("domain", { length: 50 }).notNull(),  // 'gender', 'blood_group', 'religion', etc.
  code: varchar("code", { length: 50 }).notNull(),
  label: varchar("label", { length: 191 }).notNull(),
  sortOrder: integer("sort_order").default(0),
  metadata: jsonb("metadata").$type<EnumerationMetadata>(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  domainIdx: index("enum_domain_idx").on(table.tenantId, table.domain),
  uniqueCode: unique("enum_unique").on(table.tenantId, table.domain, table.code),
}));

// User Documents
export type UserDocumentMetadata = {
  verifiedBy?: number; // userId
  rejectionReason?: string;
  expiryDate?: string;
  documentNumber?: string;
};

export const userDocuments = coreSchema.table("user_documents", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  documentType: varchar("document_type", { length: 50 }).notNull(),
  title: varchar("title", { length: 191 }),
  filePath: varchar("file_path", { length: 500 }).notNull(),
  verifiedAt: timestamp("verified_at"),
  metadata: jsonb("metadata").$type<UserDocumentMetadata>(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  userIdx: index("udoc_user_idx").on(table.userId),
}));

// User Addresses
export type AddressData = {
  addressLine1: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
};

export const userAddresses = coreSchema.table("user_addresses", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  addressType: varchar("address_type", { length: 150 }).notNull(),
  addressData: jsonb("address_data").$type<AddressData>().notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  userIdx: index("uaddr_user_idx").on(table.userId),
}));

// --- SYSTEM JOBS ---

export const jobs = coreSchema.table("jobs", {
  id: serial("id").primaryKey(),
  queue: varchar("queue", { length: 255 }).notNull(),
  payload: text("payload").notNull(),
  attempts: integer("attempts").notNull().default(0),
  reservedAt: integer("reserved_at"),
  availableAt: integer("available_at").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const failedJobs = coreSchema.table("failed_jobs", {
  id: serial("id").primaryKey(),
  uuid: varchar("uuid", { length: 255 }),
  connection: text("connection").notNull(),
  queue: text("queue").notNull(),
  payload: text("payload").notNull(),
  exception: text("exception").notNull(),
  failedAt: timestamp("failed_at").defaultNow(),
});
