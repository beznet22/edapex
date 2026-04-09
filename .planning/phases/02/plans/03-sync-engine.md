# Plan: Background Sync Engine

**Goal:** Implement debounced reconciliation between IndexedDB and D1.

## Proposed Changes

### Sync Logic
- [ ] **NEW** `src/services/core/SyncEngine.ts`: Heartbeat listener that monitors `onMutation`.
- [ ] **Batching**: Group changes per tenant and push to `/api/sync` every 5 seconds.
- [ ] **Conflict**: Implement "Last Write Wins" (LWW) based on `updated_at` timestamps.

### API Endpoint
- [ ] **NEW** `src/routes/api/sync.ts`: Hono endpoint to receive and reconcile batches into D1.

## Verification
- [ ] Simulate offline mutation and verify resolution upon "reconnection" (SSE trigger).
