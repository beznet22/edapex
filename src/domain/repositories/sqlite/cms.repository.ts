import { db } from "../../../db/index.js";
import { contentNodes } from "../../../db/sqlite/domain-cms.js";
import { ICmsRepository, IContentNode } from "../../interfaces/cms.interface.js";
import { eq, and } from "drizzle-orm";

export class SqliteCmsRepository implements ICmsRepository {
  private mapNode(row: any): IContentNode {
    return {
      ...row,
      publishedAt: row.publishedAt ? new Date(row.publishedAt) : null,
      expiresAt: row.expiresAt ? new Date(row.expiresAt) : null,
    };
  }

  async getContentNodes(tenantId: string, filter?: { type?: string; publishedOnly?: boolean }): Promise<IContentNode[]> {
    let whereClause = eq(contentNodes.tenantId, tenantId);
    if (filter?.publishedOnly) {
      whereClause = and(whereClause, eq(contentNodes.publishedStatus, 1)) as any;
    }
    const results = await db.select().from(contentNodes).where(whereClause);
    return results.map((row: any) => this.mapNode(row));
  }

  async getNodeBySlug(tenantId: string, slug: string): Promise<IContentNode | null> {
    const [result] = await db
      .select()
      .from(contentNodes)
      .where(and(eq(contentNodes.tenantId, tenantId), eq(contentNodes.slug, slug)));
    return result ? this.mapNode(result) : null;
  }

  async createContentNode(data: Partial<IContentNode>): Promise<IContentNode> {
    const [result] = await db.insert(contentNodes).values(data as any).returning();
    if (!result) throw new Error("Failed to create content node");
    return this.mapNode(result);
  }

  async updateContentNode(tenantId: string, id: string, data: Partial<IContentNode>): Promise<void> {
    await db.update(contentNodes)
      .set(data as any)
      .where(and(
        eq(contentNodes.id, id),
        eq(contentNodes.tenantId, tenantId)
      ));
  }

  async deleteContentNode(tenantId: string, id: string): Promise<void> {
    await db.delete(contentNodes)
      .where(and(
        eq(contentNodes.id, id),
        eq(contentNodes.tenantId, tenantId)
      ));
  }
}
