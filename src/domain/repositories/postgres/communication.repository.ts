import { db } from "../../../db/index.js";
import { 
  communicationEvents, 
  communicationRecipients 
} from "../../../db/postgres/domain-communication.js";
import { 
  ICommunicationRepository, 
  ICommunicationEvent, 
  ICommunicationRecipient 
} from "../../interfaces/communication.interface.js";
import { eq, and, inArray } from "drizzle-orm";

export class PostgresCommunicationRepository implements ICommunicationRepository {
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
    const [result] = await db.insert(communicationEvents).values(data as any).returning();
    if (!result) throw new Error("Failed to create event");
    return this.mapEvent(result);
  }

  // --- Recipients ---
  async getEventRecipients(tenantId: string, eventId: string): Promise<ICommunicationRecipient[]> {
    const results = await db
      .select()
      .from(communicationRecipients)
      .innerJoin(communicationEvents, eq(communicationRecipients.eventId, communicationEvents.id))
      .where(and(
        eq(communicationRecipients.eventId, eventId),
        eq(communicationEvents.tenantId, tenantId)
      ));
    return results.map((row: any) => ({
      ...row.communicationRecipients,
      readAt: row.communicationRecipients.readAt ? new Date(row.communicationRecipients.readAt) : null,
      deliveredAt: row.communicationRecipients.deliveredAt ? new Date(row.communicationRecipients.deliveredAt) : null,
    }));
  }

  async addRecipients(tenantId: string, eventId: string, userIds: string[]): Promise<void> {
    const values = userIds.map(userId => ({ eventId, userId }));
    await db.insert(communicationRecipients).values(values);
  }

  async updateDeliveryStatus(tenantId: string, recipientId: string, status: string, failureReason?: string): Promise<void> {
    await db.update(communicationRecipients)
      .set({ 
        deliveryStatus: status as any, 
        failureReason,
        deliveredAt: status === "delivered" ? new Date() : undefined
      })
      .where(eq(communicationRecipients.id, recipientId));
  }

  async markAsRead(tenantId: string, recipientId: string): Promise<void> {
    await db.update(communicationRecipients).set({ readAt: new Date() }).where(eq(communicationRecipients.id, recipientId));
  }
}
