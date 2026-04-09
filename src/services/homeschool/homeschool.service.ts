import { logger } from "../../utils/logger.js";
import type { IHomeschoolRepository } from "../../domain/interfaces/homeschool.interface.js";

const log = logger.child({ layer: "service", domain: "homeschool" });

export class HomeschoolService {
  constructor(private repo: IHomeschoolRepository) {}

  async getPlans(tenantId: string, userId: string, academicId: string) {
    return this.repo.getSchedules(tenantId, userId, academicId);
  }

  async getPortfolios(tenantId: string, userId: string, academicId: string) {
    return this.repo.getPortfolios(tenantId, userId, academicId);
  }
}
