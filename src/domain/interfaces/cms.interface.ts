export interface ICmsRepository {
  // --- Content Nodes ---
  getContentNodes(tenantId: number, filter?: { type?: string; publishedOnly?: boolean }): Promise<IContentNode[]>;
  getNodeBySlug(tenantId: number, slug: string): Promise<IContentNode | null>;
  createContentNode(data: Partial<IContentNode>): Promise<IContentNode>;
  updateContentNode(tenantId: number, id: number, data: Partial<IContentNode>): Promise<void>;
  deleteContentNode(tenantId: number, id: number): Promise<void>;
}

export interface IContentNode {
  id: number;
  tenantId: number;
  contentType: "page" | "news" | "event" | "testimonial" | "gallery" | "slider" | "menu_item";
  slug?: string | null;
  title: string;
  body?: string | null;
  image?: string | null;
  publishedStatus: number;
  publishedAt?: Date | null;
  expiresAt?: Date | null;
  authorId?: number | null;
  categoryId?: number | null;
  parentId?: number | null;
  sortOrder?: number | null;
  metadata?: any;
}
