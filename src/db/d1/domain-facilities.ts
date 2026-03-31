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
import { unique,  sqliteTable, text, integer, real, index } from "drizzle-orm/sqlite-core";

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

export const dormitories = sqliteTable("domain_facilities_dormitories", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  name: text("name", { length: 255 }).notNull(),
  type: text("type", { enum: ["boys", "girls", "mixed"] }).notNull(),
  address: text("address", { length: 500 }),
  intake: integer("intake"),
  metadata: text("metadata", { mode: "json" }).$type<FacilityMetadata>(),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
});

export const rooms = sqliteTable("domain_facilities_rooms", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  dormitoryId: integer("dormitory_id").notNull().references(() => dormitories.id),
  roomNumber: text("room_number", { length: 50 }).notNull(),
  roomType: text("room_type", { enum: ["standard", "deluxe", "suite"] }).notNull(),
  capacity: integer("capacity").notNull(),
  costPerTerm: real("cost_per_term"),
  metadata: text("metadata", { mode: "json" }).$type<FacilityMetadata>(),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
});

export const routes = sqliteTable("domain_facilities_routes", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  name: text("name", { length: 255 }).notNull(),
  cost: real("cost"),
  metadata: text("metadata", { mode: "json" }).$type<FacilityMetadata>(),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
});

export const vehicles = sqliteTable("domain_facilities_vehicles", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  vehicleNo: text("vehicle_no", { length: 100 }).notNull(),
  vehicleModel: text("vehicle_model", { length: 100 }),
  driverId: integer("driver_id").references(() => users.id), // Staff persona
  capacity: integer("capacity").notNull(),
  metadata: text("metadata", { mode: "json" }).$type<VehicleMetadata>(),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
});

export const routeAssignments = sqliteTable("domain_facilities_route_assignments", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  routeId: integer("route_id").notNull().references(() => routes.id),
  vehicleId: integer("vehicle_id").notNull().references(() => vehicles.id),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
});

export const facilityAllocations = sqliteTable("domain_facilities_facility_allocations", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  userId: integer("user_id").notNull().references(() => users.id), // Participant persona
  facilityType: text("facility_type", { enum: ["transport", "dormitory"] }).notNull(),
  facilityRefId: integer("facility_ref_id").notNull(), // vehicle.id or room.id
  status: text("status", { enum: ["active", "released", "transferred"] }).notNull().default("active"),
  academicId: integer("academic_id").notNull().references(() => academicYears.id),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
}, (table) => ({
  allocationIdx: index("fac_alloc_idx").on(table.facilityType, table.facilityRefId),
  userIdx: index("fac_user_idx").on(table.userId),
  statusIdx: index("fac_status_idx").on(table.tenantId, table.status),
}));

// --- NEW TABLES ---

// Complaints — replaces smComplaints
export const complaints = sqliteTable("domain_facilities_complaints", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  complaintBy: integer("complaint_by").notNull().references(() => users.id), // Reporter persona
  complaintType: text("complaint_type", { length: 100 }).notNull(),
  complaintSource: text("complaint_source", { enum: ["parent", "student", "staff", "external"] }).notNull(),
  description: text("description").notNull(),
  actionTaken: text("action_taken"),
  status: text("status", { enum: ["open", "in_progress", "resolved", "closed"] }).notNull().default("open"),
  assignedTo: integer("assigned_to").references(() => users.id), // Staff persona
  complaintDate: text("complaint_date").notNull(),
  resolvedAt: integer("resolved_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
}, (table) => ({
  tenantStatusIdx: index("comp_tenant_status_idx").on(table.tenantId, table.status),
}));

// Visitors — replaces smVisitors
export const visitors = sqliteTable("domain_facilities_visitors", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  name: text("name", { length: 200 }).notNull(),
  phone: text("phone", { length: 100 }),
  idNumber: text("id_number", { length: 100 }),
  purpose: text("purpose", { length: 500 }).notNull(),
  personToMeet: integer("person_to_meet").references(() => users.id), // Staff persona
  checkInAt: integer("check_in_at", { mode: "timestamp" }).defaultNow(),
  checkOutAt: integer("check_out_at", { mode: "timestamp" }),
  noOfPersons: integer("no_of_persons").default(1),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
}, (table) => ({
  tenantDateIdx: index("vis_tenant_date_idx").on(table.tenantId, table.checkInAt),
}));

// Inventory Items — consumable tracking with reorder levels
export type InventoryMetadata = {
  supplier?: string;
  location?: string;
  expiryDate?: string;
};

export const inventoryItems = sqliteTable("domain_facilities_inventory_items", {
  id: integer("id", { mode: "number" }).primaryKey({ autoIncrement: true }),
  tenantId: integer("tenant_id").notNull().references(() => tenants.id),
  name: text("name", { length: 255 }).notNull(),
  category: text("category", { length: 100 }),
  quantity: integer("quantity").notNull().default(0),
  unitCost: real("unit_cost"),
  reorderLevel: integer("reorder_level").default(0),
  status: text("status", { enum: ["in_stock", "low_stock", "out_of_stock"] }).notNull().default("in_stock"),
  metadata: text("metadata", { mode: "json" }).$type<InventoryMetadata>(),
  createdAt: integer("created_at", { mode: "timestamp" }).defaultNow(),
  updatedAt: integer("updated_at", { mode: "timestamp" }).defaultNow(),
}, (table) => ({
  tenantCategoryIdx: index("inv_tenant_cat_idx").on(table.tenantId, table.category),
  statusIdx: index("inv_status_idx").on(table.tenantId, table.status),
}));
