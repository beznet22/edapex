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
  
  // --- B2C Payments & Gateways ---
  getPaymentGateways(tenantId: number): Promise<IPaymentGateway[]>;
  createOnlinePayment(data: Partial<IOnlinePayment>): Promise<IOnlinePayment>;
  updateOnlinePaymentStatus(transactionRef: string, status: string, ledgerEntryId?: number): Promise<void>;
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
  referenceType?: string;
  referenceId?: number | null;
  userId: number;
  totalAmount: string | number;
  paidAmount: string | number;
  status: "draft" | "issued" | "paid" | "partial" | "overdue" | "cancelled";
  issuedAt?: Date | null;
  dueDate?: string | null;
  metadata?: any;
}

export interface IPaymentGateway {
  id: number;
  tenantId: number;
  provider: "stripe" | "paystack" | "flutterwave" | "paypal";
  publicKey?: string | null;
  isActive: boolean | number;
  createdAt?: Date | null;
  updatedAt?: Date | null;
  // Intentionally omitting secret keys from standard interface to prevent exposure
}

export interface IOnlinePayment {
  id: number;
  tenantId: number;
  userId: number;
  gatewayId: number;
  invoiceId?: number | null;
  amount: string | number;
  currency: string;
  providerFee?: string | number;
  status: "intent_created" | "processing" | "succeeded" | "failed" | "refunded";
  transactionRef: string;
  ledgerEntryId?: number | null;
  metadata?: any;
  createdAt?: Date | null;
  updatedAt?: Date | null;
}
