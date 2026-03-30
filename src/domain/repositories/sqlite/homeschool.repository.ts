import { db } from "../../../db/index.js";
import { 
  homeschoolSubscriptions, 
  homeschoolSchedules, 
  homeschoolPortfolios 
} from "../../../db/sqlite/domain-homeschool.js";
import { 
  IHomeschoolRepository, 
  IHomeschoolSubscription, 
  IHomeschoolSchedule, 
  IHomeschoolPortfolio 
} from "../../interfaces/homeschool.interface.js";
import { eq, and } from "drizzle-orm";

export class SqliteHomeschoolRepository implements IHomeschoolRepository {
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

  async getSubscription(tenantId: number, academicId: number): Promise<IHomeschoolSubscription[]> {
    const results = await db
      .select()
      .from(homeschoolSubscriptions)
      .where(and(eq(homeschoolSubscriptions.tenantId, tenantId), eq(homeschoolSubscriptions.academicId, academicId)));
    return results.map((row: any) => this.mapSubscription(row));
  }

  async createSubscription(data: Partial<IHomeschoolSubscription>): Promise<IHomeschoolSubscription> {
    const [result] = await db.insert(homeschoolSubscriptions).values(data as any).returning();
    if (!result) throw new Error("Failed to create homeschool subscription");
    return this.mapSubscription(result);
  }

  async getSchedules(userId: number, academicId: number): Promise<IHomeschoolSchedule[]> {
    const results = await db
      .select()
      .from(homeschoolSchedules)
      .where(and(eq(homeschoolSchedules.userId, userId), eq(homeschoolSchedules.academicId, academicId)));
    return results.map((row: any) => this.mapSchedule(row));
  }

  async createSchedule(data: Partial<IHomeschoolSchedule>): Promise<IHomeschoolSchedule> {
    const [result] = await db.insert(homeschoolSchedules).values(data as any).returning();
    if (!result) throw new Error("Failed to create homeschool schedule");
    return this.mapSchedule(result);
  }

  async getPortfolios(userId: number, academicId: number): Promise<IHomeschoolPortfolio[]> {
    const results = await db
      .select()
      .from(homeschoolPortfolios)
      .where(and(eq(homeschoolPortfolios.userId, userId), eq(homeschoolPortfolios.academicId, academicId)));
    return results.map((row: any) => this.mapPortfolio(row));
  }

  async createPortfolio(data: Partial<IHomeschoolPortfolio>): Promise<IHomeschoolPortfolio> {
    const [result] = await db.insert(homeschoolPortfolios).values(data as any).returning();
    if (!result) throw new Error("Failed to create homeschool portfolio");
    return this.mapPortfolio(result);
  }
}
