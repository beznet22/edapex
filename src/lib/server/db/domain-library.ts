import {
  mysqlTable,
  varchar,
  int,
  timestamp,
  mysqlEnum,
  date,
  index,
} from "drizzle-orm/mysql-core";

import { accounts } from "./domain-core";

// Consolidates sm_books, sm_book_issues, sm_book_categories. Uses edx_accounts FK instead of student_staff_id.

export const bookCategories = mysqlTable("edx_book_categories", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull(),
  categoryName: varchar("category_name", { length: 255 }).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const books = mysqlTable("edx_books", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull(),
  categoryId: int("category_id").references(() => bookCategories.id),
  title: varchar("title", { length: 255 }).notNull(),
  author: varchar("author", { length: 255 }),
  isbn: varchar("isbn", { length: 100 }),
  quantity: int("quantity").notNull().default(1),
  available: int("available").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  tenantCategoryIdx: index("book_tenant_cat_idx").on(table.tenantId, table.categoryId),
}));

export const bookIssues = mysqlTable("edx_book_issues", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull(),
  bookId: int("book_id").notNull().references(() => books.id),
  accountId: int("account_id").notNull().references(() => accounts.id), // Borrower
  issueDate: date("issue_date", { mode: "string" }).notNull(),
  dueDate: date("due_date", { mode: "string" }).notNull(),
  returnDate: date("return_date", { mode: "string" }),
  status: mysqlEnum("status", ["issued", "returned", "overdue"]).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  bookAccountIdx: index("bissue_book_acct_idx").on(table.bookId, table.accountId),
}));
