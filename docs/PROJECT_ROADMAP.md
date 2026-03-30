# EdApex V2 Project Roadmap

This document outlines the strategic progression of the EdApex V2 platform, tracking completed milestones and defining future development phases with 100% fidelity to the current codebase status.

## 🏁 Completed Milestones

### Phase 0: Project Restructuring & Layer Provisioning
Established the canonical 4-layer directory structure and protocol documentation.
- [x] **Canonical Structure**: Provisioned `routes/`, `controllers/`, `services/`, `middleware/`, `validators/`, and `config/`.
- [x] **Protocol Documentation**: Added `@backend-dev-guidelines` headers to all layer indices.
- [x] **Core Bootstrap**: Initialized `app.ts`, `server.ts`, and `instrument.ts` (Hono / Sentry shells).

### Phase 1-5: Planet-Scale Domain & Repository Engine
Successfully implemented the entire Data Persistence and Anti-Corruption Layer (ACL).
- [x] **Schema Definitions**: 100% coverage for 17 domains in `src/db/`.
- [x] **Domain Interfaces**: 100% coverage for 17 functional domain contracts.
- [x] **Multi-Dialect Repositories**: 100% implemented for **MySQL**, **PostgreSQL** (Schema-aware), and **SQLite** across all domains.
- [x] **Verification**: 100% Type-Safe verified via `tsc`.

---

## 🚀 Current Objective: Phase 6 - Service Layer & Agent Orchestration

**Goal**: Migrate business logic from legacy monolith into pure domain services and implement the HMAS Orchestrator.

- [ ] **Domain Services**: Implement state-machine logic for Registration, Finance, and Grading workflows.
- [ ] **HMAS Orchestrator**: Build the Executive Orchestrator to decompose natural language intent into domain-specific tasks.
- [ ] **Homeschooling AI**: Develop the HomeschoolSupervisor, StemTutoringAgent, and EarlyYearsAgent prioritizing Coding & Robotics.
- [ ] **Service-Repo Injection**: Connect the 100% completed Repositories to the Service Layer using Dependency Injection.
- [ ] **Transactional Outbox**: Finalize the event-driven reliability layer for cross-domain state synchronization.

---

## 🎨 Upcoming: Phase 7 - Frontend Modernization (Svelte 5)

**Goal**: Build a stunning, AI-native user experience using Svelte 5 and AI-Elements.

- [ ] **Design System**: Implement the vanilla CSS design system with glassmorphism and premium aesthetics.
- [ ] **AI-Elements Integration**: Build interactive chat interfaces for student tutoring and administrative assistants.
- [ ] **Portal Overhaul**: Modernize Student, Parent, and Teacher portals with real-time reactive dashboards.
- [ ] **State Management**: Utilize Svelte 5 runes for high-performance frontend state orchestration.

---

## 📈 Status Dashboard (Layer-by-Layer)

| Layer | Responsibility | Progress | Status |
| :--- | :--- | :--- | :--- |
| **API & Routes** | Hono endpoints & path mapping. | 5% | 🏗️ PROVISIONED |
| **Controllers** | Request parsing & error handling. | 5% | 🏗️ PROVISIONED |
| **Services** | Domain logic & AI orchestration. | 5% | 🏗️ PROVISIONED |
| **Domain Repositories** | Multi-dialect DB Adapters (MySQL, PG, SQLite). | 100% | ✅ COMPLETED |
| **Domain Interfaces** | Abstract business logic contracts. | 100% | ✅ COMPLETED |
| **Database Schema** | Drizzle ORM definitions (17 Domains). | 100% | ✅ COMPLETED |
| **Security (PBAC)** | Middleware & Policy evaluation logic. | 15% | 🏗️ IN PROGRESS |
| **Infrastructure** | Config, Events & Observability. | 10% | 🏗️ PROVISIONED |
| **Frontend UI** | Svelte 5 & AI-Elements. | 0% | 📅 PLANNED |
