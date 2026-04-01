/**
 * ARCHITECTURE OVERVIEW: Library Domain
 * 
 * Purpose:
 * Manages non-consumable tracking within physical/digital libraries. Employs 
 * transaction logging limits on `edx_book_issues` securely tied to `account_id` 
 * and homogeneously enforced via physical `tenant_id` logic.
 * 
 * Replaces Legacy Tables:
 * - sm_books
 * - sm_book_categories
 * - sm_book_issues / library_subjects
 */
import { unique,  sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";

import { users, tenants, academicYears, accounts } from "./domain-core";
import { generateId } from "../utils/id";

// Rewritten Library Domain - drops edx_ prefix and adds improvements

export const bookCategories = sqliteTable("domain_library_book_categories", {
  id: text("id").primaryKey().$defaultFn(() => generateId()),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  name: text("name", { length: 200 }).notNull(),
  description: text("description", { length: 500 }),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
});

// Library Metadata Types
export type BookMetadata = {
  edition?: string;
  language?: string;
  pages?: number;
  tags?: string[];
};

export const books = sqliteTable("domain_library_books", {
  id: text("id").primaryKey().$defaultFn(() => generateId()),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  title: text("title", { length: 255 }).notNull(),
  isbn: text("isbn", { length: 50 }),
  author: text("author", { length: 255 }),
  publisher: text("publisher", { length: 255 }),
  categoryId: text("category_id").references(() => bookCategories.id),
  quantity: integer("quantity").notNull().default(0),
  price: real("price"),
  rackNo: text("rack_no", { length: 100 }),
  metadata: text("metadata", { mode: "json" }).$type<BookMetadata>(),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
}, (table) => ({
  tenantIdx: index("book_tenant_idx").on(table.tenantId),
  categoryIdx: index("book_category_idx").on(table.categoryId),
}));

export const bookIssues = sqliteTable("domain_library_book_issues", {
  id: text("id").primaryKey().$defaultFn(() => generateId()),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  bookId: text("book_id").notNull().references(() => books.id),
  userId: text("user_id").notNull().references(() => users.id), // Borrower persona
  issueDate: integer("issue_date", { mode: "timestamp" }).defaultNow().notNull(),
  dueDate: integer("due_date", { mode: "timestamp" }).notNull(),
  returnDate: integer("return_date", { mode: "timestamp" }),
  status: text("status", { enum: ["issued", "returned", "lost", "damaged"] }).notNull().default("issued"),
  fineAmount: real("fine_amount").default(0.00),
  isFinePaid: integer("is_fine_paid").default(0),
  academicId: text("academic_id").references(() => academicYears.id),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
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

export const libraryProfiles = sqliteTable("domain_library_library_profiles", {
  id: text("id").primaryKey().$defaultFn(() => generateId()),
  tenantId: text("tenant_id").notNull().references(() => tenants.id),
  userId: text("user_id").notNull().references(() => users.id),
  maxBooksAllowed: integer("max_books_allowed").notNull().default(3),
  currentBorrowed: integer("current_borrowed").notNull().default(0),
  totalFinesAccrued: real("total_fines_accrued").default(0.00),
  membershipStatus: text("membership_status", { enum: ["active", "suspended", "expired"] }).notNull().default("active"),
  metadata: text("metadata", { mode: "json" }).$type<LibraryProfileMetadata>(),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
}, (table) => ({
  userIdx: unique("lp_user_unique").on(table.tenantId, table.userId),
  statusIdx: index("lp_status_idx").on(table.tenantId, table.membershipStatus),
}));
