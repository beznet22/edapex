import { logger } from "../../utils/logger.js";
import type { ILibraryRepository } from "../../domain/interfaces/library.interface.js";

const log = logger.child({ layer: "service", domain: "library" });

export class LibraryService {
  constructor(private repo: ILibraryRepository) {}

  async getBooks(tenantId: string) {
    return this.repo.getBooks(tenantId);
  }

  async issueBook(tenantId: string, data: any) {
    log.info("Issuing book", { tenantId, bookId: data.bookId, memberId: data.memberId });
    return this.repo.issueBook({ ...data, tenantId });
  }
}
