export interface ICommunicationRepository {
  // --- Events ---
  getCommunicationEvents(tenantId: number, filter?: { channel?: string; targetType?: string }): Promise<ICommunicationEvent[]>;
  createCommunicationEvent(data: Partial<ICommunicationEvent>): Promise<ICommunicationEvent>;
  
  // --- Recipients ---
  getEventRecipients(eventId: number): Promise<ICommunicationRecipient[]>;
  addRecipients(eventId: number, userIds: number[]): Promise<void>;
  updateDeliveryStatus(recipientId: number, status: string, failureReason?: string): Promise<void>;
  markAsRead(recipientId: number): Promise<void>;
}

export interface ICommunicationEvent {
  id: number;
  tenantId: number;
  channel: "notification" | "notice" | "message" | "email" | "sms" | "chat";
  senderId?: number | null;
  targetType: "person" | "role" | "class" | "section" | "broadcast";
  targetRefId?: number | null;
  subject?: string | null;
  body?: string | null;
  priority: "low" | "normal" | "high" | "urgent";
  scheduledAt?: Date | null;
  sentAt?: Date | null;
  metadata?: any;
}

export interface ICommunicationRecipient {
  id: number;
  eventId: number;
  userId: number;
  deliveryStatus: "pending" | "sent" | "delivered" | "failed" | "bounced";
  readAt?: Date | null;
  deliveredAt?: Date | null;
  failureReason?: string | null;
}
