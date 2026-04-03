/**
 * ARCHITECTURE OVERVIEW: Documents Domain
 * 
 * Purpose:
 * Provides a highly scalable, polymorphic storage system for digital assets via `documents`. 
 * Utilizes `owner_type` and `owner_id` polymorphic linkage to seamlessly attach files to any 
 * entity (profiles, homework, facilities) without altering their core tables.
 * 
 * Replaces Legacy Tables:
 * - sm_student_documents
 * - sm_staff_documents
 * - sm_upload_contents / sm_teacher_upload_contents
 */
import { unique,  sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";

import { users, tenants, accounts } from "./domain-core";
import { generateId } from "../utils/id";

// Universal Documents — replaces 6 parallel upload tables
export type DocumentMetadata = {
  title?: string;
  description?: string;
  verifiedBy?: string; // userId
  version?: number;
  previousVersionId?: string;
};

export const documents = sqliteTable("documents", {
  id: text("id", { length: 255 }).primaryKey().$defaultFn(() => generateId()),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  ownerType: text("owner_type", { length: 30 }).notNull(),
  ownerId: text("owner_id").notNull(),
  documentType: text("document_type", { length: 50 }).notNull(),
  filePath: text("file_path", { length: 500 }).notNull(),
  fileSize: integer("file_size"),
  mimeType: text("mime_type", { length: 100 }),
  status: text("status", { enum: ["draft", "pending_review", "approved", "rejected"] }).default("approved"),
  metadata: text("metadata", { mode: "json" }).$type<DocumentMetadata>(),
  expiresAt: integer("expires_at", { mode: "timestamp" }),
  createdBy: text("created_at").references(() => users.id), // wait, created_by 
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
}, (table) => ({
  ownerIdx: index("doc_owner_idx").on(table.tenantId, table.ownerType, table.ownerId),
  tenantIdx: index("doc_tenant_idx").on(table.tenantId),
  statusIdx: index("doc_status_idx").on(table.tenantId, table.status),
}));
