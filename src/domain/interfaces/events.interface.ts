export interface IEventsRepository {
  // --- Domain Events ---
  getEvents(tenantId: string, filter?: { type?: string; aggregateType?: string; aggregateId?: string }): Promise<IDomainEvent[]>;
  logEvent(data: Partial<IDomainEvent>): Promise<IDomainEvent>;
  
  // --- Audit Logs ---
  getAuditLogs(tenantId: string, filter?: { tableName?: string; recordId?: string; actorId?: string }): Promise<IAuditLog[]>;
  logAudit(data: Partial<IAuditLog>): Promise<IAuditLog>;
}

export interface IDomainEvent {
  id: string;
  tenantId: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  actorId?: string | null;
  payload: any;
  metadata?: any;
  deliveryStatus: "pending" | "dispatched" | "failed";
  version: number;
  correlationId?: string | null;
  occurredAt: Date;
}

export interface IAuditLog {
  id: string;
  tenantId: string;
  tableName: string;
  recordId: string;
  action: "INSERT" | "UPDATE" | "DELETE";
  oldValues?: any;
  newValues?: any;
  changedBy: string;
  changedAt: Date;
}
