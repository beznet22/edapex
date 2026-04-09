import { logger } from "../../utils/logger.js";
import type { ICmsRepository } from "../../domain/interfaces/cms.interface.js";

const log = logger.child({ layer: "service", domain: "cms" });

export class CMSService {
  constructor(private repo: ICmsRepository) {}

  async getPages(tenantId: string) {
    return this.repo.getContentNodes(tenantId, { type: "page" });
  }

  async getPosts(tenantId: string) {
    return this.repo.getContentNodes(tenantId, { type: "news" });
  }
}
