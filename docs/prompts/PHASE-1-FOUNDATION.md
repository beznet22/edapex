# Phase 1 Implementation Prompt: Foundation & Orchestration Backbone

## 🎯 Objective
Deploy the "Pulse" of the EdApex V2 Agentic School. Your goal is to transform Paperclip's generalized orchestration into a production-grade, edge-native heartbeat and locking system.

## 📜 CORE CONSTRAINTS & TRANSFORMATION POLICY
- **NO COPY-PASTE**: Analyze Paperclip's `paperclip/server/src/core/heartbeat.ts` and `costs.ts`, then **Reconstruct** them into EdApex-native patterns (`BaseController`, `IRepository<T>`, `Service`).
- **TENANT ISOLATION**: Every query must include a `tenant_id` filter (using Drizzle's `all()` or `execute()`).
- **8-LAYER RULES**: All code must reside in the canonical `src/` hierarchy.
- **LOGGING**: Initialize the 8-layer trace log using `logger.child({ layer: '...' })`.
- **TEST DRIVEN**: The agent MUST run and pass automated testing (unit/integration) before completing this phase.
- **GIT COMMIT**: The agent MUST create a standard git commit with AI attribution before signing out.
- **SCOPE LOCK**: Do NOT modify files or domains outside the explicit scope of this phase.
- **ESCALATION PROTOCOL**: If you encounter missing context, undocumented relations, or ambiguity, DO NOT HALLUCINATE. Pause and request clarification via `notify_user`.
- **STRICT TYPECHECK**: Run `pnpm tsc --noEmit` on all modified files. You must resolve all TypeScript errors before signing out.
- **EXECUTION PLAN**: Before writing code, you MUST create a localized `docs/plans/phase-1-foundation-plan.md` detailing the precise files you will create/modify.

## 📦 Required Context & Skills
- **Spec**: [AGENTIC_SCHOOL_V2_PLAN.md](../AGENTIC_SCHOOL_V2_PLAN.md) (Sections 2.3, 4, 41-44).
- **Arch**: [MASTER_ARCHITECTURE.md](../MASTER_ARCHITECTURE.md).
- **Target Domains**: `Finance` (costs), `AI` (heartbeat & runs).
- **Required Skills**:
  - `backend-dev-guidelines` (BaseController standards)
  - `database-architect` (Drizzle and D1 multi-tenant ledgers)

## 🚀 Tasks

### 1. The Financial Ledger (Infrastructure)
Implement the `cost_events` and `finance_events` repositories in `src/domain/repositories/finance.repository.ts`.
- Ensure multi-tenant safety and fiscal alignment with NERDC standards (Section 21 of the spec).
- Expose the ledger through the `FinanceService`.

### 2. The Routine Engine (Orchestration)
Create `src/services/ai/heartbeat.service.ts` to manage the autonomous agent wakeup cycle.
- **Atomic Checkout**: Use a distributed locking mechanism (Cloudflare KV or a DB lock table) to ensure only one supervisor handles an `agent_wakeup_request` at a time.
- **Heartbeat Loop**: Implement the 5-phase execution lifecycle (Trigger -> Validation -> Checkout -> Execution -> Artifact).

### 3. Trace Logging & Hono RPC
- Configure the `src/utils/logger.ts` to support 8-layer namespacing.
- Expose the `Agent Pulse` stream via a Hono RPC endpoint in `src/routes/ai.ts` using `hc`.

## 🏁 Completion Criteria
- [ ] Generated and followed a localized `docs/plans/phase-1-foundation-plan.md`.
- [ ] 100% Type-Safe completion (no `any`).
- [ ] `pnpm tsc --noEmit` strictly passed with zero errors.
- [ ] Successful Drizzle migration push for finance tables.
- [ ] Unit tests for `Atomic Checkout` locking.
- [ ] All automated tests passed.
- [ ] Code staged and committed with AI attribution.
- [ ] Update `docs/PROJECT_ROADMAP.md` (Phase 1 marked as COMPLETE).

### 4. Edge Middleware Integrity
- Implement standard Rate Limiting ceilings (e.g. 50/min human, 1000/min AI) inside `middleware/` to protect D1 infrastructure from DDoS.
- Introduce `BaseCurrency` and `Locale` to the Tenant Settings schema for explicit i18n support.
