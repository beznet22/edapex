# Plan: Async Messaging Ledger

**Goal:** Establish a secure, append-only messaging system for schools and communities.

## Proposed Changes

### Data Layer
- [ ] **NEW** `src/db/sqlite/messaging-ledger.ts`: Tables for `channels` (Circles), `messages`, and `message_reactions`.
- [ ] **Logic**: Threaded conversation support and tenant-scoped circles.

### Circle Logic
- [ ] **NEW** `src/services/comm/CircleManager.ts`: Evaluates dynamic membership based on student/parent/course links.

### HMAS Tools
- [ ] **NEW** `src/services/ai/skills/comm/tools.ts`: Tools for `broadcastAnnouncement` and `moderateThread`.

## Verification
- [ ] Verify message thread nesting depth support.
- [ ] Confirm PBAC blocking for unauthorized circle access.
