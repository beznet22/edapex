# Plan: Real-time Telemetry Pane

**Goal:** Provide full observability into agent actions and spend.

## Proposed Changes

### SSE Pipeline
- [ ] **NEW** `src/hooks/useHeartbeat.ts`: Hook to subscribe to `/api/orchestrate/heartbeat`.
- [ ] **Logic**: Filter events to aggregated (per-thought) cycle.

### Display
- [ ] **NEW** `src/components/telemetry/PulseColumn.tsx`: The right-hand panel showing the heartbeat stream.
- [ ] **NEW** `src/components/telemetry/AtomicLog.tsx`: Real-time cent-spend logger.

## Verification
- [ ] Mock SSE stream and verify "Pulse" heartbeats animate correctly.
- [ ] Confirm Atomic Checkout values update in real-time.
