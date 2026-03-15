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

import { accounts } from "./domain-core";

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
};

export const contentNodes = mysqlTable("edx_content_nodes", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull(),
  contentType: mysqlEnum("content_type", ["page", "news", "event", "testimonial", "gallery"]).notNull(),
  slug: varchar("slug", { length: 255 }),
  title: varchar("title", { length: 500 }).notNull(),
  body: text("body"),
  publishedStatus: tinyint("published_status").notNull().default(1),
  authorId: int("author_id").references(() => accounts.id),
  metadata: json("metadata").$type<ContentNodeMetadata>(), // extra fields like event_date, client_designation, etc.
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
  tenantTypeIdx: index("cms_tenant_type_idx").on(table.tenantId, table.contentType),
}));
