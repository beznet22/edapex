# Plan: Unified Notification Hub

**Goal:** Implement real-time system alerts via the platform's SSE pipeline.

## Proposed Changes

### Notification Service
- [ ] **NEW** `src/services/comm/NotificationService.ts`: Central registry for system events targeting users or agents.
- [ ] **Emitters**: Map internal event bus signals (e.g., `GRADE_PUBLISHED`) to notification records.

### SSE Bridge
- [ ] **MODIFY** `src/routes/api/orchestrate.ts`: Subscribe to the `NotificationBus` and yield events as `SYSTEM_ALERT` SSE packets.

## Verification
- [ ] Simulate an event and verify the "Agent Pulse" pane receives the SSE payload.
- [ ] Confirm "Persistence" (read/unread status) is tracked in the communication domain.
