import { db } from "../../../db/index.js";
import { policyDefinitions, roleAssignments, policyBindings, PolicyDefinition } from "../../../db/mysql/domain-pbac.js";
import { IPbacRepository, IPolicyDefinition, IRoleAssignment, IPolicyBinding, PolicyDefinitionModel } from "../../interfaces/pbac.interface.js";
import { eq, and, sql } from "drizzle-orm";

export class MySqlPbacRepository implements IPbacRepository {
  private mapToDomain(row: any): IPolicyDefinition {
    return {
      ...row,
      createdAt: row.createdAt ? new Date(row.createdAt) : null,
      updatedAt: row.updatedAt ? new Date(row.updatedAt) : null,
    };
  }

  private mapRoleToDomain(row: any): IRoleAssignment {
    return {
      ...row,
      createdAt: row.createdAt ? new Date(row.createdAt) : null,
      updatedAt: row.updatedAt ? new Date(row.updatedAt) : null,
    };
  }

  async getPolicies(tenantId: string | null): Promise<IPolicyDefinition[]> {
    const results = await db
      .select()
      .from(policyDefinitions)
      .where(tenantId ? eq(policyDefinitions.tenantId, tenantId) : sql`${policyDefinitions.tenantId} IS NULL`);
    
    return results.map(this.mapToDomain);
  }

  async getPolicyById(tenantId: string | null, id: string): Promise<IPolicyDefinition | null> {
    const [result] = await db
      .select()
      .from(policyDefinitions)
      .where(and(
        eq(policyDefinitions.id, id),
        tenantId ? eq(policyDefinitions.tenantId, tenantId) : sql`${policyDefinitions.tenantId} IS NULL`
      ));
    
    return result ? this.mapToDomain(result) : null;
  }

  async createPolicy(data: Omit<IPolicyDefinition, "id" | "createdAt" | "updatedAt">): Promise<IPolicyDefinition> {
    await db.insert(policyDefinitions).values(data as any);
    const newPolicy = await this.getPolicyById((data as any).tenantId || null, (data as any).id);
    if (!newPolicy) throw new Error("Failed to create policy");
    return newPolicy;
  }

  async updatePolicy(tenantId: string, id: string, data: Partial<PolicyDefinitionModel>): Promise<IPolicyDefinition | null> {
    await db.update(policyDefinitions)
      .set({ definition: data as any })
      .where(and(eq(policyDefinitions.id, id), eq(policyDefinitions.tenantId, tenantId)));
    
    return this.getPolicyById(tenantId, id);
  }

  async getRoleAssignments(tenantId: string, userId: string): Promise<IRoleAssignment[]> {
    const results = await db
      .select()
      .from(roleAssignments)
      .where(and(
        eq(roleAssignments.tenantId, tenantId),
        eq(roleAssignments.userId, userId)
      ));
    
    return results.map(this.mapRoleToDomain);
  }

  async assignRole(data: Omit<IRoleAssignment, "id" | "createdAt" | "updatedAt">): Promise<IRoleAssignment> {
    await db.insert(roleAssignments).values(data as any);
    const [newRole] = await db
      .select()
      .from(roleAssignments)
      .where(and(
        eq(roleAssignments.id, (data as any).id),
        eq(roleAssignments.tenantId, (data as any).tenantId)
      ));
    
    if (!newRole) throw new Error("Failed to assign role");
    return this.mapRoleToDomain(newRole);
  }

  async removeRole(tenantId: string, id: string): Promise<boolean> {
    const result = await db.delete(roleAssignments).where(and(eq(roleAssignments.id, id), eq(roleAssignments.tenantId, tenantId)));
    return (result as any).rowsAffected > 0;
  }

  async bindPolicyToRole(tenantId: string, policyId: string, roleAssignmentId: string): Promise<IPolicyBinding> {
    await db.insert(policyBindings).values({
      tenantId,
      policyId,
      roleAssignmentId
    });
    
    const [newBinding] = await db
      .select()
      .from(policyBindings)
      .where(and(
        eq(policyBindings.policyId, policyId),
        eq(policyBindings.roleAssignmentId, roleAssignmentId),
        eq(policyBindings.tenantId, tenantId)
      ));
    
    if (!newBinding) throw new Error("Failed to bind policy");
    return {
      ...newBinding,
      createdAt: newBinding.createdAt ? new Date(newBinding.createdAt) : null,
      updatedAt: newBinding.updatedAt ? new Date(newBinding.updatedAt) : null,
    };
  }

  async getBindingsByRoleAssignment(tenantId: string, roleAssignmentId: string): Promise<IPolicyBinding[]> {
    const results = await db
      .select()
      .from(policyBindings)
      .where(and(
        eq(policyBindings.roleAssignmentId, roleAssignmentId),
        eq(policyBindings.tenantId, tenantId)
      ));
    
    return results.map((row: any) => ({
      ...row,
      createdAt: row.createdAt ? new Date(row.createdAt) : null,
      updatedAt: row.updatedAt ? new Date(row.updatedAt) : null,
    }));
  }
}
