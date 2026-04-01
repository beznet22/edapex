/**
 * PBAC Domain Interfaces
 * 
 * Aligned with docs/domains/pbac.md
 */

export type PolicyEffect = "allow" | "deny";

export interface PolicyCondition {
  field: string;
  operator: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "in" | "contains";
  value: any;
}

export interface PolicyDefinitionModel {
  effect: PolicyEffect;
  actions: string[];
  resources: string[];
  conditions?: PolicyCondition[];
}

export interface IPolicyDefinition {
  id: string;
  tenantId: string | null;
  name: string;
  description: string | null;
  definition: PolicyDefinitionModel;
  priority: number;
  activeStatus: number | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface IRoleAssignmentMetadata {
  isPrimary?: boolean;
  grantedBy?: string;
  expiresAt?: string;
}

export interface IRoleAssignment {
  id: string;
  tenantId: string;
  userId: string;
  accountId: string | null;
  roleName: string;
  metadata: IRoleAssignmentMetadata | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface IPolicyBinding {
  id: string;
  tenantId: string;
  policyId: string;
  roleAssignmentId: string;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface IPbacRepository {
  // Policy Definitions
  getPolicies(tenantId: string | null): Promise<IPolicyDefinition[]>;
  getPolicyById(tenantId: string | null, id: string): Promise<IPolicyDefinition | null>;
  createPolicy(data: Omit<IPolicyDefinition, "id" | "createdAt" | "updatedAt">): Promise<IPolicyDefinition>;
  updatePolicy(tenantId: string, id: string, data: Partial<PolicyDefinitionModel>): Promise<IPolicyDefinition | null>;

  // Role Assignments
  getRoleAssignments(tenantId: string, userId: string): Promise<IRoleAssignment[]>;
  assignRole(data: Omit<IRoleAssignment, "id" | "createdAt" | "updatedAt">): Promise<IRoleAssignment>;
  removeRole(tenantId: string, id: string): Promise<boolean>;

  // Policy Bindings
  bindPolicyToRole(tenantId: string, policyId: string, roleAssignmentId: string): Promise<IPolicyBinding>;
  getBindingsByRoleAssignment(tenantId: string, roleAssignmentId: string): Promise<IPolicyBinding[]>;
}
