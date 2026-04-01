/**
 * ARCHITECTURE OVERVIEW: Content Management System (CMS) Domain
 * 
 * Purpose:
 * Manages a tenant-isolated content delivery model for public facades. Employs 
 * Drizzle JSON/Text columns to store rich text blocks and media references, streamlining 
 * what used to be scattered legacy page tables into a flexible `edx_content_nodes` model.
 * 
 * Replaces Legacy Tables:
 * - sm_front_cms_pages
 * - sm_news
 * - sm_events
 * - sm_pages / sm_about_pages / sm_contact_pages / sm_course_pages
 * - home_sliders
 */
import { pgSchema, text, doublePrecision, integer, uuid, numeric, smallint, timestamp, jsonb, boolean, date, varchar, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { users, tenants, accounts, enumerations } from "./domain-core";

// Consolidates sm_news, sm_pages, sm_testimonials, etc., into a polymorphic content management schema.

export type ContentNodeMetadata = {
  // Event
  eventDate?: string;
  eventLocation?: string;
  // Testimonial
  clientDesignation?: string;
  clientCompany?: string;
  // Gallery
  imageCount?: number;
  // Page
  seoFocusKeyword?: string;
  seoDescription?: string;
  // Slider
  linkUrl?: string;
  linkLabel?: string;
  sortOrder?: number;
};
export const cmsSchema = pgSchema("domain_cms");


export const contentNodes = cmsSchema.table("content_nodes", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  contentType: varchar("content_type", { length: 150 }).notNull(),
  slug: varchar("slug", { length: 255 }),
  title: varchar("title", { length: 500 }).notNull(),
  body: text("body"),
  image: varchar("image", { length: 500 }),
  publishedStatus: smallint("published_status").notNull().default(1),
  publishedAt: timestamp("published_at"),
  expiresAt: timestamp("expires_at"),
  authorId: uuid("author_id").references(() => users.id),
  categoryId: uuid("category_id").references(() => enumerations.id),
  parentId: uuid("parent_id"),  // self-ref for menu hierarchy / gallery items
  sortOrder: integer("sort_order").default(0),
  metadata: jsonb("metadata").$type<ContentNodeMetadata>(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  tenantTypeIdx: index("cms_tenant_type_idx").on(table.tenantId, table.contentType),
  slugIdx: index("cms_slug_idx").on(table.tenantId, table.slug),
}));
