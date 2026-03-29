import { db } from "../../../db/index.js";
import { documents } from "../../../db/mysql/domain-documents.js";
import { IDocumentsRepository, IDocument } from "../../interfaces/documents.interface.js";
import { eq, and } from "drizzle-orm";

export class MySqlDocumentsRepository implements IDocumentsRepository {
  async getDocumentsByOwner(tenantId: number, ownerType: string, ownerId: number): Promise<IDocument[]> {
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
    const [result] = await db.insert(documents).values(data as any);
    const [row] = await db.select().from(documents).where(eq(documents.id, result.insertId));
    if (!row) throw new Error("Failed to create document");
    return {
      ...row,
      expiresAt: row.expiresAt ? new Date(row.expiresAt) : null,
    };
  }

  async updateDocumentStatus(id: number, status: string): Promise<void> {
    await db.update(documents).set({ status: status as any }).where(eq(documents.id, id));
  }

  async deleteDocument(id: number): Promise<void> {
    await db.delete(documents).where(eq(documents.id, id));
  }
}
