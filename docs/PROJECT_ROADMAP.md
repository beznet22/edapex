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

## 🛠️ Upcoming Phases

### 🚀 Current Focus: Phase 2 - HMAS & Specialized Role Library

- **Role Deployment**: Implementation of the 31+ specialized Staff Roles (Registrar, Bursar, HR Manager, etc.).
- **Supervisor Logic**: Principal Assistant logic for cross-domain goal decomposition.
- **Mastra Integration**: Verification of JSON tools against the 18-domain repositories.
- **Data Privacy (GDPR/NDPR)**: Implement the PII Obfuscation Middleware to pre-process LLM queries.
- **Operator Handoff**: Equip all B2C agents with the `request_human_operator` tool for explicit human escalation.

### Phase 3: Domain Alignment & Anti-Corruption Layer (ACL)

- **Service Transformation**: Refactoring business logic from Paperclip into native `src/services/` for all 18 domains.
- **Entity Mapping**: Implementing the ACL to bridge Mastra outputs to Drizzle entities.
- **Internal Event Bus**: Reactive triggers for cross-domain side effects (e.g., Attendance -> Notification).
- **External Webhooks Vault**: Implement facade tools for third-party HTTP egress (Stripe, Termii) without exposing raw API keys to agents.
- **Binary Delegation Map**: Wire the Document Service to map generated `HTMLContent` strings to the `html2pdf` binary execution bridge.

### Phase 4: Command Center UI (TanStack Start)

- **Shell Implementation**: The 3-pane dashboard with Tailwind CSS v4 and glassmorphism.
- **TanStack DB Sync**: Local-first state management with background D1 reconciliation.
- **AI-Elements**: Chat and Artifact viewer integration in the main viewport.
- **Real-Time Telemetry (SSE)**: Implement unidirectional edge streams for sub-150ms "Agent Pulse Toasts".
- **Snapshot Hydration Flow**: Complete Disaster Recovery implementation for restoring IndexedDB from D1 PITR states.

### Phase 5: Governance & Proactive Auditing

- **PBAC Security**: Edge-native policy evaluation for all agentic actions.
- **Maximizer Agents**: Proactive audit agents for system health and financial compliance.
- **Board Approval Inbox**: Governance UI for overriding or approving high-impact AI proposals.

---

## 📈 Platform Health Dashboard

| Layer                | Responsibility         | Coverage | Status       |
| :------------------- | :--------------------- | :------- | :----------- |
| **API/Routes**       | Hono RPC endpoints     | 25%      | 🏗️ BUILDING  |
| **Services**         | Domain Logic (ACL)     | 25%      | 🏗️ BUILDING  |
| **AI Orchestration** | Mastra HMAS Loop       | 15%      | 🏗️ BUILDING  |
| **Repositories**     | Drizzle D1 Adapters    | 100%     | ✅ COMPLETED |
| **Database**         | 18-Domain Schema       | 100%     | ✅ COMPLETED |
| **Logging**          | 8-Layer Namespacing    | 100%     | ✅ COMPLETED |
| **Frontend UI**      | TanStack + AI-Elements | 5%       | 🏗️ BUILDING  |
