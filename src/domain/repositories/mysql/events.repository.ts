import { db } from "../../../db/index.js";
import { events, auditLog } from "../../../db/mysql/domain-events.js";
import { IEventsRepository, IDomainEvent, IAuditLog } from "../../interfaces/events.interface.js";
import { eq, and } from "drizzle-orm";

export class MySqlEventsRepository implements IEventsRepository {
  // --- Events ---
  async getEvents(tenantId: string): Promise<IDomainEvent[]> {
    const results = await db.select().from(events).where(eq(events.tenantId, tenantId));
    return results.map((row: any) => ({
      ...row,
      occurredAt: new Date(row.occurredAt),
    }));
  }

  async logEvent(data: Partial<IDomainEvent>): Promise<IDomainEvent> {
    await db.insert(events).values(data as any);
    const [row] = await db.select().from(events).where(eq(events.id, data.id!));
    if (!row) throw new Error("Failed to log event");
    return { ...row, occurredAt: new Date(row.occurredAt) };
  }

  // --- Audit ---
  async getAuditLogs(tenantId: string): Promise<IAuditLog[]> {
    const results = await db.select().from(auditLog).where(eq(auditLog.tenantId, tenantId));
    return results.map((row: any) => ({
      ...row,
      changedAt: new Date(row.changedAt),
    }));
  }

  async logAudit(data: Partial<IAuditLog>): Promise<IAuditLog> {
    await db.insert(auditLog).values(data as any);
    const [row] = await db.select().from(auditLog).where(eq(auditLog.id, data.id!));
    if (!row) throw new Error("Failed to log audit");
    return { ...row, changedAt: new Date(row.changedAt) };
  }
}
