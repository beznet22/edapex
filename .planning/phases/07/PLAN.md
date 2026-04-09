# Phase 7: Communication & Community - Plan

**Objective:** Implement the platform's social and notification backbone using an async messaging ledger and normalized event system.

## Acceptance Criteria (UAT)

- [ ] **Async Messaging**: Messages are successfully sent and retrieved via the `messaging` ledger; synchronization is handled by TanStack DB.
- [ ] **Dynamic Circles**: Users can join and see messages in circles defined by their relationship predicates (e.g., "Parent of Student in Class X").
- [ ] **Unified Notifications**: System alerts (e.g., "New Assessment Published") appear in the Agent Pulse pane via SSE events.
- [ ] **Calendar Integrity**: Events recorded in the `events` ledger correctly populate the school calendar view.
- [ ] **Agentic Moderation**: The `PR_Officer` agent can successfully draft broadcasts and moderate potentially unsafe messages.

## Implementation Steps

### 1. Async Messaging Ledger
- **Plan**: `plans/01-messaging-ledger.md`
- **Focus**: Append-only message schema and Circle predicate logic.

### 2. Unified Notification Hub (SSE)
- **Plan**: `plans/02-notification-hub.md`
- **Focus**: Global event bus emitters and SSE broadcasting.

### 3. Event Coordinator & Calendar
- **Plan**: `plans/03-event-coordinator.md`
- **Focus**: Calendar events ledger and coordination agent.

---

*Phase: 07-communication-community*
*Plan created: 2026-04-09*
