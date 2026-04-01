import { db } from "../../../db/index.js";
import { 
  hrDepartments, 
  hrDesignations, 
  hrLeaveRequests, 
  payrollRuns, 
  staffEvaluations 
} from "../../../db/sqlite/domain-hr.js";
import { 
  IHrRepository, 
  IDepartment, 
  IDesignation, 
  ILeaveRequest, 
  IPayrollRun, 
  IStaffEvaluation,
  LeaveStatus
} from "../../interfaces/hr.interface.js";
import { eq, and } from "drizzle-orm";

export class SqliteHrRepository implements IHrRepository {
  private mapLeaveRequest(row: any): ILeaveRequest {
    return {
      ...row,
      createdAt: row.createdAt ? new Date(row.createdAt) : null,
      updatedAt: row.updatedAt ? new Date(row.updatedAt) : null,
    };
  }

  private mapPayrollRun(row: any): IPayrollRun {
    return {
      ...row,
      createdAt: row.createdAt ? new Date(row.createdAt) : null,
      updatedAt: row.updatedAt ? new Date(row.updatedAt) : null,
    };
  }

  private mapEvaluation(row: any): IStaffEvaluation {
    return {
      ...row,
      createdAt: row.createdAt ? new Date(row.createdAt) : null,
      updatedAt: row.updatedAt ? new Date(row.updatedAt) : null,
    };
  }

  // --- Structure ---
  async getDepartments(tenantId: string): Promise<IDepartment[]> {
    const results = await db.select().from(hrDepartments).where(eq(hrDepartments.tenantId, tenantId));
    return results.map((row: any) => ({
      ...row,
      createdAt: row.createdAt ? new Date(row.createdAt) : null,
      updatedAt: row.updatedAt ? new Date(row.updatedAt) : null,
    }));
  }

  async getDesignations(tenantId: string): Promise<IDesignation[]> {
    const results = await db.select().from(hrDesignations).where(eq(hrDesignations.tenantId, tenantId));
    return results.map((row: any) => ({
      ...row,
      createdAt: row.createdAt ? new Date(row.createdAt) : null,
      updatedAt: row.updatedAt ? new Date(row.updatedAt) : null,
    }));
  }

  // --- Leaves ---
  async getLeaveRequestsByStaff(userId: string): Promise<ILeaveRequest[]> {
    const results = await db.select().from(hrLeaveRequests).where(eq(hrLeaveRequests.userId, userId));
    return results.map((row: any) => this.mapLeaveRequest(row));
  }

  async createLeaveRequest(data: Partial<ILeaveRequest>): Promise<ILeaveRequest> {
    const [result] = await db.insert(hrLeaveRequests).values(data as any).returning();
    if (!result) throw new Error("Failed to create leave request");
    return this.mapLeaveRequest(result);
  }

  async updateLeaveStatus(tenantId: string, id: string, status: LeaveStatus, approverId: string): Promise<ILeaveRequest> {
    const [result] = await db.update(hrLeaveRequests)
      .set({ status, approvedBy: approverId })
      .where(and(eq(hrLeaveRequests.id, id), eq(hrLeaveRequests.tenantId, tenantId)))
      .returning();
    
    if (!result) throw new Error("Failed to update leave status");
    return this.mapLeaveRequest(result);
  }

  // --- Payroll ---
  async getPayrollByStaff(userId: string, month: string, year: string): Promise<IPayrollRun | null> {
    const [result] = await db
      .select()
      .from(payrollRuns)
      .where(and(
        eq(payrollRuns.userId, userId),
        eq(payrollRuns.payrollMonth, month),
        eq(payrollRuns.payrollYear, year)
      ));
    return result ? this.mapPayrollRun(result) : null;
  }

  async generatePayroll(data: Partial<IPayrollRun>): Promise<IPayrollRun> {
    const [result] = await db.insert(payrollRuns).values(data as any).returning();
    if (!result) throw new Error("Failed to generate payroll");
    return this.mapPayrollRun(result);
  }

  // --- Evaluations ---
  async createEvaluation(data: Partial<IStaffEvaluation>): Promise<IStaffEvaluation> {
    const [result] = await db.insert(staffEvaluations).values(data as any).returning();
    if (!result) throw new Error("Failed to create evaluation");
    return this.mapEvaluation(result);
  }
}
