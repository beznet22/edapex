# EdApex V2 Project Roadmap: The Agentic School

This roadmap outlines the strategic evolution of EdApex V2 into an autonomous "Agentic School," ensuring 100% fidelity between the [AGENTIC_SCHOOL_V2_PLAN.md](AGENTIC_SCHOOL_V2_PLAN.md) and the implemented codebase.

## 🏁 Completed Milestones

### Phase 0: Canonical Base & Edge Infrastructure

- [x] **8-Layer Architecture**: Provisioned `routes/`, `controllers/`, `services/`, `domain/`, `db/`, `middleware/`, `validators/`, and `events/`.
- [x] **18-Domain Schema**: Drizzle schemas for all domains (Academic -> Settings + Classroom) are implemented for D1/SQLite/MySQL/PostgreSQL.
- [x] **Edge-Native Boot**: `app.ts` and `server.ts` configured for Cloudflare Workers orchestration.
- [x] **AI Strategy**: Initial `AiOrchestrator` refactored for provider-agnostic, capability-based routing.

---

## ✅ Phase 1 - Foundation & Orchestration Backbone — COMPLETE

**Goal**: Establish the "Pulse" of the autonomous school through heartbeat loops and financial accountability.

- [x] **Schema Enhancements**: AI sessions/messages/tasks, finance_events, classroom memory ledger, and settings i18n — all 4 dialects (SQLite, D1, MySQL, PostgreSQL).
- [x] **8-Layer Trace Logger**: Structured logger with `run_id` correlation and layer namespacing (`src/utils/logger.ts`).
- [x] **Heartbeat Loop**: Migrate Paperclip's `heartbeat.ts` to EdApex `RoutineEngine` (services/ai/).
- [x] **Atomic Checkout**: Implement distributed locking in the AI sub-domain for multi-agent safety.
- [x] **Financial Ledger**: Implement `finance_events` repository and `FinanceService`.
- [x] **AI Persistence**: Implement `AIService` exposing sessions, messages, cost events.
- [x] **Classroom Session & SSE**: Session lifecycle, memory buffer, and SSE streaming endpoint.
- [x] **Agent Pulse (API)**: Expose the real-time activity stream via Hono RPC (`src/routes/ai.ts`).
- [x] **Edge Middleware & Rate Limiting**: Implement strict ceilings (50/min human, 1000/min AI) to protect D1 infrastructure from DDoS.
- [x] **Metadata i18n Strategy**: Configure `BaseCurrency` and `Locale` in the Tenant Settings schema.
- [x] **Unit Tests**: Atomic checkout race conditions (26/26 passing), idempotency key generator, stress defense tools.
- [x] **TypeCheck**: Zero-error `pnpm tsc --noEmit` passed.

---

- [x] **Operator Handoff**: `request_human_operator` tool for explicit escalation.

---

## ✅ Phase 3 - Domain Alignment & ACL — 100% COMPLETE

**Goal**: Refactor business logic into native `src/services/` and bridge to Mastra.

- [x] **Service Transformation**: All 18 domain services implemented in `src/services/`.
- [x] **Entity Mapping**: Drizzle entities mapped and accessible via domain interfaces.
- [x] **Internal Event Bus**: Reactive triggers in `src/events/` for cross-domain side effects.
- [x] **External Webhooks Vault**: Facade tools for HTTP egress (Stripe, Termii).
- [x] **Binary Delegation Map**: HTML-to-PDF bridge in `DocumentsService`.

---

## ✅ Phase 3.5 - Agent Architecture Alignment (Hermes) — COMPLETE

**Goal**: Transition to dynamic, filesystem-based skill hydration.

- [x] **Markdown-First Skills**: `AGENTS.md` and `SKILL.md` are the sources of truth for agent behavior.
- [x] **SkillLoaderService**: Dynamic discovery and loading of skills from the filesystem.
- [x] **Authority Injection**: Domain-specific guardrails injected via `UniversalWorker.getDomainContext`.
- [x] **Role Unification**: Deleted redundant `src/services/ai/roles/` directory.

---

## 🛠️ Upcoming Phases

### Phase 4: Command Center UI (TanStack Start)

- **Shell Implementation**: The 3-pane dashboard with Tailwind CSS v4.
- **TanStack DB Sync**: Local-first state management.
- **AI-Elements**: Chat and Artifact viewer integration.
- **Real-Time Telemetry**: SSE edge streams for sub-150ms "Agent Pulse Toasts".

### Phase 5: Governance & Proactive Auditing

- **PBAC Security**: Edge-native policy evaluation.
- **Maximizer Agents**: Proactive audit agents.
- **Board Approval Inbox**: Governance UI for high-impact AI proposals.

---

## 📈 Platform Health Dashboard

| Layer                | Responsibility         | Coverage | Status       |
| :------------------- | :--------------------- | :------- | :----------- |
| **API/Routes**       | Hono RPC endpoints     | 30%      | 🏗️ BUILDING  |
| **Services**         | Domain Logic (ACL)     | 85%      | ✅ MOSTLY DONE |
| **AI Orchestration** | Mastra HMAS Loop       | 90%      | ✅ MOSTLY DONE |
| **Repositories**     | Drizzle D1 Adapters    | 100%     | ✅ COMPLETED |
| **Database**         | 18-Domain Schema       | 100%     | ✅ COMPLETED |
| **Logging**          | 8-Layer Namespacing    | 100%     | ✅ COMPLETED |
| **Frontend UI**      | TanStack + AI-Elements | 5%       | 🏗️ BUILDING  |
