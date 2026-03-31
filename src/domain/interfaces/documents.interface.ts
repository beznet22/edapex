export interface IDocumentsRepository {
  // --- Document Storage ---
  getDocumentsByOwner(tenantId: number, ownerType: string, ownerId: number): Promise<IDocument[]>;
  createDocument(data: Partial<IDocument>): Promise<IDocument>;
  updateDocumentStatus(tenantId: number, id: number, status: string): Promise<void>;
  deleteDocument(tenantId: number, id: number): Promise<void>;
}

export interface IDocument {
  id: number;
  tenantId: number;
  ownerType: string;
  ownerId: number;
  documentType: string;
  filePath: string;
  fileSize?: number | null;
  mimeType?: string | null;
  status: "draft" | "pending_review" | "approved" | "rejected";
  metadata?: any;
  expiresAt?: Date | null;
  createdBy?: number | null;
}
