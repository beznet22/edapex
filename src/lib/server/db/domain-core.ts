import {
  mysqlTable,
  varchar,
  int,
  timestamp,
  mysqlEnum,
  date,
  json,
  tinyint,
  index,
  unique,
} from "drizzle-orm/mysql-core";
import { users } from "./sms-schema";

// Tenant context injected into all repositories
export interface TenantContext {
  tenantId: number;    // school_id (stays int for now, UUID in PG phase)
  academicId: number;  // academic_year_id
  userId: number;      // authenticated user
}

// Typesafe metadata for polymorphic accounts
export type AccountMetadata = {
  // Common
  notes?: string;
  // Student specific
  admissionNo?: number;
  studentCategoryId?: number;
  // Staff specific
  designationId?: number;
  departmentId?: number;
  qualification?: string;
  experience?: string;
};

// Accounts Table — consolidates sm_students, sm_staffs, sm_parents
export const accounts = mysqlTable("edx_accounts", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull(),      // NO DEFAULT
  userId: int("user_id").references(() => users.id),
  accountType: mysqlEnum("account_type", ["student", "staff", "parent", "driver"]).notNull(),
  firstName: varchar("first_name", { length: 100 }).notNull(),
  lastName: varchar("last_name", { length: 100 }).notNull(),
  email: varchar("email", { length: 191 }),
  mobile: varchar("mobile", { length: 100 }),
  dateOfBirth: date("date_of_birth", { mode: "string" }),
  genderId: int("gender_id"),
  legacyStudentId: int("legacy_student_id"),
  legacyStaffId: int("legacy_staff_id"),
  legacyParentId: int("legacy_parent_id"),
  photo: varchar("photo", { length: 500 }),
  metadata: json("metadata").$type<AccountMetadata>(),  // role-specific fields (admission_no, salary, etc.)
  activeStatus: tinyint("active_status").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
  tenantIdx: index("acct_tenant_idx").on(table.tenantId),
  tenantTypeIdx: index("acct_tenant_type_idx").on(table.tenantId, table.accountType),
  emailIdx: index("acct_email_idx").on(table.email),
  userIdx: index("acct_user_idx").on(table.userId),
}));

// Enumerations — replaces sm_base_setups, sm_student_categories, etc
export const enumerations = mysqlTable("edx_enumerations", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id"),  // NULL = global
  domain: varchar("domain", { length: 50 }).notNull(),  // 'gender', 'blood_group', 'religion', etc.
  code: varchar("code", { length: 50 }).notNull(),
  label: varchar("label", { length: 191 }).notNull(),
  sortOrder: int("sort_order").default(0),
  metadata: json("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
  domainIdx: index("enum_domain_idx").on(table.tenantId, table.domain),
  uniqueCode: unique("enum_unique").on(table.tenantId, table.domain, table.code),
}));

// Account Documents — replaces inline document_title_1..4 columns
export const accountDocuments = mysqlTable("edx_account_documents", {
  id: int("id").autoincrement().primaryKey(),
  accountId: int("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  documentType: varchar("document_type", { length: 50 }).notNull(),
  title: varchar("title", { length: 191 }),
  filePath: varchar("file_path", { length: 500 }).notNull(),
  verifiedAt: timestamp("verified_at"),
  metadata: json("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  accountIdx: index("adoc_account_idx").on(table.accountId),
}));

// Account Addresses — replaces inline address columns
export type AddressData = {
  streetLine1?: string;
  streetLine2?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  country?: string;
};

export const accountAddresses = mysqlTable("edx_account_addresses", {
  id: int("id").autoincrement().primaryKey(),
  accountId: int("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
  addressType: mysqlEnum("address_type", ["current", "permanent", "mailing"]).notNull(),
  addressData: json("address_data").$type<AddressData>().notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  accountIdx: index("aaddr_account_idx").on(table.accountId),
}));
