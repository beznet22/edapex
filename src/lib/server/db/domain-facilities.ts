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
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id),
  name: varchar("name", { length: 255 }).notNull(),
  type: mysqlEnum("type", ["boys", "girls", "mixed"]).notNull(),
  address: varchar("address", { length: 500 }),
  intake: int("intake"),
  metadata: json("metadata").$type<FacilityMetadata>(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const rooms = mysqlTable("rooms", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id),
  dormitoryId: int("dormitory_id").notNull().references(() => dormitories.id),
  roomNumber: varchar("room_number", { length: 50 }).notNull(),
  roomType: mysqlEnum("room_type", ["standard", "deluxe", "suite"]).notNull(),
  capacity: int("capacity").notNull(),
  costPerTerm: decimal("cost_per_term", { precision: 10, scale: 2 }),
  metadata: json("metadata").$type<FacilityMetadata>(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const routes = mysqlTable("routes", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id),
  name: varchar("name", { length: 255 }).notNull(),
  cost: decimal("cost", { precision: 10, scale: 2 }),
  metadata: json("metadata").$type<FacilityMetadata>(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const vehicles = mysqlTable("vehicles", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id),
  vehicleNo: varchar("vehicle_no", { length: 100 }).notNull(),
  vehicleModel: varchar("vehicle_model", { length: 100 }),
  driverId: int("driver_id").references(() => users.id), // Staff persona
  capacity: int("capacity").notNull(),
  metadata: json("metadata").$type<VehicleMetadata>(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const routeAssignments = mysqlTable("route_assignments", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id),
  routeId: int("route_id").notNull().references(() => routes.id),
  vehicleId: int("vehicle_id").notNull().references(() => vehicles.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
});

export const facilityAllocations = mysqlTable("facility_allocations", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id),
  userId: int("user_id").notNull().references(() => users.id), // Participant persona
  facilityType: mysqlEnum("facility_type", ["transport", "dormitory"]).notNull(),
  facilityRefId: int("facility_ref_id").notNull(), // vehicle.id or room.id
  academicId: int("academic_id").notNull().references(() => academicYears.id),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
  allocationIdx: index("fac_alloc_idx").on(table.facilityType, table.facilityRefId),
  userIdx: index("fac_user_idx").on(table.userId),
}));

// --- NEW TABLES ---

// Complaints — replaces smComplaints
export const complaints = mysqlTable("complaints", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id),
  complaintBy: int("complaint_by").notNull().references(() => users.id), // Reporter persona
  complaintType: varchar("complaint_type", { length: 100 }).notNull(),
  complaintSource: mysqlEnum("complaint_source", ["parent", "student", "staff", "external"]).notNull(),
  description: text("description").notNull(),
  actionTaken: text("action_taken"),
  status: mysqlEnum("status", ["open", "in_progress", "resolved", "closed"]).notNull().default("open"),
  assignedTo: int("assigned_to").references(() => users.id), // Staff persona
  complaintDate: date("complaint_date", { mode: "string" }).notNull(),
  resolvedAt: timestamp("resolved_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
  tenantStatusIdx: index("comp_tenant_status_idx").on(table.tenantId, table.status),
}));

// Visitors — replaces smVisitors
export const visitors = mysqlTable("visitors", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull().references(() => tenants.id),
  name: varchar("name", { length: 200 }).notNull(),
  phone: varchar("phone", { length: 100 }),
  idNumber: varchar("id_number", { length: 100 }),
  purpose: varchar("purpose", { length: 500 }).notNull(),
  personToMeet: int("person_to_meet").references(() => users.id), // Staff persona
  checkInAt: timestamp("check_in_at").defaultNow(),
  checkOutAt: timestamp("check_out_at"),
  noOfPersons: int("no_of_persons").default(1),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow().onUpdateNow(),
}, (table) => ({
  tenantDateIdx: index("vis_tenant_date_idx").on(table.tenantId, table.checkInAt),
}));
