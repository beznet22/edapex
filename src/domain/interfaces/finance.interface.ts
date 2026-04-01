export interface IFinanceRepository {
  // --- Ledger ---
  getLedgerEntries(tenantId: string, filter?: { type?: string; userId?: string; academicId?: string }): Promise<ILedgerEntry[]>;
  createLedgerEntry(data: Partial<ILedgerEntry>): Promise<ILedgerEntry>;
  
  // --- Fees Configuration ---
  getFeeMasters(tenantId: string, academicId: string): Promise<IFeeMaster[]>;
  createFeeMaster(data: Partial<IFeeMaster>): Promise<IFeeMaster>;
  getFeeTypes(tenantId: string): Promise<IFeeType[]>;
  
  // --- Assignments & Payments ---
  getStudentFeeAssignments(userId: string): Promise<IFeeAssignment[]>;
  assignFeeToStudent(data: Partial<IFeeAssignment>): Promise<IFeeAssignment>;
  updateFeeAssignment(tenantId: string, id: string, data: Partial<IFeeAssignment>): Promise<void>;
  
  // --- Invoices ---
  getInvoices(tenantId: string, userId?: string): Promise<IInvoice[]>;
  createInvoice(data: Partial<IInvoice>): Promise<IInvoice>;
  
  // --- B2C Payments & Gateways ---
  getPaymentGateways(tenantId: string): Promise<IPaymentGateway[]>;
  createOnlinePayment(data: Partial<IOnlinePayment>): Promise<IOnlinePayment>;
  updateOnlinePaymentStatus(transactionRef: string, status: string, ledgerEntryId?: string): Promise<void>;
}

export interface ILedgerEntry {
  id: string;
  tenantId: string;
  transactionType: "fee_payment" | "fee_waiver" | "salary" | "expense" | "income" | "refund" | "wallet_topup";
  direction: "credit" | "debit";
  amount: string | number;
  userId?: string | null;
  enrollmentId?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
  metadata?: any;
  postedAt?: Date | null;
  academicId?: string | null;
  createdAt?: Date | null;
  updatedAt?: Date | null;
}

export interface IFeeMaster {
  id: string;
  tenantId: string;
  feeTypeId: string;
  amount: string | number;
  academicId: string;
  dueDate?: Date | null;
  createdAt?: Date | null;
  updatedAt?: Date | null;
}

export interface IFeeType {
  id: string;
  tenantId: string;
  name: string;
  description?: string | null;
}

export interface IFeeAssignment {
  id: string;
  tenantId: string;
  feeMasterId: string;
  userId: string;
  enrollmentId?: string | null;
  assignedAmount: string | number;
  paidAmount: string | number;
  waivedAmount: string | number;
  status: "pending" | "partial" | "paid" | "overdue" | "waived";
  academicId: string;
}

export interface IInvoice {
  id: string;
  tenantId: string;
  invoiceNumber: string;
  referenceType?: string;
  referenceId?: string | null;
  userId: string;
  totalAmount: string | number;
  paidAmount: string | number;
  status: "draft" | "issued" | "paid" | "partial" | "overdue" | "cancelled";
  issuedAt?: Date | null;
  dueDate?: string | null;
  metadata?: any;
}

export interface IPaymentGateway {
  id: string;
  tenantId: string;
  provider: "stripe" | "paystack" | "flutterwave" | "paypal";
  publicKey?: string | null;
  isActive: boolean | number;
  createdAt?: Date | null;
  updatedAt?: Date | null;
  // Intentionally omitting secret keys from standard interface to prevent exposure
}

export interface IOnlinePayment {
  id: string;
  tenantId: string;
  userId: string;
  gatewayId: string;
  invoiceId?: string | null;
  amount: string | number;
  currency: string;
  providerFee?: string | number;
  status: "intent_created" | "processing" | "succeeded" | "failed" | "refunded";
  transactionRef: string;
  ledgerEntryId?: string | null;
  metadata?: any;
  createdAt?: Date | null;
  updatedAt?: Date | null;
}
