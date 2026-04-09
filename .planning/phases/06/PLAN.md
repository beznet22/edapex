# Phase 6: Staff & Operations - Plan

**Objective:** Implement the Staff (HR) and Operations domains, focusing on payroll integrity, attendance tracking, and asset management.

## Acceptance Criteria (UAT)

- [ ] **Payroll Integrity**: Staff ledger events correctly record cent-based transactions for salary disbursements.
- [ ] **Agentic Attendance**: A "check-in" interaction results in a timestamped entry in the HR ledger.
- [ ] **Asset Visibility**: Every inventory item is queryable by its UUID v7; historical ownership is preserved.
- [ ] **Domain Isolation**: Staff salary data is inaccessible to non-HR agents/supervisors.
- [ ] **Service Continuity**: Facility incident tickets correctly lifecycle through "Open > Resolved" states.

## Implementation Steps

### 1. Staff Ledger & HR Core
- **Plan**: `plans/01-staff-core.md`
- **Focus**: Atomic payroll events and attendance tracking.

### 2. Ops & Facilities Tracking
- **Plan**: `plans/02-ops-facilities.md`
- **Focus**: Inventory UUIDs and incident ledger.

### 3. Staff HMAS Specialists
- **Plan**: `plans/03-staff-specialists.md`
- **Focus**: HR vs. Ops manager agent configurations.

---

*Phase: 06-global-manifests*
*Plan created: 2026-04-09*
