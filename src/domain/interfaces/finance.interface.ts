export interface IFinanceRepository {
  // --- Ledger ---
  getLedgerEntries(tenantId: number, filter?: { type?: string; userId?: number; academicId?: number }): Promise<ILedgerEntry[]>;
  createLedgerEntry(data: Partial<ILedgerEntry>): Promise<ILedgerEntry>;
  
  // --- Fees Configuration ---
  getFeeMasters(tenantId: number, academicId: number): Promise<IFeeMaster[]>;
  createFeeMaster(data: Partial<IFeeMaster>): Promise<IFeeMaster>;
  getFeeTypes(tenantId: number): Promise<IFeeType[]>;
  
  // --- Assignments & Payments ---
  getStudentFeeAssignments(userId: number): Promise<IFeeAssignment[]>;
  assignFeeToStudent(data: Partial<IFeeAssignment>): Promise<IFeeAssignment>;
  updateFeeAssignment(id: number, data: Partial<IFeeAssignment>): Promise<void>;
  
  // --- Invoices ---
  getInvoices(tenantId: number, userId?: number): Promise<IInvoice[]>;
  createInvoice(data: Partial<IInvoice>): Promise<IInvoice>;
}

export interface ILedgerEntry {
  id: number;
  tenantId: number;
  transactionType: "fee_payment" | "fee_waiver" | "salary" | "expense" | "income" | "refund" | "wallet_topup";
  direction: "credit" | "debit";
  amount: string | number;
  userId?: number | null;
  enrollmentId?: number | null;
  referenceType?: string | null;
  referenceId?: number | null;
  metadata?: any;
  postedAt?: Date | null;
  academicId?: number | null;
  createdAt?: Date | null;
  updatedAt?: Date | null;
}

export interface IFeeMaster {
  id: number;
  tenantId: number;
  feeTypeId: number;
  amount: string | number;
  academicId: number;
  dueDate?: Date | null;
  createdAt?: Date | null;
  updatedAt?: Date | null;
}

export interface IFeeType {
  id: number;
  tenantId: number;
  name: string;
  description?: string | null;
}

export interface IFeeAssignment {
  id: number;
  tenantId: number;
  feeMasterId: number;
  userId: number;
  enrollmentId?: number | null;
  assignedAmount: string | number;
  paidAmount: string | number;
  waivedAmount: string | number;
  status: "pending" | "partial" | "paid" | "overdue" | "waived";
  academicId: number;
}

export interface IInvoice {
  id: number;
  tenantId: number;
  invoiceNumber: string;
  userId: number;
  totalAmount: string | number;
  paidAmount: string | number;
  status: "draft" | "issued" | "paid" | "partial" | "overdue" | "cancelled";
  issuedAt?: Date | null;
  dueDate?: string | null;
  metadata?: any;
}
