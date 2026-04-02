# Facilities & Logistics Domain Architecture

## Overview
The Facilities domain manages physical school infrastructure including transportation (vehicles, routes), residential structures (dormitories, rooms), visitor management, complaint handling, and consumable inventory. It connects resource allocations strictly to user personas via `userId`.

### Key Business Logic
- **Unified Allocations**: A polymorphic `facilityAllocations` table maps users to either transport or dormitory resources.
- **Transport Management**: Vehicles → Routes → Route Assignments. Drivers are Staff personas.
- **Hostel Management**: Dormitories → Rooms → Allocations. Room types support cost-per-term billing.
- **Complaint Lifecycle**: Open → In Progress → Resolved → Closed with assignment tracking.
- **Inventory Tracking**: Consumable items with reorder levels and automatic low-stock detection.

---

## Logic Parity (Legacy to V2)

### Schema Mapping
| Legacy Table (`schoolify`) | V2 Entity (`src/db/domain-facilities.ts`) | Notes |
| :--- | :--- | :--- |
| `sm_dormitory_lists` | `dormitories` | Type enum: `boys`, `girls`, `mixed`. JSON metadata for amenities. |
| `sm_room_lists` / `sm_room_types` | `rooms` | Room type enum: `standard`, `deluxe`, `suite`. Cost per term. |
| `sm_vehicles` | `vehicles` | Driver FK to `users`. JSON metadata for insurance, service. |
| `sm_routes` | `routes` | Route definitions with cost. |
| `sm_assign_vehicles` | `routeAssignments` | Vehicle → Route junction. |
| `sm_seat_plans` / `sm_seat_plan_children` | `facilityAllocations` | Polymorphic: `facilityType` + `facilityRefId`. |
| `sm_complaints` | `complaints` | Source enum: `parent`, `student`, `staff`, `external`. |
| `sm_visitors` | `visitors` | Check-in/out tracking with person-to-meet FK. |
| — (new) | `inventoryItems` | Consumable tracking with reorder levels. |

---

## Technical Implementation

### Core Entities

#### [Dormitories / Rooms](file:///home/beznet/Workspace/edapex/src/db/sqlite/domain-facilities.ts#L36)
Residential structure with typed rooms and cost-per-term for Finance integration.

#### [Vehicles / Routes / RouteAssignments](file:///home/beznet/Workspace/edapex/src/db/sqlite/domain-facilities.ts#L61)
Transport fleet with driver assignment and route mapping.

#### [FacilityAllocations](file:///home/beznet/Workspace/edapex/src/db/sqlite/domain-facilities.ts#L92)
Polymorphic allocation: `facilityType` (`transport` | `dormitory`) + `facilityRefId`. Status: `active`, `released`, `transferred`.

#### [Complaints](file:///home/beznet/Workspace/edapex/src/db/sqlite/domain-facilities.ts#L111)
Issue tracking with assignment workflow and resolution timestamps.

#### [Visitors](file:///home/beznet/Workspace/edapex/src/db/sqlite/domain-facilities.ts#L130)
Gate management with check-in/out logging and person-to-meet tracking.

#### [InventoryItems](file:///home/beznet/Workspace/edapex/src/db/sqlite/domain-facilities.ts#L154)
Consumables with auto-status (`in_stock`, `low_stock`, `out_of_stock`) based on reorder levels.

---

## AI Task Agents & Tools

### Operational Tools (Mastra)
- `facilities.trackInventory(tenantId)`: Real-time tracking of consumables and assets.
- `facilities.bookRoom(roomId, timeslot)`: Reserves facility space with collision check.
- `facilities.scheduleMaintenance(assetId)`: Logs and assigns repair/maintenance tasks.
- `allocate_transport`: Assigns students to vehicle routes based on address proximity.
- `allocate_dormitory`: Assigns students to rooms based on capacity and preferences.

### [STRESS DEFENSE] Tools
- `vehicle_gps_anomaly_detector`: Flags route deviation and driver behavior anomalies.
- `overbooking_guard`: Prevents allocation beyond room/vehicle capacity.
- `reorder_trigger_engine`: Fires procurement alerts when inventory hits reorder levels.
- `complaint_sla_enforcer`: Escalates unresolved complaints past SLA deadlines.
- `visitor_dwell_alarm`: Flags visitors exceeding expected duration for security review.

---

## PBAC & Security
- **TenantAdmin**: Full control over all facilities.
- **Staff**: Can manage complaints assigned to them and log visitors.
- **Parent/Student**: Read-only access to their own facility allocations.

---

## Hono API Routes

| Method | Route | Description | Auth |
|:---|:---|:---|:---|
| `GET` | `/api/v1/facilities/dormitories` | List dormitories | Authenticated |
| `GET` | `/api/v1/facilities/rooms/:dormId` | List rooms in dormitory | Authenticated |
| `GET` | `/api/v1/facilities/vehicles` | List vehicles | `TenantAdmin` |
| `POST` | `/api/v1/facilities/allocations` | Create allocation | `TenantAdmin` |
| `GET` | `/api/v1/facilities/complaints` | List complaints | `TenantAdmin` |
| `POST` | `/api/v1/facilities/complaints` | File complaint | Authenticated |
| `GET` | `/api/v1/facilities/visitors` | List visitors | `TenantAdmin` |
| `POST` | `/api/v1/facilities/visitors` | Log visitor | Staff |
| `GET` | `/api/v1/facilities/inventory` | List inventory | `TenantAdmin` |

---

## HMAS Agent Registry

| Agent | Type | Capabilities |
|:---|:---|:---|
| `asset_manager` | Task | Inventory management, reorder alerts, maintenance scheduling |
| `transport_coordinator` | Task | Route optimization, allocation, GPS monitoring |
| `hostel_manager` | Task | Room allocation, capacity tracking, billing integration |
| `complaint_handler` | Task | SLA enforcement, escalation, resolution tracking |

---

## Domain Events

| Event | Payload | Consumers |
|:---|:---|:---|
| `facilities.allocation_created` | `{ userId, facilityType, refId }` | Finance (billing), Events (audit) |
| `facilities.complaint_filed` | `{ complaintId, source, type }` | Communication (notification), Events (audit) |
| `facilities.visitor_checked_in` | `{ visitorId, purpose, tenantId }` | Events (audit) |
| `facilities.inventory_low_stock` | `{ itemId, quantity, reorderLevel }` | Communication (procurement alert) |
