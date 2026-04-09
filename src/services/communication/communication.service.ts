import { logger } from "../../utils/logger.js";
import type { ICommunicationRepository } from "../../domain/interfaces/communication.interface.js";

const log = logger.child({ layer: "service", domain: "communication" });

export class CommunicationService {
  constructor(private repo: ICommunicationRepository) {}

  async getNotifications(tenantId: string, channel: string) {
    return this.repo.getCommunicationEvents(tenantId, { channel });
  }

  async sendInternalMail(tenantId: string, data: any) {
    log.info("Creating communication event", { tenantId, targetType: data.targetType });
    return this.repo.createCommunicationEvent({ ...data, tenantId });
  }
}
