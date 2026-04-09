# Plan: Event Coordinator & Calendar

**Goal:** Manage school calendar lifecycle and event logistics.

## Proposed Changes

### Ledger
- [ ] **NEW** `src/db/sqlite/events-ledger.ts`: Define `calendar_events` and `event_attendance`.

### Coordination Agent
- [ ] **NEW** `src/services/ai/skills/events/EventCoordinator.ts`: Persona specializing in logistics.
- [ ] **Tools**: `createCalendarEvent`, `checkVenueAvailability`, `sendRSVPRequest`.

## Verification
- [ ] Verify that overlapping events trigger a `CONFLICT` status in the coordinator logic.
- [ ] Confirm events correctly bridge to the Academic domain (e.g., "Parent-Teacher Meeting").
