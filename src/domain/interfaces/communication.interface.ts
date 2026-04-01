export interface ICommunicationRepository {
  // --- Events ---
  getCommunicationEvents(tenantId: string, filter?: { channel?: string; targetType?: string }): Promise<ICommunicationEvent[]>;
  createCommunicationEvent(data: Partial<ICommunicationEvent>): Promise<ICommunicationEvent>;
  
  // --- Recipients ---
  getEventRecipients(tenantId: string, eventId: string): Promise<ICommunicationRecipient[]>;
  addRecipients(tenantId: string, eventId: string, userIds: string[]): Promise<void>;
  updateDeliveryStatus(tenantId: string, recipientId: string, status: string, failureReason?: string): Promise<void>;
  markAsRead(tenantId: string, recipientId: string): Promise<void>;
}

export interface ICommunicationEvent {
  id: string;
  tenantId: string;
  channel: "notification" | "notice" | "message" | "email" | "sms" | "chat";
  senderId?: string | null;
  targetType: "person" | "role" | "class" | "section" | "broadcast";
  targetRefId?: string | null;
  subject?: string | null;
  body?: string | null;
  priority: "low" | "normal" | "high" | "urgent";
  scheduledAt?: Date | null;
  sentAt?: Date | null;
  metadata?: any;
}

export interface ICommunicationRecipient {
  id: string;
  tenantId: string;
  eventId: string;
  userId: string;
  deliveryStatus: "pending" | "sent" | "delivered" | "failed" | "bounced";
  readAt?: Date | null;
  deliveredAt?: Date | null;
  failureReason?: string | null;
}
