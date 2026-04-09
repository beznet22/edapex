import { logger } from "../../utils/logger.js";
import type { IFacilitiesRepository } from "../../domain/interfaces/facilities.interface.js";

const log = logger.child({ layer: "service", domain: "facilities" });

export class FacilitiesService {
  constructor(private repo: IFacilitiesRepository) {}

  async getDormitories(tenantId: string) {
    return this.repo.getDormitories(tenantId);
  }

  async getRooms(dormitoryId: string) {
    return this.repo.getRoomsByDormitory(dormitoryId);
  }

  async getVehicles(tenantId: string) {
    return this.repo.getVehicles(tenantId);
  }
}
