# EdApex V2 Project Roadmap: The Agentic School

This roadmap outlines the strategic evolution of EdApex V2 into an autonomous "Agentic School," ensuring 100% fidelity between the [AGENTIC_SCHOOL_V2_PLAN.md](AGENTIC_SCHOOL_V2_PLAN.md) and the implemented codebase.

## 🏁 Completed Milestones

### Phase 0: Canonical Base & Edge Infrastructure
- [x] **8-Layer Architecture**: Provisioned `routes/`, `controllers/`, `services/`, `domain/`, `db/`, `middleware/`, `validators/`, and `events/`.
- [x] **17-Domain Schema**: Drizzle schemas for all domains (Academic -> Settings) are implemented for D1/SQLite.
- [x] **Edge-Native Boot**: `app.ts` and `server.ts` configured for Cloudflare Workers orchestration.
- [x] **AI Strategy**: Initial `AiOrchestrator` refactored for provider-agnostic, capability-based routing.

---

## 🚀 Current Focus: Phase 1 - Foundation & Orchestration Backbone

**Goal**: Establish the "Pulse" of the autonomous school through heartbeat loops and financial accountability.

- [ ] **Heartbeat Loop**: Migrate Paperclip's `heartbeat.ts` to EdApex `RoutineEngine` (services/ai/).
- [ ] **Atomic Checkout**: Implement distributed locking in the AI sub-domain for multi-agent safety.
- [ ] **Financial Ledger**: Implement `cost_events` and `finance_events` schemas and their respective `IRepository<T>` implementations.
- [ ] **Agent Pulse (API)**: Expose the real-time activity stream via Hono RPC (`src/routes/ai.ts`).

---

## 🛠️ Upcoming Phases

### Phase 2: HMAS & Specialized Role Library
- **Role Deployment**: Implementation of the 31+ specialized Staff Roles (Registrar, Bursar, HR Manager, etc.).
- **Supervisor Logic**: Principal Assistant logic for cross-domain goal decomposition.
- **Mastra Integration**: Verification of JSON tools against the 17-domain repositories.

### Phase 3: Domain Alignment & Anti-Corruption Layer (ACL)
- **Service Transformation**: Refactoring business logic from Paperclip into native `src/services/` for all 17 domains.
- **Entity Mapping**: Implementing the ACL to bridge Mastra outputs to Drizzle entities.
- **Internal Event Bus**: Reactive triggers for cross-domain side effects (e.g., Attendance -> Notification).

### Phase 4: Command Center UI (TanStack Start)
- **Shell Implementation**: The 3-pane dashboard with Tailwind CSS v4 and glassmorphism.
- **TanStack DB Sync**: Local-first state management with background D1 reconciliation.
- **AI-Elements**: Chat and Artifact viewer integration in the main viewport.

### Phase 5: Governance & Proactive Auditing
- **PBAC Security**: Edge-native policy evaluation for all agentic actions.
- **Maximizer Agents**: Proactive audit agents for system health and financial compliance.
- **Board Approval Inbox**: Governance UI for overriding or approving high-impact AI proposals.

---

## 📈 Platform Health Dashboard

| Layer | Responsibility | Coverage | Status |
| :--- | :--- | :--- | :--- |
| **API/Routes** | Hono RPC endpoints | 15% | 🏗️ BUILDING |
| **Services** | Domain Logic (ACL) | 10% | 🏗️ BUILDING |
| **AI Orchestration**| Mastra HMAS Loop | 5% | 🏗️ BUILDING |
| **Repositories** | Drizzle D1 Adapters | 100% | ✅ COMPLETED |
| **Database** | 17-Domain Schema | 100% | ✅ COMPLETED |
| **Logging** | 8-Layer Namespacing | 5% | 🏗️ BUILDING |
| **Frontend UI** | TanStack + AI-Elements| 5% | 🏗️ BUILDING |
