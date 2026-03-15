import {
  mysqlTable,
  varchar,
  int,
  timestamp,
  mysqlEnum,
  json,
  index,
} from "drizzle-orm/mysql-core";

import { accounts } from "./domain-core";

// Replaces the 5-way permission system (permissions, assign_permissions, infix_permission_assigns, sm_role_permissions, sm_module_permission_assigns)

export const policyDefinitions = mysqlTable("edx_policy_definitions", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id"),  // NULL = global/system policy
  policyName: varchar("policy_name", { length: 100 }).notNull(),
  resource: varchar("resource", { length: 100 }).notNull(),  // 'student', 'exam', 'fee', etc.
  action: varchar("action", { length: 50 }).notNull(),      // 'read', 'write', 'delete', 'approve'
  conditions: json("conditions").notNull(),        // PBAC condition expressions
  effect: mysqlEnum("effect", ["allow", "deny"]).notNull().default("allow"),
  priority: int("priority").default(0),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  tenantResourceIdx: index("policy_tenant_resource_idx").on(table.tenantId, table.resource),
}));

export const roleAssignments = mysqlTable("edx_role_assignments", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull(),
  accountId: int("account_id").notNull().references(() => accounts.id),
  roleName: varchar("role_name", { length: 50 }).notNull(),
  scope: json("scope"),  // { classIds: [...], sectionIds: [...], subjectIds: [...] }
  validFrom: timestamp("valid_from").defaultNow(),
  validTo: timestamp("valid_to"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  accountIdx: index("role_account_idx").on(table.accountId),
  tenantRoleIdx: index("role_tenant_idx").on(table.tenantId, table.roleName),
}));
