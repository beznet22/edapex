# Phase 1 Implementation Prompt: Foundation & Orchestration Backbone

## 🎯 Objective
Deploy the "Pulse" of the EdApex V2 Agentic School. Your goal is to transform Paperclip's (located at `/home/beznet/Workspace/paperclip`) generalized orchestration into a production-grade, edge-native heartbeat and locking system.

## 📜 CORE CONSTRAINTS & TRANSFORMATION POLICY
- **NO COPY-PASTE**: Analyze Paperclip's [heartbeat](/home/beznet/Workspace/paperclip/server/src/services/heartbeat.ts) and [costs](/home/beznet/Workspace/paperclip/server/src/services/costs.ts), then **Reconstruct** them into EdApex-native patterns (`BaseController`, `IRepository<T>`, `Service`).
- **PAPERCLIP FILE NOT FOUND**: If you cannot find a file in Paperclip, search for it or something similar that conforms to the EdApex architecture and specs in the codebase.
- **STRESS AWARENESS**: Review [STRESS_FRAMEWORK.md](../STRESS_FRAMEWORK.md) (Infrastructure Section) before writing logic. You are building for a 3G/Rural environment with 40% packet loss and high-frequency concurrency.
- **TENANT ISOLATION**: Every query must include a `tenant_id` filter.
- **8-LAYER RULES**: All code must reside in the canonical `src/` hierarchy.
- **LOGGING**: Initialize the 8-layer trace log using `logger.child({ layer: '...' })`.
- **LAYER 1 RESILIENCE**: Every defensive tool implemented must have a unit test specifically simulating the stressor it defends against (e.g., duplicate IDs for idempotency).
- **TEST DRIVEN**: The agent MUST run and pass automated testing (unit/integration) before completing this phase.
- **GIT COMMIT**: The agent MUST create a standard git commit with AI attribution before signing out.
- **SCOPE LOCK**: Do NOT modify files or domains outside the explicit scope of this phase.
- **ESCALATION PROTOCOL**: If you encounter missing context, undocumented relations, or ambiguity, DO NOT HALLUCINATE. Pause and request clarification via `notify_user`.
- **STRICT TYPECHECK**: Run `pnpm tsc --noEmit` on all modified files. You must resolve all TypeScript errors before signing out.
- **PERSONA-CENTRIC FLOWS**: Before implementing any domain-specific logic, you MUST update the respective domain documentation (docs/domains/[module].md) with a "Professional Persona Flow" narrative. This narrative must describe how a real-world professional (e.g., IT Director) interacts with the system, using descriptive prose instead of code snippets.
- **EXECUTION PLAN**: Before writing code, you MUST create a localized `docs/plans/phase-1-foundation-plan.md` detailing the precise files you will create/modify.

## 📦 Required Context & Skills
- **Spec**: [AGENTIC_SCHOOL_V2_PLAN.md](../AGENTIC_SCHOOL_V2_PLAN.md) (Sections 2.3, 4, 41-45).
- **Arch**: [MASTER_ARCHITECTURE.md](../MASTER_ARCHITECTURE.md).
- **Stress Framework**: [STRESS_FRAMEWORK.md](../STRESS_FRAMEWORK.md) (Infrastructure Section).
- **Domain Specs** (MANDATORY — read before implementing any domain logic):
  - [finance.md](../domains/finance.md): Ledger entities, operational tools (`generate_fee_assignment`, `calculate_installment_plan`), and stress tools (`fractional_payment_engine`, `currency_stabilizer`).
  - [ai.md](../domains/ai.md): Agent registry, action tracking, tool invocation telemetry, stress tools (`token_budget_enforcer`, `hallucination_circuit_breaker`).
  - [classroom.md](../domains/classroom.md): Session lifecycle, memory ledger, SSE pipeline, stress tools (`edge_latency_compensator`, `memory_ledger_compactor`).
  - [settings.md](../domains/settings.md): Feature flags, config management, stress tools (`config_rollback_guard`).
- **Target Domains**: `Finance` (costs), `AI` (heartbeat & runs), `Classroom` (session lifecycle & SSE).
- **TOOL MANDATE**: Every operational tool and `[STRESS DEFENSE]` tool listed in the referenced domain docs MUST be implemented as Mastra-compatible tool definitions. These are not optional — they are the source of truth.
- **Required Skills**:
  - `backend-dev-guidelines` (BaseController standards)
  - `database-architect` (Drizzle and D1 multi-tenant ledgers)

## 🚀 Tasks

### 1. The Financial Ledger & AI Persistence (Infrastructure)
Implement the `cost_events`, `finance_events`, `ai_sessions`, and `ai_messages` repositories.
- **ai_tasks**: [CONTROL PLANE] Implement Paperclip-grade diagnostics: `usage_json` (Tokens/Cost), `log_ref` (Trace pointer), `error_code`, and `exit_code`. Target the `checkoutTask` atomic acquisition pattern.
- **ai_goals**: [RECURSIVE STRATEGY] Implement the recursive goal hierarchy ( institution, department, agent, task) with `parent_id` support.
- **ai_approvals**: [GOVERNANCE] Implement the approval gate table for multi-tenant oversight.
- **ai_sessions**: [HIGH-FIDELITY] Implement session store with `parent_session_id` (lineage) and `token_stats`.
- **ai_messages**: [HIGH-FIDELITY] Implement trace log with `cache_breakpoint` and `tool_call_id`.
- Ensure multi-tenant safety and fiscal alignment with NERDC standards (Section 21 of the spec).
- Expose the ledger and persistence layers through the `FinanceService` and `AIService`.

### 2. The Routine Engine (Orchestration)
Create `src/services/ai/heartbeat.service.ts` to manage the autonomous agent wakeup cycle.
- **Boot Flags**: Support `MODE=STRESS_LAB` to initialize in restricted, laboratory-only mode.
- **Atomic Checkout**: Use a distributed locking mechanism to ensure only one supervisor handles an `agent_wakeup_request` at a time.
- **[STRESS DEFENSE]** `idempotency_key_generator`: Prevents duplicate account/tenant creation during network retry storms.
- **[STRESS DEFENSE]** `clock_sync_validator`: Detects and prevents temporal state corruption across distributed edge nodes.
- **[STRESS DEFENSE]** `atomic_state_checkpoint`: Captures consistent snapshots of tenant state before high-risk mutations.

### 3. Trace Logging & Hono RPC
- Configure the `src/utils/logger.ts` to support **8-layer namespacing** and a mandatory `run_id` for agentic trace correlation.
- Expose the `Agent Pulse` stream via a Hono RPC endpoint in `src/routes/ai.ts`.

## 🏁 Completion Criteria
- [ ] Generated and followed a localized `docs/plans/phase-1-foundation-plan.md`.
- [ ] 100% Type-Safe completion (no `any`).
- [ ] `pnpm tsc --noEmit` strictly passed with zero errors.
- [ ] Successful Drizzle migration push for finance and AI persistence (`ai_sessions`, `ai_messages`) tables.
- [ ] Classroom SSE endpoint streaming `StatelessEvent` chunks.
- [ ] Atomic session locking verified for classroom runs.
- [ ] Unit tests for `Atomic Checkout` (single-trip SQL) specifically simulating **Concurrent Task Claim** race conditions.
- [ ] Layer 1 Resilience verified for all core infrastructure tools, specifically testing `idempotency_key_generator` against **Network Retry Storms**.
- [ ] All automated tests passed.
- [ ] Code staged and committed with AI attribution.
- [ ] Update `docs/PROJECT_ROADMAP.md` (Phase 1 marked as COMPLETE).

### 4. Edge Middleware & Structural Metadata
- Implement Rate Limiting (50/min human, 1000/min AI) to protect D1 infrastructure from DDoS.
- Introduce `AcademicStructuralMetadata` and `metadata` columns into Academic/PBAC schemas to house structural tags (e.g. UBE vs Paid).
- Introduce `BaseCurrency` and `Locale` to the Tenant Settings schema for explicit i18n support.

### 5. Classroom Session Heartbeat & SSE Foundation
Wire the **Agentic Classroom** (Domain 18) into the Routine Engine and real-time streaming pipeline.
- **Session Lifecycle**: Integrate `ClassroomService` with the Routine Engine for `ON_SESSION_START` / `CLASSROOM_TURN_COMPLETE` triggers, ensuring the same atomic checkout guarantees that protect the HMAS heartbeat loop.
- **SSE Streaming Pipe**: Implement a Hono `/api/classroom/sse` endpoint that streams `StatelessEvent` chunks (interleaved `action` and `text` JSON arrays) generated by the OpenMAIC `createOrchestrationGraph()` LangGraph loop. Chunks must respect the Cloudflare 10ms CPU yield constraint.
- **Memory Buffer Persistence**: On every LangGraph node yield, dehydrate the `StatelessEvent` stream into `classroomMemoryLedger` entries (session_id, turn_count, parsed_content) before releasing the edge CPU slice.
- **Spec Reference**: [AGENTIC_SCHOOL_V2_PLAN.md](../AGENTIC_SCHOOL_V2_PLAN.md) (Sections 6.3, 11.6).
