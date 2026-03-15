import { pgSchema, text, timestamp, uuid, boolean, jsonb, pgTable } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const core = pgSchema("core");

/**
 * TENANTS (Consolidated from sm_schools)
 * Strict multi-tenancy foundation.
 */
export const tenants = core.table("tenants", {
  id: uuid("id").primaryKey().default(sql`gen_uuidv7()`), // Custom UUIDv7 generator
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  config: jsonb("config").notNull().default({}), // Global settings, notification providers
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * USERS (Unified identity)
 */
export const users = core.table("users", {
  id: uuid("id").primaryKey().default(sql`gen_uuidv7()`),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  fullName: text("full_name").notNull(),
  email: text("email").notNull(),
  roleId: uuid("role_id"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => {
  return [
    {
      uniqueEmailPerTenant: sql`UNIQUE(${table.tenantId}, ${table.email})`,
    }
  ];
});

/**
 * ROLES (Unified RBAC/PBAC)
 */
export const roles = core.table("roles", {
  id: uuid("id").primaryKey().default(sql`gen_uuidv7()`),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  permissions: jsonb("permissions").notNull().default([]), // Resource-Action mapping
}, (table) => {
  return [
    {
      uniqueRolePerTenant: sql`UNIQUE(${table.tenantId}, ${table.name})`,
    }
  ];
});

/**
 * CREDENTIALS (Secure authentication storage)
 */
export const credentials = core.table("credentials", {
  id: uuid("id").primaryKey().default(sql`gen_uuidv7()`),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  type: text("type").notNull(), // 'password', 'api_key', 'mfa_totp'
  secret: text("secret").notNull(),
  meta: jsonb("meta").default({}), // Salt, Algorithm, Expiry
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * POLICIES (PBAC Policy Engine Rules as per PBAC.md)
 */
export const policies = core.table("policies", {
  id: uuid("id").primaryKey().default(sql`gen_uuidv7()`),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  name: text("name").notNull(), // e.g., 'grade_exam'
  description: text("description"),
  rules: jsonb("rules").notNull(), // The YAML/JSON rules from PBAC.md
  isActive: boolean("is_active").default(true).notNull(),
}, (table) => {
  return [
    {
      uniquePolicyPerTenant: sql`UNIQUE(${table.tenantId}, ${table.name})`,
    }
  ];
});

/**
 * AUDIT LOG (Unified event stream)
 */
export const auditLog = core.table("audit_log", {
  id: uuid("id").primaryKey().default(sql`gen_uuidv7()`),
  tenantId: uuid("tenant_id").notNull(),
  actorId: uuid("actor_id").references(() => users.id),
  action: text("action").notNull(), // 'create', 'update', 'delete', 'login'
  resource: text("resource").notNull(), // 'student', 'exam', 'fee'
  changes: jsonb("changes"), // { before, after }
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
