export interface ICmsRepository {
  // --- Content Nodes ---
  getContentNodes(tenantId: string, filter?: { type?: string; publishedOnly?: boolean }): Promise<IContentNode[]>;
  getNodeBySlug(tenantId: string, slug: string): Promise<IContentNode | null>;
  createContentNode(data: Partial<IContentNode>): Promise<IContentNode>;
  updateContentNode(tenantId: string, id: string, data: Partial<IContentNode>): Promise<void>;
  deleteContentNode(tenantId: string, id: string): Promise<void>;
}

export interface IContentNode {
  id: string;
  tenantId: string;
  contentType: "page" | "news" | "event" | "testimonial" | "gallery" | "slider" | "menu_item";
  slug?: string | null;
  title: string;
  body?: string | null;
  image?: string | null;
  publishedStatus: number;
  publishedAt?: Date | null;
  expiresAt?: Date | null;
  authorId?: string | null;
  categoryId?: string | null;
  parentId?: string | null;
  sortOrder?: number | null;
  metadata?: any;
}
