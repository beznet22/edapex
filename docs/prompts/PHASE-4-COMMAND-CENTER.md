# Phase 4 Implementation Prompt: Command Center UI (TanStack Start)

## 🎯 Objective
Build the **Command Center**—the stunning, keyboard-driven UI for the Agentic School. Your goal is to implement the local-first, AI-native SPA using **TanStack Start**, **Tailwind CSS v4**, and **AI-Elements**.

## 📜 CORE CONSTRAINTS & TRANSFORMATION POLICY
- **LOCAL-FIRST**: Use **TanStack DB (IndexedDB)** as the primary source of truth for the client.
- **UI RESILIENCE**: Implement `network_degradation_fallback` for SSE streams. If latentcy exceeds 500ms, the UI must gracefully switch to a "Low-Bandwidth" polling or offline mode.
- **HONO RPC**: All backend interaction must use the type-safe Hono `hc` client.
- **GLASSMORPHISM**: Adhere to the "Refraction-Pro" design token.
- **STRESS TELEMETRY**: The UI MUST expose a "Stress Status" visualizer in the property panel, showing agent confidence, token drift, and network health.
- **TEST DRIVEN**: The agent MUST run and pass automated testing (unit/integration) before completing this phase.
- **GIT COMMIT**: The agent MUST create a standard git commit with AI attribution before signing out.
- **SCOPE LOCK**: Do NOT modify files or domains outside the explicit scope of this phase.
- **ESCALATION PROTOCOL**: If you encounter missing context, undocumented relations, or ambiguity, DO NOT HALLUCINATE. Pause and request clarification via `notify_user`.
- **STRICT TYPECHECK**: Run `pnpm tsc --noEmit` on all modified files. You must resolve all TypeScript errors before signing out.
- **PERSONA-CENTRIC UX**: Every UI view implemented must have a corresponding "Professional Persona UX Flow" in the domain documentation. This describes the keyboard-driven, local-first experience from the perspective of the professional user (e.g. Bursar checking for payment anomalies).
- **EXECUTION PLAN**: Before writing code, you MUST create a localized `docs/plans/phase-4-command-center-plan.md` detailing the precise files you will create/modify.

## 📦 Required Context & Skills
- **Spec**: [AGENTIC_SCHOOL_V2_PLAN.md](../AGENTIC_SCHOOL_V2_PLAN.md) (Section 34, Section 3).
- **Stress Framework**: [STRESS_FRAMEWORK.md](../STRESS_FRAMEWORK.md).
- **Domain Specs** (MANDATORY — read for API routes, events, and stress tools relevant to UI):
  - [classroom.md](../domains/classroom.md): Session lifecycle, SSE endpoints, whiteboard actions, memory ledger, domain events.
  - [lms.md](../domains/lms.md): Course hierarchy, enrollment, progress tracking, API routes.
  - [ai.md](../domains/ai.md): Chat infrastructure, agent actions, tool invocations.
  - [finance.md](../domains/finance.md): Ledger, fee status, payment UI.
  - [communication.md](../domains/communication.md): Notification inbox, broadcast, delivery tracking.
  - [settings.md](../domains/settings.md): Feature flags for domain module enablement.
- **UI INTEGRATION**: The API routes tables in each domain doc define the exact backend contracts the UI must consume via Hono `hc` client.
- **STRESS TELEMETRY**: The "AI Task Agents & Tools" sections list stress defense tools whose status must be surfaced in the Stress Status Visualizer panel.
- **UI Spec**: `ui-ux-pro-max` (For Shadcn/Tailwind v4 Glassmorphism).
- **Required Skills**:
  - `ui-ux-pro-max` (Glassmorphism design tokens)
  - `tanstack-start-best-practices` & `tanstack-router-best-practices`
  - `tanstack-react-db` & `tanstack-db-core` (Local-First IndexedDB state engine)
  - `ai-elements` (Chat component deployment)

## 🚀 Tasks

### 1. The Three-Pane Shell
Implement the responsive layout in the TanStack Start root.
- **Left Panel**: Navigation (Inbox, Domains, Logs).
- **Center Panel**: The Viewport (Chat, Artifact Viewer, Table Views).
- **Right Panel**: The Property Panel (Agent Pulse, Artifact Audit, **Stress Status Visualizer**, **Financial Attribution Monitor**).
- **Skeleton Screens (Boneyard)**: Implement `boneyard-js` skeleton screens for all three panes (Navigation, Viewport, and Property Panel) to ensure pixel-perfect loading states.
- **Financial Attribution Monitor**: Real-time display of `cents` and `tokens` consumed per session/task (using `aiCostEvents`).
- **Workflow Status Monitor**: Visual tree of recursive `aiGoals` and their child `aiTasks` with live status updates (using `checkoutTask` telemetry).

### 2. Local-First Synchronization & Offline Mode
Implement the reconciliation logic between **TanStack DB** and **Cloudflare D1**.
- **[STRESS DEFENSE]** `offline_classroom_mode`: Allow students to continue session progress during total network outages, with background sync upon restoration.
- Handle conflict resolution using domain-specific merging logic.

### 3. AI-Elements, WorkProduct & Notification Components
- Integrate the AI-Elements chat interface into the Center Panel.
- **Context References (@)**: Implement the `@-syntax` parser (`@file`, `@folder`, `@url`) in the Orchestrator with **70/20 Head-Tail Truncation** (exceeding 20k chars).
- **AI Gateway**: Expose the Orchestrator as an OpenAI-compatible endpoint (`/api/v1/chat/completions`) for third-party interoperability.
- **Boundary-Aware Compression**: [HIGH-FIDELITY] Implement the dual-stage context compression (85% hygiene / 50% summarization) with walk-back realignment to never split tool call pairs.
- **Session Lineage Visualizer**: Implement a recursive tree view in the Property Panel to visualize session lineage (`parent_session_id`), allowing operators to trace sub-agent spawns and goal decomposition flows.
- Implement **WorkProduct Thumbnails** with interactive "Preview" and "Audit" actions (Section 19.4 of the spec).
- **Notification System**: Integrate Sonner/Shadcn for immediate human feedback and "Agent Pulse Toasts" in the Property Panel (Right Pane) for granular agent heartbeats.

## 🏁 Completion Criteria
- [ ] Generated and followed a localized `docs/plans/phase-4-command-center-plan.md`.
- [ ] `pnpm tsc --noEmit` strictly passed with zero errors.
- [ ] Full 3-pane layout implementation (Tailwind CSS v4).
- [ ] Verified local-first sync between IndexedDB and D1/SQLite.
- [ ] Stunning aesthetics (Glassmorphism & Micro-animations) with pixel-perfect **Boneyard Skeleton** screens verified across all three panes.
- [ ] **Stress Status Visualizer** active, reporting context compression status (Hermes-grade) and agent confidence.
- [ ] All automated tests passed.
- [ ] Code staged and committed with AI attribution.
- [ ] Update `docs/PROJECT_ROADMAP.md` (Phase 4 marked as COMPLETE).

### 4. Real-Time Telemetry & Resiliency
- Implement unidirectional edge streams utilizing standard Server-Sent Events (SSE) for sub-150ms "Agent Pulse Toasts".
- Enforce "Snapshot Hydration Flow", completely restoring the Local-First IndexedDB from D1 Point-in-Time Recoveries upon empty cache startup states.

### 5. Agentic Classroom UI (OpenMAIC Web Views)
Build the live classroom experience as a dedicated TanStack Start route, leveraging `ai-elements` to render incoming `StatelessEvent` streams.
- **Student Immersive Interface**: Subscribe to the `/api/classroom/sse` stream. Parse interleaved JSON arrays: `action` items render as inline tool widgets (pop quiz overlays, "Thinking" indicators), while `text` items type natively into the `ai-elements` chat component.
- **Pulse Whiteboard Pipeline**: Render a synchronized SVG whiteboard driven by the Teacher Agent's `wb_highlight`, `wb_show_image`, `wb_pan` actions. Whiteboard drawing must animate in sync with the typing speed of the `text` stream chunks. Use `classroomWhiteboardState` as the document of record for device drop/reconnection.
- **Teacher & Admin Escalate View (Command Center)**: Implement a 3-pane live supervision layout:
  - **Left Pane**: Graph Pipeline Logs (Director Node decisions, Teacher Node stream events, Evaluator RAG operations).
  - **Center Pane**: Shadow Whiteboard (real-time mirror of the student-facing canvas).
  - **Right Pane**: Intervention Chat Stream with a `[TAKE OVER]` button that pushes a `type: "escalation"` event into the `classroomMemoryLedger`, halting the LangGraph loop and transferring control to the human instructor.
- **Spec Reference**: [AGENTIC_SCHOOL_V2_PLAN.md](../AGENTIC_SCHOOL_V2_PLAN.md) (Section 5.4, 19.5).
