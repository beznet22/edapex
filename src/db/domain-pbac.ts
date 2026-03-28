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
import {

  mysqlTable,
  varchar,
  int,
  timestamp,
  json,
  index,
  unique,
} from "drizzle-orm/mysql-core";

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

export const policyDefinitions = mysqlTable("policy_definitions", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").references(() => tenants.id), // NULL = system-wide policy
  name: varchar("name", { length: 191 }).notNull(),
  description: varchar("description", { length: 500 }),
  definition: json("definition").$type<PolicyDefinition>().notNull(),
  activeStatus: int("active_status").default(1),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
  tenantIdx: index("pol_tenant_idx").on(table.tenantId),
}));

// Role Assignment Metadata
export type RoleAssignmentMetadata = {
  isPrimary?: boolean;
  grantedBy?: number; // userId
  expiresAt?: string;
};

export const roleAssignments = mysqlTable("role_assignments", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id),
  userId: int("user_id").notNull().references(() => users.id), // Persona
  roleName: varchar("role_name", { length: 100 }).notNull(), // e.g. 'admin', 'teacher', 'student'
  metadata: json("metadata").$type<RoleAssignmentMetadata>(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
  userRoleIdx: unique("role_assignment_unique").on(table.userId, table.roleName),
  userIdx: index("ra_user_idx").on(table.userId),
}));
