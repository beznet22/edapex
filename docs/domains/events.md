# Events & Audit Domain Architecture

## Overview
The Events domain implements an event-sourcing and audit-logging pattern across the entire platform. It provides an immutable `events` table for domain event capture with a Transactional Outbox pattern for reliable dispatch, and an `auditLog` table for row-level change tracking across all domains.

### Key Business Logic
- **Event Sourcing**: Every significant state mutation (enrollment, payment, attendance) emits a domain event with typed payload.
- **Transactional Outbox**: `deliveryStatus` (`pending` → `dispatched` → `failed`) ensures events are reliably processed by consumers even during network failures.
- **Correlation Tracking**: `correlationId` traces agent workflow chains across multiple domains (e.g., enrollment → fee assignment → notification).
- **Audit Trail**: Row-level change tracking with `oldValues`/`newValues` JSON for forensic analysis and compliance.
- **Optimistic Concurrency**: `version` field on events for conflict detection in distributed systems.

---

## Logic Parity (Legacy to V2)

### Schema Mapping
| Legacy Table (`schoolify`) | V2 Entity (`src/db/domain-events.ts`) | Notes |
| :--- | :--- | :--- |
| `sm_system_logs` | `events` | Event-sourced with typed payloads and outbox pattern. |
| `sm_user_logs` | `auditLog` | Row-level change tracking with actor. |

---

## Technical Implementation

### Core Entities

#### [Events](file:///home/beznet/Workspace/edapex/src/db/sqlite/domain-events.ts#L25)
Immutable domain event store. `eventType` (e.g., `student.enrolled`), `aggregateType` + `aggregateId` for entity tracking. `correlationId` for workflow chaining. `deliveryStatus` for outbox pattern.

#### [AuditLog](file:///home/beznet/Workspace/edapex/src/db/sqlite/domain-events.ts#L51)
Row-level change tracking. `action`: `INSERT`/`UPDATE`/`DELETE`. JSON `oldValues`/`newValues` for forensic diff. `changedBy` tracks the actor.

---

## AI Task Agents & Tools

### Operational Tools (Mastra)
- `events.createEvent(eventData)`: School calendar event initialization.
- `events.sendInvites(eventId, targets)`: Automated invitation dispatch via Communication domain.
- `events.checkVenue(venueId, timeslot)`: Dynamic availability check via Facilities domain.
- `emit_domain_event`: Creates and persists a new domain event with typed payload.
- `dispatch_pending_events`: Processes the outbox queue, dispatching to consumers.
- `query_audit_trail`: Searches audit log by table, record, actor, or date range.
- `generate_compliance_report`: Aggregates audit data into compliance-ready reports.
- `trace_correlation_chain`: Reconstructs the full workflow chain for a given `correlationId`.

### [STRESS DEFENSE] Tools
- `event_replay_engine`: Replays failed events from the outbox with idempotency guarantees.
- `audit_log_integrity_verifier`: Detects and flags audit log tampering attempts.
- `event_storm_throttle`: Detects and rate-limits event storms from runaway agents.
- `dead_letter_queue_handler`: Captures permanently failed events for manual review.

---

## PBAC & Security
- **Events**: Immutable — no UPDATE or DELETE operations.
- **TenantAdmin**: Can query events and audit logs for their tenant.
- **Auditor**: Dedicated role for compliance review access.
- **All Events**: Tenant-scoped via mandatory `tenantId`.

---

## Hono API Routes

| Method | Route | Description | Auth |
|:---|:---|:---|:---|
| `GET` | `/api/v1/events` | Query domain events | `TenantAdmin` |
| `GET` | `/api/v1/events/:correlationId` | Trace workflow chain | `TenantAdmin` |
| `GET` | `/api/v1/audit-log` | Query audit log | `TenantAdmin` |
| `GET` | `/api/v1/audit-log/:table/:recordId` | Get record change history | `TenantAdmin` |

---

## HMAS Agent Registry

| Agent | Type | Capabilities |
|:---|:---|:---|
| `event_dispatcher` | Task | Outbox processing, consumer notification, retry logic |
| `audit_watchdog` | Task | Integrity verification, tamper detection |
| `compliance_reporter` | Task | Report generation, correlation chain analysis |
| `event_planner` | Task | School calendar events, invitations, venue management |

---

## Domain Events

| Event | Payload | Consumers |
|:---|:---|:---|
| `events.dispatch_failed` | `{ eventId, error, retryCount }` | Events (dead letter), Communication (admin alert) |
| `events.audit_tampered` | `{ logId, violationType }` | PBAC (lockout), Communication (security alert) |
| `events.outbox_cleared` | `{ processedCount, failedCount }` | Events (telemetry) |
