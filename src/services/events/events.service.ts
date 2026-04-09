import { logger } from "../../utils/logger.js";
import type { IEventsRepository } from "../../domain/interfaces/events.interface.js";

const log = logger.child({ layer: "service", domain: "events" });

export class EventsService {
  constructor(private repo: IEventsRepository) {}

  async getEvents(tenantId: string) {
    return this.repo.getEvents(tenantId);
  }

  async createEvent(tenantId: string, data: any) {
    log.info("Logging domain event", { tenantId, eventType: data.eventType });
    return this.repo.logEvent({ ...data, tenantId });
  }
}
