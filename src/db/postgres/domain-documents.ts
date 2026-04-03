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
import { pgSchema, text, doublePrecision, integer, uuid, numeric, smallint, timestamp, jsonb, boolean, date, varchar, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { users, tenants, accounts } from "./domain-core";

// Universal Documents — replaces 6 parallel upload tables
export type DocumentMetadata = {
  title?: string;
  description?: string;
  verifiedBy?: string; // userId
  version?: number;
  previousVersionId?: string;
};
export const documentsSchema = pgSchema("domain_documents");


export const documents = documentsSchema.table("documents", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  ownerType: varchar("owner_type", { length: 30 }).notNull(),
  ownerId: uuid("owner_id").notNull(),
  documentType: varchar("document_type", { length: 50 }).notNull(),
  filePath: varchar("file_path", { length: 500 }).notNull(),
  fileSize: integer("file_size"),
  mimeType: varchar("mime_type", { length: 100 }),
  status: varchar("status", { length: 150 }).default("approved"),
  metadata: jsonb("metadata").$type<DocumentMetadata>(),
  expiresAt: timestamp("expires_at"),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  ownerIdx: index("doc_owner_idx").on(table.tenantId, table.ownerType, table.ownerId),
  tenantIdx: index("doc_tenant_idx").on(table.tenantId),
  statusIdx: index("doc_status_idx").on(table.tenantId, table.status),
}));
