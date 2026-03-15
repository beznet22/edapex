import {
  mysqlTable,
  varchar,
  int,
  timestamp,
  json,
  index,
} from "drizzle-orm/mysql-core";

// Universal Documents — replaces 6 parallel upload tables
export type DocumentMetadata = {
  title?: string;
  description?: string;
  verifiedBy?: number; // accountId
};

export const documents = mysqlTable("edx_documents", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull(),
  ownerType: varchar("owner_type", { length: 30 }).notNull(),
  ownerId: int("owner_id").notNull(),
  documentType: varchar("document_type", { length: 50 }).notNull(),
  filePath: varchar("file_path", { length: 500 }).notNull(),
  fileSize: int("file_size"),
  mimeType: varchar("mime_type", { length: 100 }),
  metadata: json("metadata").$type<DocumentMetadata>(),  // { title, description, verified_by }
  createdBy: int("created_by"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  ownerIdx: index("doc_owner_idx").on(table.ownerType, table.ownerId),
  tenantIdx: index("doc_tenant_idx").on(table.tenantId),
}));
