import { logger } from "../../utils/logger.js";
import type { ICoreRepository } from "../../domain/interfaces/core.interface.js";

const log = logger.child({ layer: "service", domain: "core" });

export class CoreService {
  constructor(private repo: ICoreRepository) {}

  async getTenant(tenantId: string) {
    return this.repo.getTenantById(tenantId);
  }

  async getAcademicYears(tenantId: string) {
    return this.repo.getAcademicYears(tenantId);
  }
}
