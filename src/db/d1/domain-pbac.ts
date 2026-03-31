/**
 * ARCHITECTURE OVERVIEW: Policy-Based Access Control (PBAC) Domain
 * 
 * Purpose:
 * Instantiates an attribute-based & policy-based access control standard (`edx_policy_definitions`). 
 * Discards legacy hard-coded boolean permission assignments in favor of dynamic JSON rule sets 
 * mapped per `tenant_id`, dynamically evaluating access without schema alterations per module.
 * 
 * Replaces Legacy Tables:
 * - infix_roles / roles / sm_role_permissions
 * - infix_module_infos / infix_module_managers / sm_modules / sm_module_permissions
 * - infix_permission_assigns / permissions / permission_sections / assign_permissions
 */
import { unique,  sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";

import { users, tenants, accounts } from "./domain-core";

// Policy-Based Access Control (PBAC) schema - dropped edx_ prefix

export type PolicyCondition = {
  field: string;
  operator: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "in" | "contains";
  value: any;
};

export type PolicyDefinition = {
  effect: "allow" | "deny";
  actions: string[]; // e.g. ["read", "write", "delete"]
  resources: string[]; // e.g. ["student:*", "finance:invoice"]
  conditions?: PolicyCondition[];
};

export const policyDefinitions = sqliteTable("domain_pbac_policy_definitions", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  tenantId: integer("tenant_id").references(() => tenants.id), // NULL = system-wide policy
  name: text("name", { length: 191 }).notNull(),
  description: text("description", { length: 500 }),
  definition: text("definition", { mode: "json" }).$type<PolicyDefinition>().notNull(),
  // Conflict resolution: higher priority wins when multiple policies match
  priority: integer("priority").default(0).notNull(),
  activeStatus: integer("active_status").default(1),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
}, (table) => ({
  tenantIdx: index("pol_tenant_idx").on(table.tenantId),
  priorityIdx: index("pol_priority_idx").on(table.tenantId, table.priority),
}));

// Role Assignment Metadata
export type RoleAssignmentMetadata = {
  isPrimary?: boolean;
  grantedBy?: number; // userId
  expiresAt?: string;
};

export const roleAssignments = sqliteTable("domain_pbac_role_assignments", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  userId: integer("user_id").notNull().references(() => users.id), // Persona
  accountId: integer("account_id").references(() => accounts.id), // Platform identity for account-level auth
  roleName: text("role_name", { length: 100 }).notNull(), // e.g. 'admin', 'teacher', 'student'
  metadata: text("metadata", { mode: "json" }).$type<RoleAssignmentMetadata>(),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
}, (table) => ({
  userRoleIdx: unique("role_assignment_unique").on(table.userId, table.roleName),
  userIdx: index("ra_user_idx").on(table.userId),
  accountIdx: index("ra_account_idx").on(table.accountId),
}));

// M:N binding between policies and role assignments
// Enables dynamic PBAC: "role X gets policy Y in tenant Z"
export const policyBindings = sqliteTable("domain_pbac_policy_bindings", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  policyId: integer("policy_id").notNull().references(() => policyDefinitions.id),
  roleAssignmentId: integer("role_assignment_id").notNull().references(() => roleAssignments.id),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
}, (table) => ({
  policyRoleIdx: unique("pb_policy_role_unique").on(table.policyId, table.roleAssignmentId),
  tenantIdx: index("pb_tenant_idx").on(table.tenantId),
}));
