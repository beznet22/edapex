/**
 * ARCHITECTURE OVERVIEW: Documents Domain
 * 
 * Purpose:
 * Provides a highly scalable, polymorphic storage system for digital assets via `edx_documents`. 
 * Utilizes `owner_type` and `owner_id` polymorphic linkage to seamlessly attach files to any 
 * entity (profiles, homework, facilities) without altering their core tables.
 * 
 * Replaces Legacy Tables:
 * - sm_student_documents
 * - sm_staff_documents
 * - sm_upload_contents / sm_teacher_upload_contents
 */
import {

  mysqlTable,
  varchar,
  int,
  timestamp,
  json,
  index,
  mysqlEnum,
} from "drizzle-orm/mysql-core";

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

export const documents = mysqlTable("documents", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => generateId()),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  ownerType: varchar("owner_type", { length: 30 }).notNull(),
  ownerId: varchar("owner_id", { length: 36 }).notNull(),
  documentType: varchar("document_type", { length: 50 }).notNull(),
  filePath: varchar("file_path", { length: 500 }).notNull(),
  fileSize: int("file_size"),
  mimeType: varchar("mime_type", { length: 100 }),
  status: mysqlEnum("status", ["draft", "pending_review", "approved", "rejected"]).default("approved"),
  metadata: json("metadata").$type<DocumentMetadata>(),
  expiresAt: timestamp("expires_at"),
  createdBy: varchar("created_by", { length: 36 }).references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
  ownerIdx: index("doc_owner_idx").on(table.tenantId, table.ownerType, table.ownerId),
  tenantIdx: index("doc_tenant_idx").on(table.tenantId),
  statusIdx: index("doc_status_idx").on(table.tenantId, table.status),
}));
