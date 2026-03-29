import { ICoreRepository, ITenant, IAccount, IAcademicYear, IEnumerator } from "../../interfaces/core.interface.js";
import { db } from "../../../db/index.js";
import { tenants, accounts, academicYears, enumerations } from "../../../db/mysql/domain-core.js";
import { eq, and, isNull } from "drizzle-orm";

export class MySqlCoreRepository implements ICoreRepository {
  private mapTenant(row: any): ITenant {
    return {
      ...row,
      createdAt: row.createdAt ? new Date(row.createdAt) : null,
      updatedAt: row.updatedAt ? new Date(row.updatedAt) : null,
    };
  }

  private mapAccount(row: any): IAccount {
    return {
      ...row,
      createdAt: row.createdAt ? new Date(row.createdAt) : null,
      updatedAt: row.updatedAt ? new Date(row.updatedAt) : null,
    };
  }

  private mapAcademicYear(row: any): IAcademicYear {
    return {
      ...row,
      createdAt: row.createdAt ? new Date(row.createdAt) : null,
      updatedAt: row.updatedAt ? new Date(row.updatedAt) : null,
    };
  }

  private mapEnum(row: any): IEnumerator {
    return {
      ...row,
      createdAt: row.createdAt ? new Date(row.createdAt) : null,
      updatedAt: row.updatedAt ? new Date(row.updatedAt) : null,
    };
  }

  async getTenantById(id: number): Promise<ITenant | null> {
    const [result] = await db.select().from(tenants).where(eq(tenants.id, id));
    return result ? this.mapTenant(result) : null;
  }

  async getTenantByDomain(domain: string): Promise<ITenant | null> {
    const [result] = await db.select().from(tenants).where(eq(tenants.code, domain));
    return result ? this.mapTenant(result) : null;
  }

  async createTenant(data: Partial<ITenant>): Promise<ITenant> {
    const [result] = await db.insert(tenants).values(data as any);
    const tenant = await this.getTenantById(result.insertId);
    if (!tenant) throw new Error("Failed to create tenant");
    return tenant;
  }

  async getAccountById(accountId: string): Promise<IAccount | null> {
    const [result] = await db.select().from(accounts).where(eq(accounts.id, accountId));
    return result ? this.mapAccount(result) : null;
  }

  async getAccountByEmail(email: string): Promise<IAccount | null> {
    const [result] = await db.select().from(accounts).where(eq(accounts.email, email));
    return result ? this.mapAccount(result) : null;
  }

  async getAcademicYears(tenantId: number): Promise<IAcademicYear[]> {
    const results = await db.select().from(academicYears).where(eq(academicYears.tenantId, tenantId));
    return results.map(this.mapAcademicYear);
  }

  async getCurrentAcademicYear(tenantId: number): Promise<IAcademicYear | null> {
    const [result] = await db.select().from(academicYears).where(and(eq(academicYears.tenantId, tenantId), eq(academicYears.isCurrent, 1)));
    return result ? this.mapAcademicYear(result) : null;
  }

  async getEnumsByDomain(tenantId: number | null, domain: string): Promise<IEnumerator[]> {
    const results = await db.select().from(enumerations).where(and(
      tenantId ? eq(enumerations.tenantId, tenantId) : isNull(enumerations.tenantId),
      eq(enumerations.domain, domain)
    ));
    return results.map(this.mapEnum);
  }
}
