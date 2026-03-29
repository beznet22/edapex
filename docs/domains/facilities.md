# Domain Architecture: Facilities

## 1. Domain Overview
The **Facilities** domain manages the physical infrastructure and assets of the educational institution, including Student Housing (Hostels/Dormitories), Transport Services, and Inventory/Asset Management. In EdApex V2, this domain is characterized by **Tenant-Isolated Physical Assets** and **Polymorphic Allocation** systems.

### 1.1 Core Components
- **Transport**: Route planning, vehicle fleet management, and student/staff transit allocation.
- **Dormitory**: Building management, room categorization, and residential occupancy tracking.
- **Inventory**: Centralized stock management, procurement, sales, and internal issuance.
- **Support Services**: Integrated visitor management and facility-related complaint tracking.

## 2. Legacy Logic Parity (V1 -> V2)

### 2.1 Entity Mapping Table
| V1 (InfixEdu) Table | V2 (EdApex) Table | Technical Transformation |
| :--- | :--- | :--- |
| `sm_dormitory_lists` | `facilities.dormitories` | Normalized building-level metadata. |
| `sm_room_lists` | `facilities.rooms` | Linked to `dormitories` with `room_type` as metadata. |
| `sm_room_types` | `facilities.rooms` (metadata) | Flattened into JSONB room attributes. |
| `sm_routes` | `facilities.routes` | Preserves cost and title; isolated by `account_id`. |
| `sm_vehicles` | `facilities.vehicles` | Links to `account_id`; stores driver/model info. |
| `sm_assign_vehicles` | `facilities.route_assignments` | M:N relationship between routes and vehicles. |
| `sm_students` (route/room cols) | `facilities.facility_allocations` | **CRITICAL**: Moved from student columns to a polymorphic allocation table. |
| `sm_item_categories` | `facilities.inventory_categories` | Standard hierarchical categorization. |
| `sm_items` | `facilities.inventory_items` | Central product registry with inventory tracking. |
| `sm_item_stores` | `facilities.inventory_stores` | Physical warehouse isolation. |
| `sm_item_receives` | `facilities.inventory_transactions` | Type: `RECEIVE`. Stores procurement history. |
| `sm_item_sells` | `facilities.inventory_transactions` | Type: `SELL`. Stores revenue-generating transfers. |
| `sm_item_issues` | `facilities.inventory_transactions` | Type: `ISSUE`. Tracks internal lending/consumption. |

### 2.2 Logic Parity Notes
- **Financial Integration**: In V1, inventory transactions directly updated `sm_bank_statements`. In V2, these must trigger `domain_events` (`inventory.item_received`, `inventory.sale_completed`) which the **Finance Agent** consumes to reconcile accounts.
- **Occupancy Validation**: V1 relied on PHP-level checks for room capacity. V2 implements database-level aggregation or trigger-based validation on `facility_allocations` to prevent over-booking.

## 3. Database Schema (Drizzle)

### 3.1 Facility Allocations (Polymorphic)
```typescript
export const facilityAllocations = mysqlTable("edx_facility_allocations", {
  id: varchar("id", { length: 32 }).primaryKey(),
  tenantId: varchar("tenant_id", { length: 32 }).notNull(),
  accountId: varchar("account_id", { length: 32 }).notNull(),
  userId: varchar("user_id", { length: 32 }).notNull(), // Student or Staff
  facilityType: mysqlEnum("facility_type", ["TRANSPORT", "DORMITORY"]).notNull(),
  facilityRefId: varchar("facility_ref_id", { length: 32 }).notNull(), // route_id or room_id
  status: mysqlEnum("status", ["ACTIVE", "CANCELLED", "COMPLETED"]).default("ACTIVE"),
  metadata: json("metadata"), // e.g., seat number, bed number
  ...auditColumns,
});
```

### 3.2 Inventory Extension (Proposed)
> [!IMPORTANT]
> The following tables are proposed to complete the Facilities domain logic for Inventory.

```typescript
export const inventoryTransactions = mysqlTable("edx_inventory_transactions", {
  id: varchar("id", { length: 32 }).primaryKey(),
  type: mysqlEnum("transaction_type", ["RECEIVE", "SELL", "ISSUE", "RETURN"]),
  sourceStoreId: varchar("source_store_id", { length: 32 }),
  destStoreId: varchar("destination_store_id", { length: 32 }),
  amount: decimal("amount", { precision: 20, scale: 2 }),
  paidStatus: mysqlEnum("paid_status", ["PAID", "PARTIAL", "UNPAID"]),
  metadata: json("metadata"), // Linked item IDs, quantities, supplier info
  ...auditColumns,
});
```

## 4. AI-Driven Route Optimization

EdApex V2 integrates AI to solve the **Vehicle Routing Problem (VRP)** for school transport.

### 4.1 Optimization Protocol
1.  **Data Ingestion**: Regional AI nodes consume `facility_allocations` (Transport type) and student geolocations (anonymized).
2.  **Constraint Satisfaction**: Using tools like **Transfinder** or custom **Mastra Agents** (Geni-Routing), the system calculates:
    *   Minimum fleet size required.
    *   Optimal stop sequences to minimize ride time (< 45 mins).
    *   Dynamic re-routing for road closures via real-time traffic APIs.
3.  **Output**: Refined `routes` and `route_assignments` are pushed back to the DB, notifying drivers via the mobile app.

### 4.2 Logistics Automation
- **Predictive Maintenance**: AI analyzes vehicle mileage and incident history to schedule preventive maintenance (`maintenance.scheduled` event).
- **Smart Stocking**: Inventory agents predict "low stock" for uniforms/stationery based on academic calendar events (e.g., "Back to School" peak).

## 5. Security & Isolation
- **Tenant Isolation**: All physical assets (`dormitories`, `vehicles`, `stores`) are strictly filtered by `tenant_id`.
- **PBAC (Physical-Based Access Control)**: 
    - `STORE_MANAGER` can only view/edit `inventory` tables.
    - `TRANSPORT_DIRECTOR` manages `routes` and `vehicles`.
    - `Warden` manages `dormitories` and `complaints`.

---

## Hono API Routes

```
Routes → FacilitiesController → FacilitiesService → FacilitiesRepository
```

| Method | Route | Description | Auth |
|:---|:---|:---|:---|
| `GET` | `/api/v1/facilities/dormitories` | List dormitories | Authenticated |
| `POST` | `/api/v1/facilities/dormitories` | Create dormitory | `TenantAdmin` |
| `GET` | `/api/v1/facilities/rooms` | List rooms (filterable by dormitory) | Authenticated |
| `GET` | `/api/v1/facilities/routes` | List transport routes | Authenticated |
| `POST` | `/api/v1/facilities/routes` | Create route | `TransportDirector` |
| `GET` | `/api/v1/facilities/vehicles` | List vehicles | `TransportDirector` |
| `POST` | `/api/v1/facilities/allocations` | Create facility allocation | `TenantAdmin` |
| `GET` | `/api/v1/facilities/inventory` | List inventory items | `StoreManager` |
| `POST` | `/api/v1/facilities/inventory/transactions` | Create inventory transaction | `StoreManager` |
| `GET` | `/api/v1/facilities/visitors` | List visitor log | `TenantAdmin` |

---

## HMAS Agent Registry

| Agent | Type | Capabilities |
|:---|:---|:---|
| `facilities_supervisor` | Supervisor | Routes facility tasks, manages allocations |
| `route_optimizer` | Task | AI-driven vehicle routing (VRP solver) |
| `inventory_agent` | Task | Stock prediction, reorder triggers |
| `maintenance_agent` | Task | Predictive vehicle/building maintenance |

---

## Domain Events

| Event | Payload | Consumers |
|:---|:---|:---|
| `facilities.allocation_created` | `{ userId, facilityType, facilityRefId }` | Finance (assign transport/dorm fees) |
| `facilities.inventory_received` | `{ itemId, quantity, amount }` | Finance (ledger expense entry) |
| `facilities.inventory_sold` | `{ itemId, quantity, amount }` | Finance (ledger income entry) |
| `facilities.maintenance_due` | `{ vehicleId, type, dueDate }` | Communication (notify driver), Events (audit) |
