# Phase 3 Implementation Prompt: Domain Alignment & Anti-Corruption Layer (ACL)

## 🎯 Objective
Transform the business logic from all 18 EdApex domains into native `src/services/` logic. Your goal is to bridge the gap between Paperclip's generalized logic and EdApex's strict `Controller -> Service -> Repository` architecture.

## 📜 CORE CONSTRAINTS & TRANSFORMATION POLICY
- **ANTI-CORRUPTION LAYER (ACL)**: The service layer MUST act as the ACL, mapping specialized domain entities to Mastra tool outputs.
- **NO DUAL-WRITE**: Use polymorphic `owner_type/owner_id` constraints where applicable.
- **EVENT-DRIVEN**: Long-running or side-effect logic must be decoupled via the `Internal Event Bus` (`src/events/`).
- **TEST DRIVEN**: The agent MUST run and pass automated testing (unit/integration) before completing this phase.
- **GIT COMMIT**: The agent MUST create a standard git commit with AI attribution before signing out.
- **SCOPE LOCK**: Do NOT modify files or domains outside the explicit scope of this phase.
- **ESCALATION PROTOCOL**: If you encounter missing context, undocumented relations, or ambiguity, DO NOT HALLUCINATE. Pause and request clarification via `notify_user`.
- **STRICT TYPECHECK**: Run `pnpm tsc --noEmit` on all modified files. You must resolve all TypeScript errors before signing out.
- **EXECUTION PLAN**: Before writing code, you MUST create a localized `docs/plans/phase-3-domain-acl-plan.md` detailing the precise files you will create/modify.

## 📦 Required Context & Skills
- **Spec**: [AGENTIC_SCHOOL_V2_PLAN.md](../AGENTIC_SCHOOL_V2_PLAN.md) (Section 36: Domain Schema Reference).
- **Architecture**: [MASTER_ARCHITECTURE.md](../MASTER_ARCHITECTURE.md).
- **Domain Specs**: Read `docs/domains/*.md` for specific low-level logic (e.g., Standalone Mode in `settings.md`, Stream-Time Evaluation in `pbac.md`, RAG handoffs in `lms.md`).
- **Target Domains**: ALL 18 Domains (including Classroom).
- **Required Skills**:
  - `backend-dev-guidelines` (Zod validations and Service injections)
  - `api-design-principles` (Hono RPC payload resilience)

## 🚀 Tasks

### 1. Domain Service Transformation
Implement the logic for all 18 domains in their respective `src/services/` files (e.g., `AcademicService`, `FinanceService`, `AssessmentService`, `ClassroomService`).
- **Policy**: Review Paperclip logic, discard legacy baggage, and implement as native EdApex Services.
- **Repositories**: All state mutations must use the provided `IRepository<T>` implementations in `src/domain/repositories/`.

### 2. Internal Event Bus Integration
- Register cross-domain event handlers in `src/events/`.
- Example: An `enrollment.complete` event in the Academic domain should trigger an `invoice.generate` event in the Finance domain.

### 3. Zod-Driven Validation
- Ensure all service inputs and outputs are wrapped in **Zod Validators** in `src/validators/`.

## 🏁 Completion Criteria
- [ ] Generated and followed a localized `docs/plans/phase-3-domain-acl-plan.md`.
- [ ] `pnpm tsc --noEmit` strictly passed with zero errors.
- [ ] 18-Domain service coverage (Logic parity with spec).
- [ ] Successful cross-domain event emission and handling.
- [ ] No direct DB calls from Controllers (everything via Services).
- [ ] All automated tests passed.
- [ ] Code staged and committed with AI attribution.
- [ ] Update `docs/PROJECT_ROADMAP.md` (Phase 3 marked as COMPLETE).

### 4. Egress & Binary Delegation
- Construct the  to securely route HTTP requests to third-party providers (Stripe, Termii) via facade tools without exposing raw API keys to LLM environments.
- Wire the Document Domain Service to cleanly map agent `HTMLContent` strings to the `html2pdf` binary execution bridge.

### 5. Classroom Domain Service & SSE Pipeline
Implement the `ClassroomService` in `src/services/classroom.service.ts` as the Anti-Corruption Layer for Domain 18.
- **Atomic Session Checkout**: Implement distributed locking for `classroomSessions` to prevent race conditions when multiple observers join a session simultaneously.
- **OpenMAIC Bridge**: Wire the `createOrchestrationGraph()` LangGraph loop into the service, managing the `DirectorAgent` -> `TeacherAgent` -> `EvaluatorAgent` turn cycle.
- **SSE Chunked Streaming**: The service yields `StatelessEvent` deltas to the Hono `/api/classroom/sse` pipe. `text` chunks stream to the UI chat, `action` chunks trigger tool execution via Mastra.
- **Memory Ledger Persistence**: After each graph node yields, dehydrate parsed content arrays into `classroomMemoryLedger` rows.
- **Whiteboard State Sync**: Buffer `wb_` action payloads from Teacher Agent streams into `classroomWhiteboardState` for device drop/reconnection resilience.
- **Cross-Domain Events**: Register handlers for `ON_SESSION_START`, `CLASSROOM_TURN_COMPLETE`, and `ON_CLASSROOM_ESCALATION` in `src/events/classroom.events.ts`.
- **Standalone Mode**: Respect `Settings.isStandalone()` to decouple Classroom from Academic/HR dependencies in B2C retail deployments.
- **Spec Reference**: [AGENTIC_CLASSROOM_V2_SPEC.md](../AGENTIC_CLASSROOM_V2_SPEC.md) (Sections 2-7) and [AGENTIC_SCHOOL_V2_PLAN.md](../AGENTIC_SCHOOL_V2_PLAN.md) (Sections 7.4, 11.6).
