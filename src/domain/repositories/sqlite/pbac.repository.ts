import { db } from "../../../db/index.js";
import { policyDefinitions, roleAssignments, policyBindings, PolicyDefinition } from "../../../db/sqlite/domain-pbac.js";
import { IPbacRepository, IPolicyDefinition, IRoleAssignment, IPolicyBinding, PolicyDefinitionModel } from "../../interfaces/pbac.interface.js";
import { eq, and, sql } from "drizzle-orm";

export class SqlitePbacRepository implements IPbacRepository {
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

  async getPolicies(tenantId: number | null): Promise<IPolicyDefinition[]> {
    const results = await db
      .select()
      .from(policyDefinitions)
      .where(tenantId ? eq(policyDefinitions.tenantId, tenantId) : sql`${policyDefinitions.tenantId} IS NULL`);
    
    return results.map(this.mapToDomain);
  }

  async getPolicyById(id: number): Promise<IPolicyDefinition | null> {
    const [result] = await db
      .select()
      .from(policyDefinitions)
      .where(eq(policyDefinitions.id, id));
    
    return result ? this.mapToDomain(result) : null;
  }

  async createPolicy(data: Omit<IPolicyDefinition, "id" | "createdAt" | "updatedAt">): Promise<IPolicyDefinition> {
    const [result] = await db.insert(policyDefinitions).values(data as any).returning();
    if (!result) throw new Error("Failed to create policy");
    return this.mapToDomain(result);
  }

  async updatePolicy(id: number, data: Partial<PolicyDefinitionModel>): Promise<IPolicyDefinition | null> {
    const [result] = await db.update(policyDefinitions)
      .set({ definition: data as any })
      .where(eq(policyDefinitions.id, id))
      .returning();
    
    return result ? this.mapToDomain(result) : null;
  }

  async getRoleAssignments(tenantId: number, userId: number): Promise<IRoleAssignment[]> {
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
    const [result] = await db.insert(roleAssignments).values(data as any).returning();
    if (!result) throw new Error("Failed to assign role");
    return this.mapRoleToDomain(result);
  }

  async removeRole(id: number): Promise<boolean> {
    const [result] = await db.delete(roleAssignments).where(eq(roleAssignments.id, id)).returning();
    return !!result;
  }

  async bindPolicyToRole(tenantId: number, policyId: number, roleAssignmentId: number): Promise<IPolicyBinding> {
    const [result] = await db.insert(policyBindings).values({
      tenantId,
      policyId,
      roleAssignmentId
    }).returning();
    
    if (!result) throw new Error("Failed to bind policy");
    return {
      ...result,
      createdAt: result.createdAt ? new Date(result.createdAt) : null,
      updatedAt: result.updatedAt ? new Date(result.updatedAt) : null,
    };
  }

  async getBindingsByRoleAssignment(roleAssignmentId: number): Promise<IPolicyBinding[]> {
    const results = await db
      .select()
      .from(policyBindings)
      .where(eq(policyBindings.roleAssignmentId, roleAssignmentId));
    
    return results.map((row: any) => ({
      ...row,
      createdAt: row.createdAt ? new Date(row.createdAt) : null,
      updatedAt: row.updatedAt ? new Date(row.updatedAt) : null,
    }));
  }
}
