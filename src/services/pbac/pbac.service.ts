import { logger } from "../../utils/logger.js";
import type { IPbacRepository } from "../../domain/interfaces/pbac.interface.js";

const log = logger.child({ layer: "service", domain: "pbac" });

export class PBACService {
  constructor(private repo: IPbacRepository) {}

  async getRoleAssignments(tenantId: string, userId: string) {
    return this.repo.getRoleAssignments(tenantId, userId);
  }

  async hasRole(tenantId: string, userId: string, roleName: string) {
    log.debug("Checking role assignment", { tenantId, userId, roleName });
    const assignments = await this.repo.getRoleAssignments(tenantId, userId);
    return assignments.some(a => a.roleName === roleName);
  }
}
