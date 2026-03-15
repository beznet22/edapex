import { pgSchema, text, timestamp, uuid, numeric, jsonb, pgTable } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { tenants, users } from "./core-schema";

export const domain = pgSchema("domain");

/**
 * PROFILES (Humans: Students, Staff, Guardians)
 * Linked 1:1 with core.users if they have login access.
 */
export const profiles = domain.table("profiles", {
  id: uuid("id").primaryKey().default(sql`gen_uuidv7()`),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  type: text("type", { 
    enum: ["student", "staff", "guardian", "sibling", "vendor", "supplier", "library_member"] 
  }).notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name"),
  email: text("email"),
  phone: text("phone"),
  data: jsonb("data").notNull().default({}), // PII, health records, bio
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * ASSETS (Physical & Logical Resources)
 * Replaces Inventory, Books, Vehicles.
 */
export const assets = domain.table("assets", {
  id: uuid("id").primaryKey().default(sql`gen_uuidv7()`),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  type: text("type", { 
    enum: ["book", "vehicle", "inventory_item", "dorm_allocation", "item_category", "book_category"] 
  }).notNull(),
  name: text("name").notNull(),
  identifier: text("identifier"), // Serial No, ISBN, Plate No
  data: jsonb("data").notNull().default({}), // Specs, maintenance info
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * ACADEMICS (Recursive structure for Classes -> Sections -> Subjects)
 */
export const academics = domain.table("academics", {
  id: uuid("id").primaryKey().default(sql`gen_uuidv7()`),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  type: text("type", { 
    enum: [
      "academic_year", "class", "section", "subject", "classroom", "class_teacher", 
      "topic", "syllabus", "lesson_plan", "study_material", "exam_type", 
      "exam_setup", "exam_schedule", "question_bank", "online_exam", "homework", 
      "fee_group", "fee_type", "fee_master", "fee_discount", "department", 
      "designation", "transport_route", "transport_stop", "vehicle_assignment", 
      "dormitory", "dorm_room", "dorm_room_type", "cms_page", "cms_menu", 
      "cms_gallery", "cms_testimonial", "cms_news"
    ] 
  }).notNull(),
  name: text("name").notNull(),
  parentId: uuid("parent_id").references((): any => academics.id), // e.g., Section belongs to Class
  config: jsonb("config").notNull().default({}), // Pass marks, credits, specific flags
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * LEDGER (Unified Financials)
 * Consolidates Fees, Wallets, Payroll, and Expenses.
 */
export const ledger = domain.table("ledger", {
  id: uuid("id").primaryKey().default(sql`gen_uuidv7()`),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  profileId: uuid("profile_id").references(() => profiles.id),
  assetId: uuid("asset_id").references(() => assets.id),
  amount: numeric("amount", { precision: 19, scale: 4 }).notNull(),
  balance: numeric("balance", { precision: 19, scale: 4 }), // Snapshot balance after tx
  category: text("category", { 
    enum: [
      "fee_collection", "wallet_deposit", "wallet_withdrawal", "admission_fee", 
      "salary_payout", "staff_allowance", "library_fine", "inventory_purchase", 
      "inventory_sale", "item_issuance", "room_rent", "transport_fee", 
      "generic_income", "generic_expense"
    ] 
  }).notNull(),
  status: text("status", { enum: ["posted", "pending", "void"] }).notNull().default("posted"),
  details: jsonb("details").notNull().default({}), // Reference numbers, payment methods
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * ACTIVITY LOGS (Attendance, Results, Behavioral)
 */
export const activityLogs = domain.table("activity_logs", {
  id: uuid("id").primaryKey().default(sql`gen_uuidv7()`),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  profileId: uuid("profile_id").references(() => profiles.id),
  assetId: uuid("asset_id").references(() => assets.id),
  type: text("type", { 
    enum: [
      "student_attendance", "staff_attendance", "subject_attendance", 
      "behavioral_record", "mark_entry", "exam_session", "homework_submission", 
      "library_issue", "library_return", "vehicle_checkin", "dorm_checkin", 
      "chat_log", "audit_event"
    ] 
  }).notNull(),
  value: text("value").notNull(), // 'present', 'A+', 'late'
  recordedAt: timestamp("recorded_at", { withTimezone: true }).defaultNow().notNull(),
  meta: jsonb("meta").default({}), // Specific details (Exam ID, lat/long for attendance)
});
