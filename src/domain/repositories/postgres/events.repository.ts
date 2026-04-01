import { db } from "../../../db/index.js";
import { events, auditLog } from "../../../db/postgres/domain-events.js";
import { IEventsRepository, IDomainEvent, IAuditLog } from "../../interfaces/events.interface.js";
import { eq, and } from "drizzle-orm";

export class PostgresEventsRepository implements IEventsRepository {
  // --- Events ---
  async getEvents(tenantId: string): Promise<IDomainEvent[]> {
    const results = await db.select().from(events).where(eq(events.tenantId, tenantId));
    return results.map((row: any) => ({
      ...row,
      occurredAt: new Date(row.occurredAt),
    }));
  }

  async logEvent(data: Partial<IDomainEvent>): Promise<IDomainEvent> {
    const [result] = await db.insert(events).values(data as any).returning();
    if (!result) throw new Error("Failed to log event");
    return { ...result, occurredAt: new Date(result.occurredAt) };
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
    const [result] = await db.insert(auditLog).values(data as any).returning();
    if (!result) throw new Error("Failed to log audit");
    return { ...result, changedAt: new Date(result.changedAt) };
  }
}
