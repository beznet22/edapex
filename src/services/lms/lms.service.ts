import { logger } from "../../utils/logger.js";
import type { ILmsRepository } from "../../domain/interfaces/lms.interface.js";

const log = logger.child({ layer: "service", domain: "lms" });

export class LMSService {
  constructor(private repo: ILmsRepository) {}

  async getCourses(tenantId: string, academicId: string) {
    return this.repo.getCoursesByTenant(tenantId, academicId);
  }

  async getModules(tenantId: string, courseId: string) {
    return this.repo.getModulesByCourse(tenantId, courseId);
  }
}
