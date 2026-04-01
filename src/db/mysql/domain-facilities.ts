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
import {

  mysqlTable,
  varchar,
  int,
  timestamp,
  mysqlEnum,
  decimal,
  index,
  text,
  date,
  json,
} from "drizzle-orm/mysql-core";

import { users, tenants, academicYears, accounts } from "./domain-core";
import { generateId } from "../utils/id";

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

export const dormitories = mysqlTable("dormitories", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => generateId()),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  name: varchar("name", { length: 255 }).notNull(),
  type: mysqlEnum("type", ["boys", "girls", "mixed"]).notNull(),
  address: varchar("address", { length: 500 }),
  intake: int("intake"),
  metadata: json("metadata").$type<FacilityMetadata>(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const rooms = mysqlTable("rooms", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => generateId()),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  dormitoryId: varchar("dormitory_id", { length: 36 }).notNull().references(() => dormitories.id),
  roomNumber: varchar("room_number", { length: 50 }).notNull(),
  roomType: mysqlEnum("room_type", ["standard", "deluxe", "suite"]).notNull(),
  capacity: int("capacity").notNull(),
  costPerTerm: decimal("cost_per_term", { precision: 10, scale: 2 }),
  metadata: json("metadata").$type<FacilityMetadata>(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const routes = mysqlTable("routes", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => generateId()),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  name: varchar("name", { length: 255 }).notNull(),
  cost: decimal("cost", { precision: 10, scale: 2 }),
  metadata: json("metadata").$type<FacilityMetadata>(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const vehicles = mysqlTable("vehicles", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => generateId()),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  vehicleNo: varchar("vehicle_no", { length: 100 }).notNull(),
  vehicleModel: varchar("vehicle_model", { length: 100 }),
  driverId: varchar("driver_id", { length: 36 }).references(() => users.id), // Staff persona
  capacity: int("capacity").notNull(),
  metadata: json("metadata").$type<VehicleMetadata>(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const routeAssignments = mysqlTable("route_assignments", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => generateId()),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  routeId: varchar("route_id", { length: 36 }).notNull().references(() => routes.id),
  vehicleId: varchar("vehicle_id", { length: 36 }).notNull().references(() => vehicles.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const facilityAllocations = mysqlTable("facility_allocations", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => generateId()),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id), // Participant persona
  facilityType: mysqlEnum("facility_type", ["transport", "dormitory"]).notNull(),
  facilityRefId: varchar("facility_ref_id", { length: 36 }).notNull(), // vehicle.id or room.id
  status: mysqlEnum("status", ["active", "released", "transferred"]).notNull().default("active"),
  academicId: varchar("academic_id", { length: 36 }).notNull().references(() => academicYears.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
  allocationIdx: index("fac_alloc_idx").on(table.facilityType, table.facilityRefId),
  userIdx: index("fac_user_idx").on(table.userId),
  statusIdx: index("fac_status_idx").on(table.tenantId, table.status),
}));

// --- NEW TABLES ---

// Complaints — replaces smComplaints
export const complaints = mysqlTable("complaints", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => generateId()),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  complaintBy: varchar("complaint_by", { length: 36 }).notNull().references(() => users.id), // Reporter persona
  complaintType: varchar("complaint_type", { length: 100 }).notNull(),
  complaintSource: mysqlEnum("complaint_source", ["parent", "student", "staff", "external"]).notNull(),
  description: text("description").notNull(),
  actionTaken: text("action_taken"),
  status: mysqlEnum("status", ["open", "in_progress", "resolved", "closed"]).notNull().default("open"),
  assignedTo: varchar("assigned_to", { length: 36 }).references(() => users.id), // Staff persona
  complaintDate: date("complaint_date", { mode: "string" }).notNull(),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
  tenantStatusIdx: index("comp_tenant_status_idx").on(table.tenantId, table.status),
}));

// Visitors — replaces smVisitors
export const visitors = mysqlTable("visitors", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => generateId()),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  name: varchar("name", { length: 200 }).notNull(),
  phone: varchar("phone", { length: 100 }),
  idNumber: varchar("id_number", { length: 100 }),
  purpose: varchar("purpose", { length: 500 }).notNull(),
  personToMeet: varchar("person_to_meet", { length: 36 }).references(() => users.id), // Staff persona
  checkInAt: timestamp("check_in_at").defaultNow(),
  checkOutAt: timestamp("check_out_at"),
  noOfPersons: int("no_of_persons").default(1),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
  tenantDateIdx: index("vis_tenant_date_idx").on(table.tenantId, table.checkInAt),
}));

// Inventory Items — consumable tracking with reorder levels
export type InventoryMetadata = {
  supplier?: string;
  location?: string;
  expiryDate?: string;
};

export const inventoryItems = mysqlTable("inventory_items", {
  id: varchar("id", { length: 36 }).primaryKey().$defaultFn(() => generateId()),
  tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => tenants.id),
  name: varchar("name", { length: 255 }).notNull(),
  category: varchar("category", { length: 100 }),
  quantity: int("quantity").notNull().default(0),
  unitCost: decimal("unit_cost", { precision: 12, scale: 2 }),
  reorderLevel: int("reorder_level").default(0),
  status: mysqlEnum("status", ["in_stock", "low_stock", "out_of_stock"]).notNull().default("in_stock"),
  metadata: json("metadata").$type<InventoryMetadata>(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
  tenantCategoryIdx: index("inv_tenant_cat_idx").on(table.tenantId, table.category),
  statusIdx: index("inv_status_idx").on(table.tenantId, table.status),
}));
