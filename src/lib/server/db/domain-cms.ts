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

import { users, tenants, accounts } from "./domain-core";

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
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id),
  contentType: mysqlEnum("content_type", ["page", "news", "event", "testimonial", "gallery", "slider", "menu_item"]).notNull(),
  slug: varchar("slug", { length: 255 }),
  title: varchar("title", { length: 500 }).notNull(),
  body: text("body"),
  image: varchar("image", { length: 500 }),
  publishedStatus: tinyint("published_status").notNull().default(1),
  authorId: int("author_id").references(() => users.id), // Staff persona
  parentId: int("parent_id"),  // self-ref for menu hierarchy / gallery items
  sortOrder: int("sort_order").default(0),
  metadata: json("metadata").$type<ContentNodeMetadata>(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
  tenantTypeIdx: index("cms_tenant_type_idx").on(table.tenantId, table.contentType),
  slugIdx: index("cms_slug_idx").on(table.tenantId, table.slug),
}));
