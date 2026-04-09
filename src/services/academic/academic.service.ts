import { logger } from "../../utils/logger.js";
import type { IAcademicRepository } from "../../domain/interfaces/academic.interface.js";

const log = logger.child({ layer: "service", domain: "academic" });

export class AcademicService {
  constructor(private repo: IAcademicRepository) {}

  async getClasses(tenantId: string, academicId: string) {
    return this.repo.getClasses(tenantId, academicId);
  }

  async getSectionsByClass(classId: string) {
    return this.repo.getSectionsByClass(classId);
  }

  async createEnrollment(tenantId: string, data: any) {
    log.info("Creating enrollment", { tenantId, userId: data.userId });
    return this.repo.createEnrollment({ ...data, tenantId });
  }

  async getHomework(classId: string, sectionId: string, academicId: string) {
    return this.repo.getHomeworkByClass(classId, sectionId, academicId);
  }
}
