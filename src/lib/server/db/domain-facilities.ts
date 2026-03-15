import {
  mysqlTable,
  varchar,
  int,
  timestamp,
  mysqlEnum,
  decimal,
  index,
} from "drizzle-orm/mysql-core";

import { accounts } from "./domain-core";

// Consolidates transport and dormitory into a unified facilities schema using edx_accounts FKs.

export const dormitories = mysqlTable("edx_dormitories", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  type: mysqlEnum("type", ["boys", "girls", "mixed"]).notNull(),
  address: varchar("address", { length: 500 }),
  intake: int("intake"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const rooms = mysqlTable("edx_rooms", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull(),
  dormitoryId: int("dormitory_id").notNull().references(() => dormitories.id),
  roomNumber: varchar("room_number", { length: 50 }).notNull(),
  roomType: mysqlEnum("room_type", ["standard", "deluxe", "suite"]).notNull(),
  capacity: int("capacity").notNull(),
  costPerTerm: decimal("cost_per_term", { precision: 10, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow(),
});

export const routes = mysqlTable("edx_routes", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  cost: decimal("cost", { precision: 10, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow(),
});

export const vehicles = mysqlTable("edx_vehicles", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull(),
  vehicleNo: varchar("vehicle_no", { length: 100 }).notNull(),
  vehicleModel: varchar("vehicle_model", { length: 100 }),
  driverId: int("driver_id").references(() => accounts.id), // Link to staff account
  capacity: int("capacity").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const routeAssignments = mysqlTable("edx_route_assignments", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull(),
  routeId: int("route_id").notNull().references(() => routes.id),
  vehicleId: int("vehicle_id").notNull().references(() => vehicles.id),
  createdAt: timestamp("created_at").defaultNow(),
});

export const facilityAllocations = mysqlTable("edx_facility_allocations", {
  id: int("id").autoincrement().primaryKey(),
  tenantId: int("tenant_id").notNull(),
  accountId: int("account_id").notNull().references(() => accounts.id), // Occupant/Passenger
  facilityType: mysqlEnum("facility_type", ["transport", "dormitory"]).notNull(),
  facilityRefId: int("facility_ref_id").notNull(), // vehicle.id or room.id
  academicId: int("academic_id").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  allocationIdx: index("fac_alloc_idx").on(table.facilityType, table.facilityRefId),
  accountIdx: index("fac_acct_idx").on(table.accountId),
}));
