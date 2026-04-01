import { db } from "../../../db/index.js";
import { 
  homeschoolSubscriptions, 
  homeschoolSchedules, 
  homeschoolPortfolios,
  revenueShares
} from "../../../db/mysql/domain-homeschool.js";
import { 
  IHomeschoolRepository, 
  IHomeschoolSubscription, 
  IHomeschoolSchedule, 
  IHomeschoolPortfolio,
  IRevenueShare
} from "../../interfaces/homeschool.interface.js";
import { eq, and } from "drizzle-orm";

export class MySqlHomeschoolRepository implements IHomeschoolRepository {
  private mapSubscription(row: any): IHomeschoolSubscription {
    return {
      ...row,
      createdAt: row.createdAt ? new Date(row.createdAt) : null,
      updatedAt: row.updatedAt ? new Date(row.updatedAt) : null,
      renewsAt: row.renewsAt ? new Date(row.renewsAt) : null,
    };
  }

  private mapSchedule(row: any): IHomeschoolSchedule {
    return {
      ...row,
      createdAt: row.createdAt ? new Date(row.createdAt) : null,
      updatedAt: row.updatedAt ? new Date(row.updatedAt) : null,
    };
  }

  private mapPortfolio(row: any): IHomeschoolPortfolio {
    return {
      ...row,
      createdAt: row.createdAt ? new Date(row.createdAt) : null,
      updatedAt: row.updatedAt ? new Date(row.updatedAt) : null,
    };
  }

  private mapRevenueShare(row: any): IRevenueShare {
    return {
      ...row,
      createdAt: row.createdAt ? new Date(row.createdAt) : null,
      updatedAt: row.updatedAt ? new Date(row.updatedAt) : null,
    };
  }

  async getSubscription(tenantId: string, academicId: string): Promise<IHomeschoolSubscription[]> {
    const results = await db
      .select()
      .from(homeschoolSubscriptions)
      .where(and(eq(homeschoolSubscriptions.tenantId, tenantId), eq(homeschoolSubscriptions.academicId, academicId)));
    return results.map((row: any) => this.mapSubscription(row));
  }

  async createSubscription(data: Partial<IHomeschoolSubscription>): Promise<IHomeschoolSubscription> {
    await db.insert(homeschoolSubscriptions).values(data as any);
    const [row] = await db.select().from(homeschoolSubscriptions).where(and(eq(homeschoolSubscriptions.id, data.id!), eq(homeschoolSubscriptions.tenantId, data.tenantId!)));
    if (!row) throw new Error("Failed to create homeschool subscription");
    return this.mapSubscription(row);
  }

  async getSchedules(tenantId: string, userId: string, academicId: string): Promise<IHomeschoolSchedule[]> {
    const results = await db
      .select()
      .from(homeschoolSchedules)
      .where(and(
        eq(homeschoolSchedules.tenantId, tenantId),
        eq(homeschoolSchedules.userId, userId), 
        eq(homeschoolSchedules.academicId, academicId)
      ));
    return results.map((row: any) => this.mapSchedule(row));
  }

  async createSchedule(data: Partial<IHomeschoolSchedule>): Promise<IHomeschoolSchedule> {
    await db.insert(homeschoolSchedules).values(data as any);
    const [row] = await db.select().from(homeschoolSchedules).where(and(eq(homeschoolSchedules.id, data.id!), eq(homeschoolSchedules.tenantId, data.tenantId!)));
    if (!row) throw new Error("Failed to create homeschool schedule");
    return this.mapSchedule(row);
  }

  async getPortfolios(tenantId: string, userId: string, academicId: string): Promise<IHomeschoolPortfolio[]> {
    const results = await db
      .select()
      .from(homeschoolPortfolios)
      .where(and(
        eq(homeschoolPortfolios.tenantId, tenantId),
        eq(homeschoolPortfolios.userId, userId), 
        eq(homeschoolPortfolios.academicId, academicId)
      ));
    return results.map((row: any) => this.mapPortfolio(row));
  }

  async createPortfolio(data: Partial<IHomeschoolPortfolio>): Promise<IHomeschoolPortfolio> {
    await db.insert(homeschoolPortfolios).values(data as any);
    const [row] = await db.select().from(homeschoolPortfolios).where(and(eq(homeschoolPortfolios.id, data.id!), eq(homeschoolPortfolios.tenantId, data.tenantId!)));
    if (!row) throw new Error("Failed to create homeschool portfolio");
    return this.mapPortfolio(row);
  }

  async getRevenueShares(tenantId: string, facilitatorId: string): Promise<IRevenueShare[]> {
    const results = await db
      .select()
      .from(revenueShares)
      .where(and(eq(revenueShares.tenantId, tenantId), eq(revenueShares.facilitatorId, facilitatorId)));
    return results.map((row: any) => this.mapRevenueShare(row));
  }
}
