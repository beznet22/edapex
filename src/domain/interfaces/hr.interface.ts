export type LeaveStatus = "pending" | "approved" | "rejected";
export type PayrollStatus = "draft" | "approved" | "disbursed" | "cancelled";

export interface IDepartment {
  id: string;
  tenantId: string;
  departmentName: string;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface IDesignation {
  id: string;
  tenantId: string;
  designationName: string;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface ILeaveType {
  id: string;
  tenantId: string;
  name: string;
  totalDays: number | null;
  activeStatus: number;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface ILeaveRequest {
  id: string;
  tenantId: string;
  userId: string;
  leaveTypeId: string | null;
  leaveType: string;
  applyDate: string;
  fromDate: string;
  toDate: string;
  reason: string | null;
  status: LeaveStatus;
  approvedBy: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface ISalaryTemplate {
  id: string;
  tenantId: string;
  name: string;
  components: any[]; // SalaryComponent[]
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface IPayrollRun {
  id: string;
  tenantId: string;
  userId: string;
  salaryTemplateId: string | null;
  payrollMonth: string;
  payrollYear: string;
  basicSalary: string;
  totalEarnings: string;
  totalDeductions: string;
  netSalary: string;
  status: PayrollStatus;
  paymentGenerated: number | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface IStaffEvaluation {
  id: string;
  tenantId: string;
  userId: string;
  evaluatorId: string;
  evaluationDate: string;
  overallScore: string | null;
  remarks: string | null;
  metadata: any | null;
  academicId: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface IHrRepository {
  // Structure
  getDepartments(tenantId: string): Promise<IDepartment[]>;
  getDesignations(tenantId: string): Promise<IDesignation[]>;
  
  // Leaves
  getLeaveRequestsByStaff(tenantId: string, userId: string): Promise<ILeaveRequest[]>;
  createLeaveRequest(data: Partial<ILeaveRequest>): Promise<ILeaveRequest>;
  updateLeaveStatus(tenantId: string, id: string, status: LeaveStatus, approverId: string): Promise<ILeaveRequest>;
  
  // Payroll
  getPayrollByStaff(tenantId: string, userId: string, month: string, year: string): Promise<IPayrollRun | null>;
  generatePayroll(data: Partial<IPayrollRun>): Promise<IPayrollRun>;
  
  // Evaluations
  createEvaluation(data: Partial<IStaffEvaluation>): Promise<IStaffEvaluation>;
}
