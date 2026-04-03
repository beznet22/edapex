# Classroom Domain Architecture (Domain 18)

## Overview
The Classroom domain (Domain 18) encapsulates the OpenMAIC-powered Agentic Classroom. It manages real-time, AI-driven teaching sessions where a **Director Agent** orchestrates pedagogical delivery via a LangGraph state machine. This domain is fully isolated from static Academic and LMS tables to prevent high-frequency stateless events from polluting term data.

### Key Business Logic
- **Session Lifecycle**: `scheduled` → `active` → `paused` → `completed`. Sessions are instantiated from Academic routines or standalone LMS courses.
- **Stateless Memory Ledger**: LangGraph state is buffered turn-by-turn in `classroomMemoryLedger`, not persisted in LMS. This prevents stateless execution from corrupting course-level data.
- **Dynamic Participation**: `classroomParticipants` tracks per-session roster with real-time engagement scoring.
- **Whiteboard State**: A dedicated `classroomWhiteboardState` table replays visual actions (`wb_highlight`, `wb_show_image`, `wb_pan`) for late-joining participants.
- **[NEW] Professional Persona Flow (The Teacher)**: Mr. Ade, the Mathematics Teacher, manages the "Linear Equations Live" goal. He triggers the `director_agent` to orchestrate a 40-minute session. When the `engagement_drift_detector` flags a drop in student participation, he uses the `tutor_agent` to inject interactive Q&A. He approves the final session summary via the `aiApprovals` gate, which then triggers the `memory_ledger_compactor` to store the distilled knowledge in the student's LMS profile, visualized via Boneyard-powered skeletons.

---

## Logic Parity (Legacy to V2)

### Schema Mapping
| Legacy Table | V2 Entity (`src/db/domain-classroom.ts`) | Notes |
| :--- | :--- | :--- |
| — (new) | `classroomSessions` | Session lifecycle with Director Agent link and LMS course link. |
| — (new) | `classroomMemoryLedger` | Turn-by-turn LangGraph state buffer. |
| — (new) | `classroomParticipants` | Session roster with engagement scoring. |
| — (new) | `classroomWhiteboardState` | Visual action timeline for whiteboard replay. |
| — (new) | `aiSessions` | [GOVERNANCE] Traceability for teaching and orchestration discussions. |
| — (new) | `aiTasks` | [GOVERNANCE] Atomic state buffering and replay tasks. |
| — (new) | `aiGoals` | [GOVERNANCE] Alignment with institutional pedagogical targets. |
| — (new) | `aiApprovals` | [GOVERNANCE] Senior Faculty sign-off for session summaries and outcomes. |

### Cross-Domain Edges
- **LMS** (`courseId`): Director's pedagogical blueprint.
- **AI** (`directorAgentId`): Orchestration budget and adapters.
- **Core** (`tenantId`, `userId`): Authentication and tenant isolation.
- **Academic** (via routine): Sessions auto-instantiated from `classRoutines`.
- **Attendance**: `classroomParticipants` validation auto-emits `attendance.marked` events.

---

## Technical Implementation

### Core Entities

#### [ClassroomSessions](file:///home/beznet/Workspace/edapex/src/db/sqlite/domain-classroom.ts#L48)
Session lifecycle. Links to `lmsCourses` for content and `aiAgents` for Director orchestration. Supports `standaloneMode` for sessions without Academic routing.

#### [ClassroomMemoryLedger](file:///home/beznet/Workspace/edapex/src/db/sqlite/domain-classroom.ts#L64)
Per-turn state buffer. Each entry has `turnCount`, `role` (`user`/`assistant`/`director_node_log`), and JSON `parsedContent` array of action/text parts.

#### [ClassroomParticipants](file:///home/beznet/Workspace/edapex/src/db/sqlite/domain-classroom.ts#L79)
Session roster. `role`: `student` or `human_observer`. `engagementScore` tracks real-time participation quality.

#### [ClassroomWhiteboardState](file:///home/beznet/Workspace/edapex/src/db/sqlite/domain-classroom.ts#L95)
Timeline of whiteboard actions for replay and late-join catch-up.

---

## AI Task Agents & Tools

### Operational Tools (Mastra)
- `classroom.startSession(routineId)`: High-fidelity initialization with LangGraph context.
- `classroom.evaluateEngagement(studentId)`: Real-time passive grading and participation tracking.
- `classroom.generateSummary(sessionId)`: Turn-by-turn condensation and knowledge capture.
- `wb_show_image(url)`: Visual asset injection into the live whiteboard array.
- `wb_highlight(coords)`: Real-time focus targeting for students.
- `wb_pan(coords)`: Synchronized viewport movement for all participants.
- `instantiate_session`: Creates a classroom session from an Academic routine or LMS course.
- `emit_whiteboard_action`: Appends a whiteboard action to the timeline.

### [STRESS DEFENSE] Tools
- `edge_latency_compensator`: Handles sub-100ms SSE delivery requirements on edge nodes.
- `token_budget_enforcer`: Prevents runaway Director token consumption per session.
- `memory_ledger_compactor`: Auto-summarizes old turns to prevent memory bloat.
- `engagement_drift_detector`: Flags sessions with declining engagement for human intervention.
- `whiteboard_replay_integrity`: Ensures timeline consistency for late-joiners.

---

## PBAC & Security
- **TenantAdmin**: Can create/manage sessions and view all participation data.
- **Teacher**: Can start/manage sessions for their assigned classes.
- **Student**: Can join sessions they're enrolled in. Read-only for engagement data.
- **Observer**: Read-only access to live sessions for evaluation purposes.

---

## Hono API Routes

| Method | Route | Description | Auth |
|:---|:---|:---|:---|
| `GET` | `/api/v1/classroom/sessions` | List sessions | Teacher+ |
| `POST` | `/api/v1/classroom/sessions` | Create session | Teacher+ |
| `GET` | `/api/v1/classroom/sessions/:id` | Get session details | Participant |
| `GET` | `/api/v1/classroom/sessions/:id/memory` | Get memory ledger | Teacher+ |
| `GET` | `/api/v1/classroom/sessions/:id/participants` | Get participants | Teacher+ |
| `GET` | `/api/v1/classroom/sessions/:id/whiteboard` | Get whiteboard state | Participant |
| `WS` | `/api/v1/classroom/sessions/:id/live` | SSE/WebSocket live stream | Participant |

---

## HMAS Agent Registry

| Agent | Type | Capabilities |
|:---|:---|:---|
| Agent | Type | Capabilities | Link |
|:---|:---|:---|:---|
| `director_agent` | Supervisor | Session orchestration, pedagogical flow | [SOUL.md](../strategy/SOUL.md) |
| `tutor_agent` | Task | Real-time Q&A, adaptive explanation | [SOUL.md](../strategy/SOUL.md) |
| `evaluator_agent` | Task | In-session assessment, grading | [SOUL.md](../strategy/SOUL.md) |
| `whiteboard_agent` | Task | Visual content delivery, timeline | [SOUL.md](../strategy/SOUL.md) |

---

## Domain Events

| Event | Payload | Consumers |
|:---|:---|:---|
| `classroom.session_started` | `{ sessionId, courseId, tenantId }` | Attendance (auto-mark), Events (audit) |
| `classroom.session_ended` | `{ sessionId, turnCount, participantCount }` | LMS (progress update), Events (audit) |
| `classroom.engagement_alert` | `{ sessionId, userId, score }` | Communication (teacher alert) |
| `classroom.memory_compacted` | `{ sessionId, originalTurns, compactedTurns }` | Events (audit) |

---

## UI Documentation (Boneyard)
- **Agentic Classroom Live**: The session viewport MUST implement `boneyard-js` skeletons for sub-100ms turn-by-turn state updates.
- **Interactive Whiteboard**: The visual action layer must utilize "Refraction-Pro" glassmorphism overlays for non-intrusive focus targeting.
