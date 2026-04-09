import { logger } from "../../utils/logger.js";
import type { IDocumentsRepository } from "../../domain/interfaces/documents.interface.js";

const log = logger.child({ layer: "service", domain: "documents" });

export class DocumentsService {
  constructor(private repo: IDocumentsRepository) {}

  async getDocuments(tenantId: string, ownerType: string, ownerId: string) {
    return this.repo.getDocumentsByOwner(tenantId, ownerType, ownerId);
  }

  async uploadDocument(tenantId: string, data: any) {
    log.info("Uploading document", { tenantId, name: data.name });
    return this.repo.createDocument({ ...data, tenantId });
  }

  /**
   * [BINARY DELEGATION MAP]
   * Generates a PDF from HTML content by delegating to an edge-native PDF worker.
   */
  async generatePdfFromHtml(tenantId: string, html: string, filename: string): Promise<string> {
    log.info("Delegating PDF generation", { tenantId, filename });

    // In production, this would call a specialized Cloudflare Worker (e.g., using Browserless or Puppeteer)
    // const response = await fetch(process.env.PDF_WORKER_URL!, { method: 'POST', body: html });
    // const pdfBuffer = await response.arrayBuffer();

    const mockUrl = `https://storage.edapex.edu/generated/${tenantId}/${filename}.pdf`;
    
    // Simulate upload to repository
    await this.repo.createDocument({
      tenantId,
      name: filename,
      type: 'pdf',
      url: mockUrl,
      sizeBytes: html.length * 1.5, // Mocked size
      ownerType: 'system',
      ownerId: 'ai_generator',
    } as any);

    return mockUrl;
  }
}
