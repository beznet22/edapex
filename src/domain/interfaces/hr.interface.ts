export type LeaveStatus = "pending" | "approved" | "rejected";
export type PayrollStatus = "draft" | "approved" | "disbursed" | "cancelled";

export interface IDepartment {
  id: number;
  tenantId: number;
  departmentName: string;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface IDesignation {
  id: number;
  tenantId: number;
  designationName: string;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface ILeaveType {
  id: number;
  tenantId: number;
  name: string;
  totalDays: number | null;
  activeStatus: number;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface ILeaveRequest {
  id: number;
  tenantId: number;
  userId: number;
  leaveTypeId: number | null;
  leaveType: string;
  applyDate: string;
  fromDate: string;
  toDate: string;
  reason: string | null;
  status: LeaveStatus;
  approvedBy: number | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface ISalaryTemplate {
  id: number;
  tenantId: number;
  name: string;
  components: any[]; // SalaryComponent[]
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface IPayrollRun {
  id: number;
  tenantId: number;
  userId: number;
  salaryTemplateId: number | null;
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
  id: number;
  tenantId: number;
  userId: number;
  evaluatorId: number;
  evaluationDate: string;
  overallScore: string | null;
  remarks: string | null;
  metadata: any | null;
  academicId: number | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface IHrRepository {
  // Structure
  getDepartments(tenantId: number): Promise<IDepartment[]>;
  getDesignations(tenantId: number): Promise<IDesignation[]>;
  
  // Leaves
  getLeaveRequestsByStaff(userId: number): Promise<ILeaveRequest[]>;
  createLeaveRequest(data: Partial<ILeaveRequest>): Promise<ILeaveRequest>;
  updateLeaveStatus(id: number, status: LeaveStatus, approverId: number): Promise<ILeaveRequest>;
  
  // Payroll
  getPayrollByStaff(userId: number, month: string, year: string): Promise<IPayrollRun | null>;
  generatePayroll(data: Partial<IPayrollRun>): Promise<IPayrollRun>;
  
  // Evaluations
  createEvaluation(data: Partial<IStaffEvaluation>): Promise<IStaffEvaluation>;
}
