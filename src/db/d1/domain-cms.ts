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
import { unique,  sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";

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

export const contentNodes = sqliteTable("domain_cms_content_nodes", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  contentType: text("content_type", { enum: ["page", "news", "event", "testimonial", "gallery", "slider", "menu_item"] }).notNull(),
  slug: text("slug", { length: 255 }),
  title: text("title", { length: 500 }).notNull(),
  body: text("body"),
  image: text("image", { length: 500 }),
  publishedStatus: integer("published_status").notNull().default(1),
  publishedAt: integer("published_at", { mode: "timestamp" }),
  expiresAt: integer("expires_at", { mode: "timestamp" }),
  authorId: integer("author_id").references(() => users.id),
  categoryId: integer("category_id").references(() => enumerations.id),
  parentId: integer("parent_id"),  // self-ref for menu hierarchy / gallery items
  sortOrder: integer("sort_order").default(0),
  metadata: text("metadata", { mode: "json" }).$type<ContentNodeMetadata>(),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
}, (table) => ({
  tenantTypeIdx: index("cms_tenant_type_idx").on(table.tenantId, table.contentType),
  slugIdx: index("cms_slug_idx").on(table.tenantId, table.slug),
}));
