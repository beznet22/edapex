# Phase 3 Implementation Prompt: Domain Alignment & Anti-Corruption Layer (ACL)

## 🎯 Objective
Transform the business logic from all 18 EdApex domains into native `src/services/` logic. Your goal is to bridge the gap between Paperclip's (located at `/home/beznet/Workspace/paperclip`) generalized logic and EdApex's strict `Controller -> Service -> Repository` architecture through a systematic **Verify, Align, and Enhance** audit of all domain services.

## 📜 CORE CONSTRAINTS & TRANSFORMATION POLICY
- **IDEMPOTENT VERIFICATION & DISCOVERY LOOP**: This prompt is designed for continuous refinement. Every execution MUST:
    1. **Exhaustive Discovery**: Systematically crawl the Paperclip codebase (located at `/home/beznet/Workspace/paperclip`), starting with [server/src/services/](/home/beznet/Workspace/paperclip/server/src/services/), to identify the business logic for all 18 domains. Use Paperclip schemas (e.g., [finance_events.ts](/home/beznet/Workspace/paperclip/packages/db/src/schema/finance_events.ts)) as structural **suggestions**, but do not limit your audit to them.
    2. **Audit**: Compare the discovered Paperclip logic against existing EdApex Domain Services (e.g., `FinanceService`, `AcademicService`).
    3. **Align & Enhance**: Refine the Anti-Corruption Layer (ACL) mapping to ensure zero legacy logic leaks into the V2 architecture.
- **ATOMIC PROGRESS LOGGING**: Your execution plan (e.g., `docs/plans/phase-3-domain-acl-plan.md`) MUST include a granular `Unit Tasks` checklist. You MUST update this checklist as you complete each task. This ensures the next agent can seamlessly resume work by referencing `docs/PROJECT_ROADMAP.md` and your plan's progress state.
- **NO COPY-PASTE**: Reconstruct Paperclip's logic into EdApex-native patterns (`BaseController`, `IRepository<T>`, `Service`).
- **HIGH-FIDELITY REFERENCES**:
    - **Financial Ledger**: [finance_events.ts](/home/beznet/Workspace/paperclip/packages/db/src/schema/finance_events.ts)
    - **Work Products**: [issue_work_products.ts](/home/beznet/Workspace/paperclip/packages/db/src/schema/issue_work_products.ts)
    - **Logic Counterparts**: [server/src/services/](/home/beznet/Workspace/paperclip/server/src/services/)
- **ANTI-CORRUPTION LAYER (ACL)**: The service layer MUST act as the ACL, mapping specialized domain entities to Mastra tool outputs.
- **TENANT ISOLATION**: Every query must include a `tenant_id` filter.
- **PERSONA-CENTRIC FLOWS**: Before implementing service logic, update [docs/domains/](../domains/) documentation with a "Professional Persona Flow" narrative.
- **EXECUTION PLAN**: Create `docs/plans/phase-3-domain-acl-plan.md` before writing code.

## 📦 Required Context & Skills
- **Spec**: [AGENTIC_SCHOOL_V2_PLAN.md](../AGENTIC_SCHOOL_V2_PLAN.md) (Section 35: 18-Domain Drizzle Schema Reference).
- **Architecture**: [MASTER_ARCHITECTURE.md](../MASTER_ARCHITECTURE.md).
- **Stress Framework**: [STRESS_FRAMEWORK.md](../STRESS_FRAMEWORK.md) (ALL stressor categories).
- **Domain Specs** (MANDATORY — these are the SOURCE OF TRUTH for service implementation):
  - Each domain doc (`docs/domains/*.md`) defines:
    - **Schema Mapping**: Legacy → V2 entity mapping with code links.
    - **Entity Descriptions**: Detailed field-level documentation.
    - **API Routes Table**: Exact REST endpoints that the Service must expose via Hono.
    - **AI Task Agents & Tools**: ALL operational + `[STRESS DEFENSE]` tools that the Service must implement.
    - **Domain Events**: Events emitted/consumed for cross-domain integration.
  - Read ALL 18 domain docs before implementation:
    [core.md](../domains/core.md) | [academic.md](../domains/academic.md) | [assessment.md](../domains/assessment.md) | [attendance.md](../domains/attendance.md) | [finance.md](../domains/finance.md) | [lms.md](../domains/lms.md) | [hr.md](../domains/hr.md) | [facilities.md](../domains/facilities.md) | [ai.md](../domains/ai.md) | [classroom.md](../domains/classroom.md) | [homeschooling.md](../domains/homeschooling.md) | [library.md](../domains/library.md) | [pbac.md](../domains/pbac.md) | [communication.md](../domains/communication.md) | [events.md](../domains/events.md) | [settings.md](../domains/settings.md) | [cms.md](../domains/cms.md) | [documents.md](../domains/documents.md)
- **TOOL MANDATE**: ALL operational tools AND `[STRESS DEFENSE]` tools listed in each domain doc's "AI Task Agents & Tools" section MUST be implemented. These are not exhaustive — add additional tools as domain logic demands.
- **API ROUTE MANDATE**: ALL routes listed in each domain doc's "Hono API Routes" table MUST be implemented. The domain doc is the canonical source.
- **EVENT MANDATE**: ALL domain events listed in each domain doc MUST be registered in `src/events/` with proper cross-domain consumer wiring.
- **Target Domains**: ALL 18 Domains (including Classroom).
- **Required Skills**:
  - `backend-dev-guidelines` (Zod validations and Service injections)
  - `api-design-principles` (Hono RPC payload resilience)

## 🚀 Tasks

### 1. Domain Service Transformation
Implement the logic for all 18 domains in their respective `src/services/` files (e.g., `AcademicService`, `FinanceService`, `AssessmentService`, `ClassroomService`).
- **Policy**: Review logic in `/home/beznet/Workspace/paperclip/server/src/services/`, discard legacy baggage, and implement as native EdApex Services.
- **Repositories**: All state mutations must use the provided `IRepository<T>` implementations in `src/domain/repositories/`.
- **Cost Reporting**: Every AI-driven tool execution within a service MUST call `reportCost` with token/cent telemetry (using `aiCostEvents`).
- **Task-Goal Linkage**: Domain services must ensure all spawned `aiTasks` are linked to an active `aiGoal` to maintain the strategic execution trace.

### 2. Internal Event Bus & Memory Mirroring
- Register cross-domain event handlers in `src/events/`.
- **Memory Provider Sync**: Implement the `PROVIDER_SYNC` event. Every write to the `ai_memories` repository MUST emit this event.
- **Async Mirroring**: Update the `AIService` to consume this event and mirror the memory to external providers (Mem0/Honcho/OpenViking) using **Cloudflare Queues** for performance isolation and retry-resilience (Section 44).
- Example: An `enrollment.complete` event in the Academic domain should trigger an `invoice.generate` event in the Finance domain.

### 3. Zod-Driven Validation & Error Propagation
- Ensure all service inputs and outputs are wrapped in **Zod Validators** in `src/validators/`.
- Implement specialized `DomainError` and `ValidationError` types for all 18 domains, ensuring they are caught by the `BaseController` and mapped to Hono RPC envelopes.

## 🏁 Completion Criteria
- [ ] Generated and followed a localized `docs/plans/phase-3-domain-acl-plan.md`.
- [ ] `pnpm tsc --noEmit` strictly passed with zero errors.
- [ ] 18-Domain service coverage (Logic parity with spec).
- [ ] Successful cross-domain event emission and handling.
- [ ] No direct DB calls from Controllers (everything via Services).
- [ ] Layer 1 Resilience verified for all domain-specific defensive tools, specifically testing the **Binary Delegation Bridge** for heavy Document transformations.
- [ ] Verified that all AI tool executions report telemetry to `aiCostEvents` for financial circuit-breaking.
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
- **Spec Reference**: [AGENTIC_SCHOOL_V2_PLAN.md](../AGENTIC_SCHOOL_V2_PLAN.md) (Section 5.4, 19.5).
