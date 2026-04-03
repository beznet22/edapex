/**
 * ARCHITECTURE OVERVIEW: Library Domain
 * 
 * Purpose:
 * Manages non-consumable tracking within physical/digital libraries. Employs 
 * transaction logging limits on `book_issues` securely tied to `account_id` 
 * and homogeneously enforced via physical `tenant_id` logic.
 * 
 * Replaces Legacy Tables:
 * - sm_books
 * - sm_book_categories
 * - sm_book_issues / library_subjects
 */
import { pgSchema, text, doublePrecision, integer, uuid, numeric, smallint, timestamp, jsonb, boolean, date, varchar, index, unique } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { users, tenants, academicYears, accounts } from "./domain-core";

// Rewritten Library Domain - drops  prefix and adds improvements
export const librarySchema = pgSchema("domain_library");


export const bookCategories = librarySchema.table("book_categories", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  name: varchar("name", { length: 200 }).notNull(),
  description: varchar("description", { length: 500 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Library Metadata Types
export type BookMetadata = {
  edition?: string;
  language?: string;
  pages?: number;
  tags?: string[];
};

export const books = librarySchema.table("books", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  title: varchar("title", { length: 255 }).notNull(),
  isbn: varchar("isbn", { length: 50 }),
  author: varchar("author", { length: 255 }),
  publisher: varchar("publisher", { length: 255 }),
  categoryId: uuid("category_id").references(() => bookCategories.id),
  quantity: integer("quantity").notNull().default(0),
  price: numeric("price", { precision: 12, scale: 2 }),
  rackNo: varchar("rack_no", { length: 100 }),
  metadata: jsonb("metadata").$type<BookMetadata>(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  tenantIdx: index("book_tenant_idx").on(table.tenantId),
  categoryIdx: index("book_category_idx").on(table.categoryId),
}));

export const bookIssues = librarySchema.table("book_issues", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  bookId: uuid("book_id").notNull().references(() => books.id),
  userId: uuid("user_id").notNull().references(() => users.id), // Borrower persona
  issueDate: timestamp("issue_date").defaultNow().notNull(),
  dueDate: timestamp("due_date").notNull(),
  returnDate: timestamp("return_date"),
  status: varchar("status", { length: 150 }).notNull().default("issued"),
  fineAmount: numeric("fine_amount", { precision: 12, scale: 2 }).default("0.00"),
  isFinePaid: integer("is_fine_paid").default(0),
  academicId: uuid("academic_id").references(() => academicYears.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  userIdx: index("bi_user_idx").on(table.userId),
  bookIdx: index("bi_book_idx").on(table.bookId),
  tenantIdx: index("bi_tenant_idx").on(table.tenantId),
}));

// Borrower profiles — per-user library membership and limits
export type LibraryProfileMetadata = {
  membershipType?: string;  // e.g. 'standard', 'premium', 'staff'
  notes?: string;
};

export const libraryProfiles = librarySchema.table("library_profiles", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  userId: uuid("user_id").notNull().references(() => users.id),
  maxBooksAllowed: integer("max_books_allowed").notNull().default(3),
  currentBorrowed: integer("current_borrowed").notNull().default(0),
  totalFinesAccrued: numeric("total_fines_accrued", { precision: 12, scale: 2 }).default("0.00"),
  membershipStatus: varchar("membership_status", { length: 150 }).notNull().default("active"),
  metadata: jsonb("metadata").$type<LibraryProfileMetadata>(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  userIdx: unique("lp_user_unique").on(table.tenantId, table.userId),
  statusIdx: index("lp_status_idx").on(table.tenantId, table.membershipStatus),
}));
