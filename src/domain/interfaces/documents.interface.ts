export interface IDocumentsRepository {
  // --- Document Storage ---
  getDocumentsByOwner(tenantId: string, ownerType: string, ownerId: string): Promise<IDocument[]>;
  createDocument(data: Partial<IDocument>): Promise<IDocument>;
  updateDocumentStatus(tenantId: string, id: string, status: string): Promise<void>;
  deleteDocument(tenantId: string, id: string): Promise<void>;
}

export interface IDocument {
  id: string;
  tenantId: string;
  ownerType: string;
  ownerId: string;
  documentType: string;
  filePath: string;
  fileSize?: number | null;
  mimeType?: string | null;
  status: "draft" | "pending_review" | "approved" | "rejected";
  metadata?: any;
  expiresAt?: Date | null;
  createdBy?: string | null;
}
