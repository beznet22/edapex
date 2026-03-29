export interface IEventsRepository {
  // --- Domain Events ---
  getEvents(tenantId: number, filter?: { type?: string; aggregateType?: string; aggregateId?: number }): Promise<IDomainEvent[]>;
  logEvent(data: Partial<IDomainEvent>): Promise<IDomainEvent>;
  
  // --- Audit Logs ---
  getAuditLogs(tenantId: number, filter?: { tableName?: string; recordId?: number; actorId?: number }): Promise<IAuditLog[]>;
  logAudit(data: Partial<IAuditLog>): Promise<IAuditLog>;
}

export interface IDomainEvent {
  id: number;
  tenantId: number;
  eventType: string;
  aggregateType: string;
  aggregateId: number;
  actorId?: number | null;
  payload: any;
  metadata?: any;
  deliveryStatus: "pending" | "dispatched" | "failed";
  version: number;
  correlationId?: string | null;
  occurredAt: Date;
}

export interface IAuditLog {
  id: number;
  tenantId: number;
  tableName: string;
  recordId: number;
  action: "INSERT" | "UPDATE" | "DELETE";
  oldValues?: any;
  newValues?: any;
  changedBy: number;
  changedAt: Date;
}
