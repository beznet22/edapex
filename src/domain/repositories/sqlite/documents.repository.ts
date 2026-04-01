import { db } from "../../../db/index.js";
import { documents } from "../../../db/sqlite/domain-documents.js";
import { IDocumentsRepository, IDocument } from "../../interfaces/documents.interface.js";
import { eq, and } from "drizzle-orm";

export class SqliteDocumentsRepository implements IDocumentsRepository {
  async getDocumentsByOwner(tenantId: string, ownerType: string, ownerId: string): Promise<IDocument[]> {
    const results = await db
      .select()
      .from(documents)
      .where(and(
        eq(documents.tenantId, tenantId),
        eq(documents.ownerType, ownerType),
        eq(documents.ownerId, ownerId)
      ));
    return results.map((row: any) => ({
      ...row,
      expiresAt: row.expiresAt ? new Date(row.expiresAt) : null,
    }));
  }

  async createDocument(data: Partial<IDocument>): Promise<IDocument> {
    const [result] = await db.insert(documents).values(data as any).returning();
    if (!result) throw new Error("Failed to create document");
    return {
      ...result,
      expiresAt: result.expiresAt ? new Date(result.expiresAt) : null,
    };
  }

  async updateDocumentStatus(tenantId: string, id: string, status: string): Promise<void> {
    await db.update(documents)
      .set({ status: status as any })
      .where(and(
        eq(documents.id, id),
        eq(documents.tenantId, tenantId)
      ));
  }

  async deleteDocument(tenantId: string, id: string): Promise<void> {
    await db.delete(documents)
      .where(and(
        eq(documents.id, id),
        eq(documents.tenantId, tenantId)
      ));
  }
}
