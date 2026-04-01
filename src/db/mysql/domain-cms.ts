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
import {

  mysqlTable,
  varchar,
  int,
  timestamp,
  mysqlEnum,
  text,
  json,
  tinyint,
  index,
} from "drizzle-orm/mysql-core";

import { users, tenants, accounts, enumerations } from "./domain-core";
import { generateId } from "../utils/id";

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

export const contentNodes = mysqlTable("content_nodes", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => generateId()),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  contentType: mysqlEnum("content_type", ["page", "news", "event", "testimonial", "gallery", "slider", "menu_item"]).notNull(),
  slug: varchar("slug", { length: 255 }),
  title: varchar("title", { length: 500 }).notNull(),
  body: text("body"),
  image: varchar("image", { length: 500 }),
  publishedStatus: tinyint("published_status").notNull().default(1),
  publishedAt: timestamp("published_at"),
  expiresAt: timestamp("expires_at"),
  authorId: varchar("author_id", { length: 36 }).references(() => users.id),
  categoryId: varchar("category_id", { length: 36 }).references(() => enumerations.id),
  parentId: varchar("parent_id", { length: 36 }),  // self-ref for menu hierarchy / gallery items
  sortOrder: int("sort_order").default(0),
  metadata: json("metadata").$type<ContentNodeMetadata>(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
  tenantTypeIdx: index("cms_tenant_type_idx").on(table.tenantId, table.contentType),
  slugIdx: index("cms_slug_idx").on(table.tenantId, table.slug),
}));
