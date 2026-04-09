import { logger } from "../../utils/logger.js";
import type { IHrRepository } from "../../domain/interfaces/hr.interface.js";

const log = logger.child({ layer: "service", domain: "hr" });

export class HrService {
  constructor(private repo: IHrRepository) {}

  async getDepartments(tenantId: string) {
    return this.repo.getDepartments(tenantId);
  }

  async getDesignations(tenantId: string) {
    return this.repo.getDesignations(tenantId);
  }
}
