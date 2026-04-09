import { logger } from "../../utils/logger.js";
import type { ISettingsRepository } from "../../domain/interfaces/settings.interface.js";

const log = logger.child({ layer: "service", domain: "settings" });

export class SettingsService {
  constructor(private repo: ISettingsRepository) {}

  async getSettings(tenantId: string, domain: string) {
    return this.repo.getSettingsByDomain(tenantId, domain);
  }

  async updateSettings(tenantId: string, domain: string, config: any) {
    log.info("Updating setting", { tenantId, domain });
    return this.repo.updateSettings(tenantId, domain, config);
  }
}
