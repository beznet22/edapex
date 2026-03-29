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
import {

  mysqlTable,
  varchar,
  int,
  timestamp,
  mysqlEnum,
  decimal,
  index,
  json,
  unique,
} from "drizzle-orm/mysql-core";

import { users, tenants, academicYears, accounts } from "./domain-core";

// Rewritten Library Domain - drops edx_ prefix and adds improvements

export const bookCategories = mysqlTable("book_categories", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id),
  name: varchar("name", { length: 200 }).notNull(),
  description: varchar("description", { length: 500 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

// Library Metadata Types
export type BookMetadata = {
  edition?: string;
  language?: string;
  pages?: number;
  tags?: string[];
};

export const books = mysqlTable("books", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id),
  title: varchar("title", { length: 255 }).notNull(),
  isbn: varchar("isbn", { length: 50 }),
  author: varchar("author", { length: 255 }),
  publisher: varchar("publisher", { length: 255 }),
  categoryId: int("category_id").references(() => bookCategories.id),
  quantity: int("quantity").notNull().default(0),
  price: decimal("price", { precision: 12, scale: 2 }),
  rackNo: varchar("rack_no", { length: 100 }),
  metadata: json("metadata").$type<BookMetadata>(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
  tenantIdx: index("book_tenant_idx").on(table.tenantId),
  categoryIdx: index("book_category_idx").on(table.categoryId),
}));

export const bookIssues = mysqlTable("book_issues", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id),
  bookId: int("book_id").notNull().references(() => books.id),
  userId: int("user_id").notNull().references(() => users.id), // Borrower persona
  issueDate: timestamp("issue_date").defaultNow().notNull(),
  dueDate: timestamp("due_date").notNull(),
  returnDate: timestamp("return_date"),
  status: mysqlEnum("status", ["issued", "returned", "lost", "damaged"]).notNull().default("issued"),
  fineAmount: decimal("fine_amount", { precision: 12, scale: 2 }).default("0.00"),
  isFinePaid: int("is_fine_paid").default(0),
  academicId: int("academic_id").references(() => academicYears.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
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

export const libraryProfiles = mysqlTable("library_profiles", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id),
  userId: int("user_id").notNull().references(() => users.id),
  maxBooksAllowed: int("max_books_allowed").notNull().default(3),
  currentBorrowed: int("current_borrowed").notNull().default(0),
  totalFinesAccrued: decimal("total_fines_accrued", { precision: 12, scale: 2 }).default("0.00"),
  membershipStatus: mysqlEnum("membership_status", ["active", "suspended", "expired"]).notNull().default("active"),
  metadata: json("metadata").$type<LibraryProfileMetadata>(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
  userIdx: unique("lp_user_unique").on(table.tenantId, table.userId),
  statusIdx: index("lp_status_idx").on(table.tenantId, table.membershipStatus),
}));
