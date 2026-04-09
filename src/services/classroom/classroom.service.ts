import { logger } from "../../utils/logger.js";
import type { IClassroomRepository, ClassroomSessionStatus } from "../../domain/interfaces/classroom.interface.js";

const log = logger.child({ layer: "service", domain: "classroom" });

export class ClassroomService {
  constructor(private repo: IClassroomRepository) {}

  async getSessions(tenantId: string, status?: ClassroomSessionStatus) {
    return this.repo.getSessionsByTenant(tenantId, status);
  }

  async startSession(tenantId: string, sessionId: string) {
    log.info("Starting classroom session", { tenantId, sessionId });
    return this.repo.checkoutSession(tenantId, sessionId);
  }

  async addMemory(sessionId: string, tenantId: string, role: any, content: any) {
    return this.repo.appendMemoryEntry({
      sessionId,
      tenantId,
      role,
      parsedContent: content,
      turnCount: 0, // Placeholder, should be calculated
    });
  }
}
