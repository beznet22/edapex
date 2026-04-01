import { db } from "../../../db/index.js";
import { 
  communicationEvents, 
  communicationRecipients 
} from "../../../db/mysql/domain-communication.js";
import { 
  ICommunicationRepository, 
  ICommunicationEvent, 
  ICommunicationRecipient 
} from "../../interfaces/communication.interface.js";
import { eq, and, inArray } from "drizzle-orm";

export class MySqlCommunicationRepository implements ICommunicationRepository {
  private mapEvent(row: any): ICommunicationEvent {
    return {
      ...row,
      scheduledAt: row.scheduledAt ? new Date(row.scheduledAt) : null,
      sentAt: row.sentAt ? new Date(row.sentAt) : null,
    };
  }

  // --- Events ---
  async getCommunicationEvents(tenantId: string, filter?: { channel?: string; targetType?: string }): Promise<ICommunicationEvent[]> {
    let query = db.select().from(communicationEvents).where(eq(communicationEvents.tenantId, tenantId));
    const results = await query;
    return results.map((row: any) => this.mapEvent(row));
  }

  async createCommunicationEvent(data: Partial<ICommunicationEvent>): Promise<ICommunicationEvent> {
    await db.insert(communicationEvents).values(data as any);
    const [row] = await db.select().from(communicationEvents).where(and(eq(communicationEvents.id, data.id!), eq(communicationEvents.tenantId, data.tenantId!)));
    if (!row) throw new Error("Failed to create event");
    return this.mapEvent(row);
  }

  // --- Recipients ---
  async getEventRecipients(tenantId: string, eventId: string): Promise<ICommunicationRecipient[]> {
    const results = await db.select().from(communicationRecipients).where(and(eq(communicationRecipients.eventId, eventId), eq(communicationRecipients.tenantId, tenantId)));
    return results.map((row: any) => ({
      ...row,
      readAt: row.readAt ? new Date(row.readAt) : null,
      deliveredAt: row.deliveredAt ? new Date(row.deliveredAt) : null,
    }));
  }

  async addRecipients(tenantId: string, eventId: string, userIds: string[]): Promise<void> {
    const values = userIds.map(userId => ({ tenantId, eventId, userId }));
    await db.insert(communicationRecipients).values(values);
  }

  async updateDeliveryStatus(tenantId: string, recipientId: string, status: string, failureReason?: string): Promise<void> {
    await db.update(communicationRecipients)
      .set({ 
        deliveryStatus: status as any, 
        failureReason,
        deliveredAt: status === "delivered" ? new Date() : undefined
      })
      .where(and(eq(communicationRecipients.id, recipientId), eq(communicationRecipients.tenantId, tenantId)));
  }

  async markAsRead(tenantId: string, recipientId: string): Promise<void> {
    await db.update(communicationRecipients).set({ readAt: new Date() }).where(and(eq(communicationRecipients.id, recipientId), eq(communicationRecipients.tenantId, tenantId)));
  }
}
