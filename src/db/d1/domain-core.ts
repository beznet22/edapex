/**
 * ARCHITECTURE OVERVIEW: Core Domain
 * 
 * Purpose:
 * Establishes global platform multi-tenancy utilizing a native `tenant_id` foreign key. 
 * Centralizes identities into a polymorphic-ready `accounts` table, reducing table 
 * bloat and eliminating dual-writes across disparate user tables. Extends type safety 
 * with `metadata` JSON blobs for role-specific attributes, and utilizes `enumerations`
 * for centralized taxonomy mapping.
 * 
 * Replaces Legacy Tables:
 * - sm_schools -> tenants
 * - sm_academic_years -> academic_years
 * - sm_base_setups / sm_base_groups -> enumerations
 * - users / sm_students / sm_staffs / sm_parents -> accounts
 */
import { unique,  sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

// Tenant context injected into all repositories
export interface TenantContext {
  tenantId: string;    
  academicId: string;  
  userId: string;      
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

export const tenants = sqliteTable("tenants", {
  id: text("id", { length: 36 }).primaryKey(),
  tenantType: text("tenant_type", { enum: ["conventional", "homeschool_family", "homeschool_coop"] }).default("conventional").notNull(),
  name: text("name", { length: 200 }).notNull(),
  code: text("code", { length: 50 }),
  email: text("email", { length: 191 }),
  subscriptionTier: text("subscription_tier", { enum: ["free", "basic", "premium", "enterprise"] }).default("free"),
  metadata: text("metadata", { mode: "json" }).$type<TenantMetadata>(),
  activeStatus: integer("active_status").default(1).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
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
export const accounts = sqliteTable("accounts", {
  id: text("id", { length: 255 }).primaryKey(),
  name: text("name", { length: 192 }).notNull(), // better-auth display name
  email: text("email", { length: 192 }),
  emailVerified: integer("email_verified").default(0).notNull(), // better-auth requirement
  image: text("image", { length: 500 }), // better-auth requirement
  password: text("password", { length: 100 }), // legacy/local password tracking
  username: text("username", { length: 192 }),
  phoneNumber: text("phone_number", { length: 191 }),
  activeStatus: integer("active_status").default(1).notNull(),
  randomCode: text("random_code"),
  notificationToken: text("notification_token"),
  rememberToken: text("remember_token", { length: 100 }),
  refreshToken: text("refresh_token", { length: 100 }),
  language: text("language", { length: 191 }).default("en"),
  styleId: integer("style_id").default(1),
  rtlLtl: integer("rtl_ltl").default(2),
  selectedSession: integer("selected_session").default(1),
  accessStatus: integer("access_status").default(1),
  tenantId: text("tenant_id", { length: 36 }).references(() => tenants.id, { onDelete: "cascade" }), 
  roleId: integer("role_id"), 
  isAdministrator: text("is_administrator", { enum: ["yes", "no"] }).default("no").notNull(),
  isRegistered: integer("is_registered").default(0).notNull(),
  deviceToken: text("device_token"),
  stripeId: text("stripe_id", { length: 191 }),
  cardBrand: text("card_brand", { length: 191 }),
  cardLastFour: text("card_last_four", { length: 4 }),
  verified: text("verified", { length: 191 }),
  trialEndsAt: integer("trial_ends_at", { mode: "timestamp" }),
  walletBalance: real("wallet_balance").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
}, (table) => ({
  emailTenantIdx: index("acct_email_tenant_idx").on(table.email, table.tenantId),
  tenantIdx: index("acct_tenant_idx").on(table.tenantId),
}));

// Sessions Table — Better-Auth Session Store
export const sessions = sqliteTable("sessions", {
  id: text("id", { length: 255 }).primaryKey(),
  userId: text("user_id", { length: 255 }).notNull().references(() => accounts.id, { onDelete: "cascade" }),
  token: text("token", { length: 255 }).notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
});

// Auth Accounts Table — Better-Auth OAuth link & Credential Store
export const authAccounts = sqliteTable("auth_accounts", {
  id: text("id", { length: 255 }).primaryKey(),
  accountId: text("account_id", { length: 255 }).notNull().references(() => accounts.id, { onDelete: "cascade" }), // maps to user_id
  providerId: text("provider_id", { length: 192 }).notNull(), // 'github', 'credential'
  accountIdProvider: text("account_id_provider", { length: 192 }).notNull(), // 'github-user-id'
  userId: text("user_id", { length: 255 }).notNull().references(() => accounts.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: integer("access_token_expires_at", { mode: "timestamp" }),
  refreshTokenExpiresAt: integer("refresh_token_expires_at", { mode: "timestamp" }),
  scope: text("scope"),
  password: text("password"),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
});

// Verification Table — Better-Auth Magic Links / OTP
export const authVerifications = sqliteTable("auth_verifications", {
  id: text("id", { length: 255 }).primaryKey(),
  identifier: text("identifier", { length: 192 }).notNull(),
  value: text("value", { length: 192 }).notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
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

export type FacilitatorMetadata = {
  trcnCertification?: string;
  subjectSpecializations?: string[];
  hourlyRate?: number;
  rating?: number;
  employmentType?: "salaried" | "contractor" | "hybrid";
  departmentId?: number; // Links to HR
  designationId?: number; // Links to HR
};

export type UserMetadata = StudentMetadata | StaffMetadata | ParentMetadata | DriverMetadata | FacilitatorMetadata;

// Users Table — Domain Personas (Student, Staff, Parent)
export const users = sqliteTable("users", {
  id: text("id", { length: 36 }).primaryKey(),
  tenantId: text("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  accountId: text("account_id", { length: 255 }).references(() => accounts.id),
  userType: text("user_type", { enum: ["student", "staff", "parent", "driver", "facilitator"] }).notNull(),
  firstName: text("first_name", { length: 100 }).notNull(),
  lastName: text("last_name", { length: 100 }).notNull(),
  email: text("email", { length: 191 }),
  mobile: text("mobile", { length: 100 }),
  dateOfBirth: text("date_of_birth"),
  genderId: text("gender_id", { length: 36 }).references(() => enumerations.id),
  photo: text("photo", { length: 500 }),
  idNumber: text("id_number", { length: 100 }),  // national ID / passport
  parentUserId: text("parent_user_id", { length: 36 }),  // self-ref FK for parent-child linking
  metadata: text("metadata", { mode: "json" }).$type<UserMetadata>(),  // role-specific fields
  activeStatus: integer("active_status").default(1).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
}, (table) => ({
  tenantIdx: index("users_tenant_idx").on(table.tenantId),
  tenantTypeIdx: index("users_tenant_type_idx").on(table.tenantId, table.userType),
  emailIdx: index("users_email_idx").on(table.email),
  accountIdx: index("users_account_idx").on(table.accountId),
  parentIdx: index("users_parent_idx").on(table.parentUserId),
}));

// Academic Years — replaces sm_academic_years
export const academicYears = sqliteTable("academic_years", {
  id: text("id", { length: 36 }).primaryKey(),
  tenantId: text("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  title: text("title", { length: 200 }).notNull(),
  year: text("year", { length: 20 }),
  startingDate: text("starting_date"),
  endingDate: text("ending_date"),
  isCurrent: integer("is_current").default(0),
  activeStatus: integer("active_status").default(1).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
});

export const academicTerms = sqliteTable("academic_terms", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id").notNull(),
  academicId: text("academic_id").notNull().references(() => academicYears.id),
  title: text("title").notNull(),
  startDate: integer("start_date", { mode: "timestamp" }).notNull(),
  endDate: integer("end_date", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
});


// Enumerations — replaces sm_base_setups, sm_student_categories, etc
export type EnumerationMetadata = {
  color?: string;
  icon?: string;
  isSystem?: boolean;
  parentCode?: string;
};

export const enumerations = sqliteTable("enumerations", {
  id: text("id", { length: 36 }).primaryKey(),
  tenantId: text("tenant_id", { length: 36 }).references(() => tenants.id),  // NULL = global
  domain: text("domain", { length: 50 }).notNull(),  // 'gender', 'blood_group', 'religion', etc.
  code: text("code", { length: 50 }).notNull(),
  label: text("label", { length: 191 }).notNull(),
  sortOrder: integer("sort_order").default(0),
  metadata: text("metadata", { mode: "json" }).$type<EnumerationMetadata>(),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
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

export const userDocuments = sqliteTable("user_documents", {
  id: text("id", { length: 36 }).primaryKey(),
  tenantId: text("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  userId: text("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  documentType: text("document_type", { length: 50 }).notNull(),
  title: text("title", { length: 191 }),
  filePath: text("file_path", { length: 500 }).notNull(),
  verifiedAt: integer("verified_at", { mode: "timestamp" }),
  metadata: text("metadata", { mode: "json" }).$type<UserDocumentMetadata>(),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
}, (table) => ({
  userIdx: index("udoc_user_idx").on(table.tenantId, table.userId),
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

export const userAddresses = sqliteTable("user_addresses", {
  id: text("id", { length: 36 }).primaryKey(),
  tenantId: text("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  userId: text("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
  addressType: text("address_type", { enum: ["current", "permanent", "mailing"] }).notNull(),
  addressData: text("address_data", { mode: "json" }).$type<AddressData>().notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
}, (table) => ({
  userIdx: index("uaddr_user_idx").on(table.tenantId, table.userId),
}));

// --- SYSTEM JOBS ---

export const jobs = sqliteTable("jobs", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  queue: text("queue", { length: 255 }).notNull(),
  payload: text("payload").notNull(),
  attempts: integer("attempts").notNull().default(0),
  reservedAt: integer("reserved_at"),
  availableAt: integer("available_at").notNull(),
  createdAt: integer("created_at").notNull(),
});

export const failedJobs = sqliteTable("failed_jobs", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  uuid: text("uuid", { length: 255 }),
  connection: text("connection").notNull(),
  queue: text("queue").notNull(),
  payload: text("payload").notNull(),
  exception: text("exception").notNull(),
  failedAt: integer("failed_at", { mode: "timestamp" }).defaultNow(),
});
