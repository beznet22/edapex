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
  id: number;
  tenantId: number | null;
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
  grantedBy?: number;
  expiresAt?: string;
}

export interface IRoleAssignment {
  id: number;
  tenantId: number;
  userId: number;
  accountId: number | null;
  roleName: string;
  metadata: IRoleAssignmentMetadata | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface IPolicyBinding {
  id: number;
  tenantId: number;
  policyId: number;
  roleAssignmentId: number;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface IPbacRepository {
  // Policy Definitions
  getPolicies(tenantId: number | null): Promise<IPolicyDefinition[]>;
  getPolicyById(id: number): Promise<IPolicyDefinition | null>;
  createPolicy(data: Omit<IPolicyDefinition, "id" | "createdAt" | "updatedAt">): Promise<IPolicyDefinition>;
  updatePolicy(id: number, data: Partial<PolicyDefinitionModel>): Promise<IPolicyDefinition | null>;

  // Role Assignments
  getRoleAssignments(tenantId: number, userId: number): Promise<IRoleAssignment[]>;
  assignRole(data: Omit<IRoleAssignment, "id" | "createdAt" | "updatedAt">): Promise<IRoleAssignment>;
  removeRole(id: number): Promise<boolean>;

  // Policy Bindings
  bindPolicyToRole(tenantId: number, policyId: number, roleAssignmentId: number): Promise<IPolicyBinding>;
  getBindingsByRoleAssignment(roleAssignmentId: number): Promise<IPolicyBinding[]>;
}
