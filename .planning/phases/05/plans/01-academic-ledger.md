# Plan: Student Records & Academic Ledger

**Goal:** Establish an immutable audit trail for all student academic transitions.

## Proposed Changes

### Data Layer
- [ ] **NEW** `src/db/sqlite/academic-ledger.ts`: Define `academic_events` table (type, student_id, payload, created_at).
- [ ] **Logic**: Every enrollment, withdrawal, or grade update must be wrapped in a ledger event transaction.

### Enrollment Tools
- [ ] **NEW** `src/services/ai/skills/enrollment/tools.ts`: Toolset for `enrollStudent`, `updateAcademicStatus`, and `generateTranscript`.

## Verification
- [ ] Verify that deleting a student record does not purge their ledger history (tombstone pattern).
- [ ] Manual check of ledger event serialization.
