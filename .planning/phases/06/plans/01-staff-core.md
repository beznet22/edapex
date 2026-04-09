# Plan: Staff Ledger & HR Core

**Goal:** Establish the financial and administrative backbone for institution staff.

## Proposed Changes

### Data Layer
- [ ] **NEW** `src/db/sqlite/staff-ledger.ts`: Tables for `staff_profiles` and `staff_events` (Payroll/Attendance).
- [ ] **Logic**: Multi-tenant isolation for all staff data.

### HR Tools
- [ ] **NEW** `src/services/ai/skills/hr/tools.ts`: Tools for `checkInStaff`, `processPayrollEntry`, and `updateBenefits`.

## Verification
- [ ] Simulate staff check-in and verify ledger entry.
- [ ] Confirm salary calculations use the cent-based math utilities.
