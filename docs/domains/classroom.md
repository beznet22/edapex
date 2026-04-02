# Classroom Domain Architecture

## 🎯 Domain Overview
The Classroom domain (Domain 18) encapsulates the **Agentic Classroom** — an autonomous, AI-driven instructional environment powered by OpenMAIC's stateless LangGraph orchestration. It provides real-time multi-agent collaboration via SSE streaming, maintaining strict isolation from the static Course (LMS), Academic, and AI telemetry domains.

## 🏛️ Architectural Evolution

### Greenfield Domain (No Legacy Mapping)
| Feature | V2 Implementation |
| :--- | :--- |
| **Session Lifecycle** | `classroomSessions` (scheduled → active → paused → completed) |
| **LangGraph Memory** | `classroomMemoryLedger` (interleaved action/text JSON arrays) |
| **Roster & Engagement** | `classroomParticipants` (dynamic engagement scoring) |
| **Whiteboard State** | `classroomWhiteboardState` (wb_ action timeline replica) |

### Schema Design
V2 introduces 4 dedicated tables to prevent high-frequency LangGraph events from bleeding into static LMS or Academic schemas.

- **Session State Machine**: `classroomSessions.status` tracks the full lifecycle with atomic checkout locking to prevent race conditions from concurrent observers.
- **Memory Ledger**: Replaces `domain-ai`'s generic chat tables with native support for OpenMAIC's interleaved `action`/`text` arrays. Each entry maps `turnCount` to flattened `parsedContent` JSON.
- **Engagement Scoring**: `classroomParticipants.engagementScore` is dynamically updated by Evaluator Agents based on response quality and participation frequency.
- **Whiteboard Resilience**: `classroomWhiteboardState.timeline` stores the complete `wb_` action history as a JSONB timeline, enabling device drop/reconnection without state loss.

### Cross-Domain Edges
| Domain | Foreign Key | Purpose |
| :--- | :--- | :--- |
| **LMS** | `classroomSessions.courseId → lmsCourses.id` | Director Agent's pedagogical blueprint |
| **AI** | `classroomSessions.directorAgentId → aiAgents.id` | Orchestration budget and adapters |
| **Core** | `classroomSessions.tenantId → tenants.id` | Multi-tenant isolation |
| **Core** | `classroomParticipants.userId → users.id` | Participant identity |

## 🤖 AI & Automation Layer

### OpenMAIC LangGraph State Machine
The Agentic Classroom operates via a `StateGraph` (`director-graph.ts`) with three specialized agent nodes:

| Agent | Role | Tools |
| :--- | :--- | :--- |
| **Director Agent** | Graph traffic controller; routes turns | `stream_event`, `assign_turn`, `end_session` |
| **Teacher Agent** | Pedagogical content delivery | `wb_highlight`, `wb_show_image`, `wb_pan`, `wb_spotlight` |
| **Evaluator Agent** | Passive grading & RAG compaction | `eval_turn`, `compress_memory`, `generate_grading_report` |

### Execution Flow
1. **Trigger**: CRON `ON_SESSION_START` or student chat message.
2. **Atomic Checkout**: `ClassroomService` locks the session to block concurrent runs.
3. **LangGraph Loop**: Director picks the next agent → Agent yields interleaved JSON over Hono SSE → State dehydrated to `classroomMemoryLedger` per node tick.
4. **Artifact & Emit**: Lock released. Evaluator may generate `WorkProduct` payloads. `CLASSROOM_TURN_COMPLETE` event fires.

### Standalone Mode
When `Settings.isStandalone() == true`, the Classroom decouples from Academic/HR dependencies and operates linked only to `domain-lms` (content) and `domain-core` (tenancy), enabling B2C retail scaling with Stripe billing.

## 🔒 Security & Performance
- **PBAC Enforcement**: All tool executions within the SSE stream are intercepted by a partial-JSON PBAC validator that regex-matches `action` elements before Mastra tool invocation.
- **Stream-Time 403**: Unauthorized tool payloads yield inline `403` signals without terminating the SSE connection.
- **Indexing Strategy**:
  - `cls_session_tenant_status_idx`: Session lookups by tenant and status.
  - `cls_memory_session_turn_idx`: Fast turn-ordered memory hydration.
  - `cls_part_session_user_idx`: Participant presence checks.
- **Edge Safety**: Director Graph yields after every major node execution to respect the Cloudflare 10ms CPU limit.

---

## Hono API Routes

```
Routes → ClassroomController → ClassroomService → ClassroomRepository
```

| Method | Route | Description | Auth |
|:---|:---|:---|:---|
| `POST` | `/api/v1/classroom/sessions` | Create session | Teacher+ |
| `GET` | `/api/v1/classroom/sessions/:id` | Get session details | Participant |
| `PATCH` | `/api/v1/classroom/sessions/:id/status` | Update session status | Teacher+ |
| `GET` | `/api/v1/classroom/sse` | SSE stream (StatelessEvent) | Participant |
| `POST` | `/api/v1/classroom/sessions/:id/chat` | Student chat input | Student |
| `POST` | `/api/v1/classroom/sessions/:id/escalate` | Human takeover | Teacher+ |
| `GET` | `/api/v1/classroom/sessions/:id/whiteboard` | Whiteboard state | Participant |
| `GET` | `/api/v1/classroom/sessions/:id/participants` | Session roster | Teacher+ |

---

## HMAS Agent Registry

| Agent | Type | Capabilities |
|:---|:---|:---|
| `director_agent` | Supervisor | LangGraph traffic control, turn assignment, session lifecycle |
| `teacher_agent` | Task | Lesson delivery, whiteboard orchestration, SSE content streaming |
| `evaluator_agent` | Task | Passive grading, RAG token compaction, engagement scoring |

---

## Domain Events

| Event | Payload | Consumers |
|:---|:---|:---|
| `ON_SESSION_START` | `{ sessionId, tenantId, courseId }` | Classroom (LangGraph init), Events (audit) |
| `CLASSROOM_TURN_COMPLETE` | `{ sessionId, turnCount, agentRole }` | Evaluator (memory compaction), Events (audit) |
| `ON_CLASSROOM_ESCALATION` | `{ sessionId, userId, reason }` | HR (staff notification), Events (audit), Command Center (alert) |
| `classroom.engagement_updated` | `{ sessionId, userId, score }` | Analytics (reporting), Events (audit) |
