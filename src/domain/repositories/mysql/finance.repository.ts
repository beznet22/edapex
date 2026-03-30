import { db } from "../../../db/index.js";
import { 
  ledgerEntries, 
  feeMasters, 
  feeTypes, 
  feeAssignments, 
  invoices,
  paymentGateways,
  onlinePayments
} from "../../../db/mysql/domain-finance.js";
import { 
  IFinanceRepository, 
  ILedgerEntry, 
  IFeeMaster, 
  IFeeType, 
  IFeeAssignment, 
  IInvoice,
  IPaymentGateway,
  IOnlinePayment
} from "../../interfaces/finance.interface.js";
import { eq, and } from "drizzle-orm";

export class MySqlFinanceRepository implements IFinanceRepository {
  private mapLedger(row: any): ILedgerEntry {
    return {
      ...row,
      amount: row.amount ? row.amount.toString() : "0.00",
      postedAt: row.postedAt ? new Date(row.postedAt) : null,
      createdAt: row.createdAt ? new Date(row.createdAt) : null,
      updatedAt: row.updatedAt ? new Date(row.updatedAt) : null,
    };
  }

  // --- Ledger ---
  async getLedgerEntries(tenantId: number, filter?: { type?: string; userId?: number; academicId?: number }): Promise<ILedgerEntry[]> {
    let query = db.select().from(ledgerEntries).where(eq(ledgerEntries.tenantId, tenantId));
    // Dynamic filtering logic...
    const results = await query;
    return results.map((row: any) => this.mapLedger(row));
  }

  async createLedgerEntry(data: Partial<ILedgerEntry>): Promise<ILedgerEntry> {
    const [result] = await db.insert(ledgerEntries).values(data as any);
    const [row] = await db.select().from(ledgerEntries).where(eq(ledgerEntries.id, result.insertId));
    if (!row) throw new Error("Failed to create ledger entry");
    return this.mapLedger(row);
  }

  // --- Fees ---
  async getFeeMasters(tenantId: number, academicId: number): Promise<IFeeMaster[]> {
    const results = await db
      .select()
      .from(feeMasters)
      .where(and(
        eq(feeMasters.tenantId, tenantId),
        eq(feeMasters.academicId, academicId)
      ));
    return results.map((row: any) => ({
      ...row,
      amount: row.amount ? row.amount.toString() : "0.00",
      dueDate: row.dueDate ? new Date(row.dueDate) : null,
    }));
  }

  async createFeeMaster(data: Partial<IFeeMaster>): Promise<IFeeMaster> {
    const [result] = await db.insert(feeMasters).values(data as any);
    const [row] = await db.select().from(feeMasters).where(eq(feeMasters.id, result.insertId));
    if (!row) throw new Error("Failed to create fee master");
    return {
      ...row,
      amount: row.amount ? row.amount.toString() : "0.00",
      dueDate: row.dueDate ? new Date(row.dueDate) : null,
    };
  }

  async getFeeTypes(tenantId: number): Promise<IFeeType[]> {
    const results = await db.select().from(feeTypes).where(eq(feeTypes.tenantId, tenantId));
    return results.map((row: any) => ({
      id: row.id,
      tenantId: row.tenantId,
      name: row.name,
      description: row.description
    }));
  }

  // --- Assignments ---
  async getStudentFeeAssignments(userId: number): Promise<IFeeAssignment[]> {
    const results = await db.select().from(feeAssignments).where(eq(feeAssignments.userId, userId));
    return results.map((row: any) => ({
      ...row,
      assignedAmount: row.assignedAmount.toString(),
      paidAmount: row.paidAmount.toString(),
      waivedAmount: row.waivedAmount.toString(),
    }));
  }

  async assignFeeToStudent(data: Partial<IFeeAssignment>): Promise<IFeeAssignment> {
    const [result] = await db.insert(feeAssignments).values(data as any);
    const [row] = await db.select().from(feeAssignments).where(eq(feeAssignments.id, result.insertId));
    if (!row) throw new Error("Failed to assign fee");
    return {
      ...row,
      assignedAmount: row.assignedAmount.toString(),
      paidAmount: row.paidAmount.toString(),
      waivedAmount: row.waivedAmount.toString(),
    };
  }

  async updateFeeAssignment(id: number, data: Partial<IFeeAssignment>): Promise<void> {
    await db.update(feeAssignments).set(data as any).where(eq(feeAssignments.id, id));
  }

  // --- Invoices ---
  async getInvoices(tenantId: number, userId?: number): Promise<IInvoice[]> {
    let query = db.select().from(invoices).where(eq(invoices.tenantId, tenantId));
    if (userId) {
      query = db.select().from(invoices).where(and(eq(invoices.tenantId, tenantId), eq(invoices.userId, userId)));
    }
    const results = await query;
    return results.map((row: any) => ({
      ...row,
      totalAmount: row.totalAmount.toString(),
      paidAmount: row.paidAmount.toString(),
      issuedAt: row.issuedAt ? new Date(row.issuedAt) : null,
    }));
  }

  async createInvoice(data: Partial<IInvoice>): Promise<IInvoice> {
    const [result] = await db.insert(invoices).values(data as any);
    const [row] = await db.select().from(invoices).where(eq(invoices.id, result.insertId));
    if (!row) throw new Error("Failed to create invoice");
    return {
      ...row,
      totalAmount: row.totalAmount.toString(),
      paidAmount: row.paidAmount.toString(),
      issuedAt: row.issuedAt ? new Date(row.issuedAt) : null,
    };
  }

  // --- B2C Payments & Gateways ---
  async getPaymentGateways(tenantId: number): Promise<IPaymentGateway[]> {
    const results = await db.select().from(paymentGateways).where(eq(paymentGateways.tenantId, tenantId));
    return results.map((row: any) => ({
      ...row,
      createdAt: row.createdAt ? new Date(row.createdAt) : null,
      updatedAt: row.updatedAt ? new Date(row.updatedAt) : null,
    }));
  }

  async createOnlinePayment(data: Partial<IOnlinePayment>): Promise<IOnlinePayment> {
    const [result] = await db.insert(onlinePayments).values(data as any);
    const [row] = await db.select().from(onlinePayments).where(eq(onlinePayments.id, result.insertId));
    if (!row) throw new Error("Failed to create online payment intent");
    return {
      ...row,
      amount: row.amount.toString(),
      providerFee: row.providerFee ? row.providerFee.toString() : "0.00",
      createdAt: row.createdAt ? new Date(row.createdAt) : null,
      updatedAt: row.updatedAt ? new Date(row.updatedAt) : null,
    };
  }

  async updateOnlinePaymentStatus(transactionRef: string, status: string, ledgerEntryId?: number): Promise<void> {
    const updateData: any = { status };
    if (ledgerEntryId) updateData.ledgerEntryId = ledgerEntryId;
    await db.update(onlinePayments).set(updateData).where(eq(onlinePayments.transactionRef, transactionRef));
  }
}

