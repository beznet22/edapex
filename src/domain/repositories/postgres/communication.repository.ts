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
  async getCommunicationEvents(tenantId: number, filter?: { channel?: string; targetType?: string }): Promise<ICommunicationEvent[]> {
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
  async getEventRecipients(eventId: number): Promise<ICommunicationRecipient[]> {
    const results = await db.select().from(communicationRecipients).where(eq(communicationRecipients.eventId, eventId));
    return results.map((row: any) => ({
      ...row,
      readAt: row.readAt ? new Date(row.readAt) : null,
      deliveredAt: row.deliveredAt ? new Date(row.deliveredAt) : null,
    }));
  }

  async addRecipients(eventId: number, userIds: number[]): Promise<void> {
    const values = userIds.map(userId => ({ eventId, userId }));
    await db.insert(communicationRecipients).values(values);
  }

  async updateDeliveryStatus(recipientId: number, status: string, failureReason?: string): Promise<void> {
    await db.update(communicationRecipients)
      .set({ 
        deliveryStatus: status as any, 
        failureReason,
        deliveredAt: status === "delivered" ? new Date() : undefined
      })
      .where(eq(communicationRecipients.id, recipientId));
  }

  async markAsRead(recipientId: number): Promise<void> {
    await db.update(communicationRecipients).set({ readAt: new Date() }).where(eq(communicationRecipients.id, recipientId));
  }
}
