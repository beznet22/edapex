# Plan: Ops & Facilities Tracking

**Goal:** Implement physical asset tracking and maintenance workflows.

## Proposed Changes

### Inventory
- [ ] **NEW** `src/db/sqlite/inventory.ts`: Schema for tracking assets with UUID v7.
- [ ] **NEW** `src/db/sqlite/facilities.ts`: Schema for classrooms and facility locations.

### Service Ledger
- [ ] **NEW** `src/services/ops/ServiceManager.ts`: Lifecycle management for maintenance tickets.

### Ops Tools
- [ ] **NEW** `src/services/ai/skills/ops/tools.ts`: Tools for `trackAsset`, `logServiceRequest`, and `updateInventory`.

## Verification
- [ ] Verify UUID v7 uniqueness for assets.
- [ ] Confirm that incident tickets are linked to the correct facility record.
