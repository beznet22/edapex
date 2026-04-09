# Phase 7: Communication & Community - Context

**Gathered:** 2026-04-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Implement the Communication and Events domains. This phase delivers the platform's social and notification backbone, including an async messaging ledger, unified SSE-based notification hub, and dynamic community circles (Parent/Teacher/Student).

</domain>

<decisions>
## Implementation Decisions

### Messaging & Circles
- **D-01: Async Message Ledger**: Messaging follows an append-only ledger pattern. State is synchronized via TanStack DB (Phase 2), eliminating the need for persistent WebSocket connections in V2.
- **D-02: Predictate-Based Circles**: Community channels (e.g., `#grade-4-parents`) are dynamic groups defined by PBAC membership predicates (Student-Parent-Course relationships).
- **D-03: Threaded Conversations**: Messages support recursive threading similar to the AI Memory Ledger (Phase 3).

### Notifications & Calendar
- **D-04: SSE Notification Hub**: All real-time alerts are pushed via the `/api/orchestrate/heartbeat` SSE pipeline and displayed in the "Agent Pulse" pane or as global Toasts.
- **D-05: Event Ledger**: School events (Graduations, Meetings) are stored in the `events` ledger and trigger "Wakeup" signals for the `EventCoordinator` agent.

### HMAS Specialists
- **D-06: PR Officer Agent**: Specialized in drafting broad newsletters and moderating community chat for safety/tone.
- **D-07: Event Coordinator Agent**: Specialized in scheduling logic, invite management, and venue conflict resolution.

</decisions>

<canonical_refs>
## Canonical References

### Real-Time Infrastructure
- `docs/phases/04/04-CONTEXT.md` — SSE Telemetry and Toast handling standards.
- `docs/AGENTIC_SCHOOL_V2_PLAN.md` §18 — SSE Pipeline specification.

### Structural Logic
- `docs/MASTER_ARCHITECTURE.md` §1 — Communication vs. Events domain mapping.
- `docs/AGENTIC_SCHOOL_V2_PLAN.md` §40 — Notification system (Toasts & Push).

</canonical_refs>

<code_context>
## Existing Code Insights

### SSE Engine
- `src/routes/api/orchestrate.ts`: (To be extended) The primary SSE event source.

### Domain Schema
- `src/db/sqlite/domain-communication.ts`: Schema for messages and channels.
- `src/db/sqlite/domain-events.ts`: Schema for calendar entries and attendance links.

</code_context>

<deferred>
## Deferred Ideas

- Native Mobile Push (FCM/APNS) — Phase 8+.
- Real-time Video Conferencing (WebRTC) — Post-V2 Backlog.

</deferred>

---

*Phase: 07-communication-community*
*Context gathered: 2026-04-09*
