import { db } from "../../../db/index.js";
import { 
  hrDepartments, 
  hrDesignations, 
  leaveTypes, 
  hrLeaveRequests, 
  salaryTemplates, 
  payrollRuns, 
  staffEvaluations 
} from "../../../db/mysql/domain-hr.js";
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

export class MySqlHrRepository implements IHrRepository {
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
  async getLeaveRequestsByStaff(tenantId: string, userId: string): Promise<ILeaveRequest[]> {
    const results = await db
      .select()
      .from(hrLeaveRequests)
      .where(and(eq(hrLeaveRequests.tenantId, tenantId), eq(hrLeaveRequests.userId, userId)));
    return results.map((row: any) => this.mapLeaveRequest(row));
  }

  async createLeaveRequest(data: Partial<ILeaveRequest>): Promise<ILeaveRequest> {
    await db.insert(hrLeaveRequests).values(data as any);
    const [newRequest] = await db.select().from(hrLeaveRequests).where(eq(hrLeaveRequests.id, data.id!));
    if (!newRequest) throw new Error("Failed to create leave request");
    return this.mapLeaveRequest(newRequest);
  }

  async updateLeaveStatus(tenantId: string, id: string, status: LeaveStatus, approverId: string): Promise<ILeaveRequest> {
    await db.update(hrLeaveRequests)
      .set({ status, approvedBy: approverId })
      .where(and(eq(hrLeaveRequests.id, id), eq(hrLeaveRequests.tenantId, tenantId)));
    
    const [updated] = await db.select().from(hrLeaveRequests).where(eq(hrLeaveRequests.id, id));
    if (!updated) throw new Error("Failed to update leave status");
    return this.mapLeaveRequest(updated);
  }

  // --- Payroll ---
  async getPayrollByStaff(tenantId: string, userId: string, month: string, year: string): Promise<IPayrollRun | null> {
    const [result] = await db
      .select()
      .from(payrollRuns)
      .where(and(
        eq(payrollRuns.tenantId, tenantId),
        eq(payrollRuns.userId, userId),
        eq(payrollRuns.payrollMonth, month),
        eq(payrollRuns.payrollYear, year)
      ));
    return result ? this.mapPayrollRun(result) : null;
  }

  async generatePayroll(data: Partial<IPayrollRun>): Promise<IPayrollRun> {
    await db.insert(payrollRuns).values(data as any);
    const [newPayroll] = await db.select().from(payrollRuns).where(eq(payrollRuns.id, data.id!));
    if (!newPayroll) throw new Error("Failed to generate payroll");
    return this.mapPayrollRun(newPayroll);
  }

  // --- Evaluations ---
  async createEvaluation(data: Partial<IStaffEvaluation>): Promise<IStaffEvaluation> {
    await db.insert(staffEvaluations).values(data as any);
    const [newEval] = await db.select().from(staffEvaluations).where(eq(staffEvaluations.id, data.id!));
    if (!newEval) throw new Error("Failed to create evaluation");
    return this.mapEvaluation(newEval);
  }
}
