# Phase 6: Staff & Operations - Context

**Gathered:** 2026-04-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Implement the Staff (HR) and Operations domains. This phase focuses on the administrative backbone of the institution, including staff ledgers (payroll), attendance tracking, and facilities/inventory management.

</domain>

<decisions>
## Implementation Decisions

### Staff & HR
- **D-01: Staff Ledger**: A dedicated atomic ledger for salary and benefits. It follows the cent-based double-entry pattern established in Phase 1 (Finance).
- **D-02: Agentic Attendance**: Attendance is recorded via natural language "check-in" events mediated by the HMAS. Every check-in creates a verifiable event in the `hr` ledger.
- **D-03: PBAC Isolation**: Payroll fields are strictly isolated; only the `hr` supervisor and authorized administrators can access salary data.

### Operations & Facilities
- **D-04: QR-Linked Assets**: Every facility asset (Laptop, Classroom-ID, Material) is assigned a UUID v7, ready for QR-based physical-to-digital linking.
- **D-05: Incident Ticketing**: Operations uses an append-only "Service Ledger" to track maintenance and facility requests.

### HMAS Specialists
- **D-06: Human Resources Agent**: Specializes in payroll math and attendance audit.
- **D-07: Operations Manager Agent**: Specializes in inventory replenishment and facility scheduling.

</decisions>

<canonical_refs>
## Canonical References

### Financial Integrity
- `docs/phases/01/01-CONTEXT.md` — Shared cent-based ledger patterns.

### Operational Blueprints
- `docs/MASTER_ARCHITECTURE.md` §1 — HR & Operations domain boundaries.
- `docs/AGENTIC_SCHOOL_V2_PLAN.md` §11 — Administrative workflows.

</canonical_refs>

<code_context>
## Existing Code Insights

### Ledger Foundation
- `src/db/sqlite/ledger.ts`: Reusable base for the Staff salary ledger.

### Identification
- `src/utils/uuid.ts`: Mandatory use of UUID v7 for all staff and asset identifiers.

</code_context>

<deferred>
## Deferred Ideas

- Biometric hardware integration — Phase 7+.
- Automated procurement (Auto-buy from vendors) — Post-V2 Backlog.

</deferred>

---

*Phase: 06-global-manifests*
*Context gathered: 2026-04-09*
