/**
 * ARCHITECTURE OVERVIEW: Facilities & Logistics Domain
 * 
 * Purpose:
 * Manages physical school assets and infrastructure. This includes transportation (vehicles, routes),
 * residential structures (hostels, dormitories, rooms), and their allocations. Connects finite 
 * resource allocations strictly to `account_id` replacing loose legacy foreign ID tracking, 
 * ensuring data integrity regardless of the user's role.
 * 
 * Replaces Legacy Tables:
 * - sm_vehicles / sm_routes / sm_assign_vehicles
 * - sm_dormitory_lists / sm_room_lists / sm_room_types
 * - sm_seat_plans / sm_seat_plan_children
 */
import { pgSchema, text, doublePrecision, integer, uuid, numeric, smallint, timestamp, jsonb, boolean, date, varchar, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

import { users, tenants, academicYears, accounts } from "./domain-core";

// Consolidates transport and dormitory into a unified facilities schema using accounts FKs.

// Facility Metadata Types
export type FacilityMetadata = {
  amenities?: string[];
  rules?: string;
  lastInspectionDate?: string;
};

export type VehicleMetadata = {
  insuranceExpiry?: string;
  lastServiceDate?: string;
  fuelType?: string;
  trackerId?: string;
};
export const facilitiesSchema = pgSchema("domain_facilities");


export const dormitories = facilitiesSchema.table("dormitories", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  name: varchar("name", { length: 255 }).notNull(),
  type: varchar("type", { length: 150 }).notNull(),
  address: varchar("address", { length: 500 }),
  intake: integer("intake"),
  metadata: jsonb("metadata").$type<FacilityMetadata>(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const rooms = facilitiesSchema.table("rooms", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  dormitoryId: uuid("dormitory_id").notNull().references(() => dormitories.id),
  roomNumber: varchar("room_number", { length: 50 }).notNull(),
  roomType: varchar("room_type", { length: 150 }).notNull(),
  capacity: integer("capacity").notNull(),
  costPerTerm: numeric("cost_per_term", { precision: 10, scale: 2 }),
  metadata: jsonb("metadata").$type<FacilityMetadata>(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const routes = facilitiesSchema.table("routes", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  name: varchar("name", { length: 255 }).notNull(),
  cost: numeric("cost", { precision: 10, scale: 2 }),
  metadata: jsonb("metadata").$type<FacilityMetadata>(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const vehicles = facilitiesSchema.table("vehicles", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  vehicleNo: varchar("vehicle_no", { length: 100 }).notNull(),
  vehicleModel: varchar("vehicle_model", { length: 100 }),
  driverId: uuid("driver_id").references(() => users.id), // Staff persona
  capacity: integer("capacity").notNull(),
  metadata: jsonb("metadata").$type<VehicleMetadata>(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const routeAssignments = facilitiesSchema.table("route_assignments", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  routeId: uuid("route_id").notNull().references(() => routes.id),
  vehicleId: uuid("vehicle_id").notNull().references(() => vehicles.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const facilityAllocations = facilitiesSchema.table("facility_allocations", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  userId: uuid("user_id").notNull().references(() => users.id), // Participant persona
  facilityType: varchar("facility_type", { length: 150 }).notNull(),
  facilityRefId: uuid("facility_ref_id").notNull(), // vehicle.id or room.id
  status: varchar("status", { length: 150 }).notNull().default("active"),
  academicId: uuid("academic_id").notNull().references(() => academicYears.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  allocationIdx: index("fac_alloc_idx").on(table.facilityType, table.facilityRefId),
  userIdx: index("fac_user_idx").on(table.userId),
  statusIdx: index("fac_status_idx").on(table.tenantId, table.status),
}));

// --- NEW TABLES ---

// Complaints — replaces smComplaints
export const complaints = facilitiesSchema.table("complaints", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  complaintBy: uuid("complaint_by").notNull().references(() => users.id), // Reporter persona
  complaintType: varchar("complaint_type", { length: 100 }).notNull(),
  complaintSource: varchar("complaint_source", { length: 150 }).notNull(),
  description: text("description").notNull(),
  actionTaken: text("action_taken"),
  status: varchar("status", { length: 150 }).notNull().default("open"),
  assignedTo: uuid("assigned_to").references(() => users.id), // Staff persona
  complaintDate: date("complaint_date", { mode: "string" }).notNull(),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  tenantStatusIdx: index("comp_tenant_status_idx").on(table.tenantId, table.status),
}));

// Visitors — replaces smVisitors
export const visitors = facilitiesSchema.table("visitors", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  name: varchar("name", { length: 200 }).notNull(),
  phone: varchar("phone", { length: 100 }),
  idNumber: varchar("id_number", { length: 100 }),
  purpose: varchar("purpose", { length: 500 }).notNull(),
  personToMeet: uuid("person_to_meet").references(() => users.id), // Staff persona
  checkInAt: timestamp("check_in_at").defaultNow(),
  checkOutAt: timestamp("check_out_at"),
  noOfPersons: integer("no_of_persons").default(1),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  tenantDateIdx: index("vis_tenant_date_idx").on(table.tenantId, table.checkInAt),
}));

// Inventory Items — consumable tracking with reorder levels
export type InventoryMetadata = {
  supplier?: string;
  location?: string;
  expiryDate?: string;
};

export const inventoryItems = facilitiesSchema.table("inventory_items", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
  name: varchar("name", { length: 255 }).notNull(),
  category: varchar("category", { length: 100 }),
  quantity: integer("quantity").notNull().default(0),
  unitCost: numeric("unit_cost", { precision: 12, scale: 2 }),
  reorderLevel: integer("reorder_level").default(0),
  status: varchar("status", { length: 150 }).notNull().default("in_stock"),
  metadata: jsonb("metadata").$type<InventoryMetadata>(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => ({
  tenantCategoryIdx: index("inv_tenant_cat_idx").on(table.tenantId, table.category),
  statusIdx: index("inv_status_idx").on(table.tenantId, table.status),
}));
