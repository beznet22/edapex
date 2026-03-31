# EdApex V2 Project Roadmap

This document outlines the strategic progression of the EdApex V2 platform, tracking completed milestones and defining future development phases with 100% fidelity to the current codebase status.

## 🏁 Completed Milestones

### Phase 0: Project Restructuring & Layer Provisioning
Established the canonical 4-layer directory structure and protocol documentation.
- [x] **Canonical Structure**: Provisioned `routes/`, `controllers/`, `services/`, `middleware/`, `validators/`, and `config/`.
- [x] **Protocol Documentation**: Added `@backend-dev-guidelines` headers to all layer indices.
- [x] **Core Bootstrap**: Initialized `app.ts`, `server.ts`, and `instrument.ts` (Hono / Sentry shells).
- [x] **Custom AI Skill**: Deployed `edapex-domain-architect` to enforce cross-layer discipline.

- [x] **Verification**: 100% Type-Safe verified via `tsc`.

### Phase 6: Edge-Native Migration & Local-First Base
Transitioned to Cloudflare Workers and established the reactive data synchronization layer.
- [x] **D1 Persistence**: Adapted 18 domain repositories for **Cloudflare D1** (SQLite flavor).
- [x] **Sync Engine**: Initialized **TanStack DB** collections and established the reconciliation skeleton in `frontend/src/lib/sync.ts`.
- [x] **Agent Orchestration**: Refactored `AiOrchestrator` for **Provider-Agnostic AI** (capability-based routing).

---

## 🚀 Current Objective: Phase 7 - Frontend Modernization & AI-Elements (TanStack SPA)

**Goal**: Build a stunning, local-first, AI-native SPA (No SSR) using TanStack Router, Query, and DB.

- [/] **Local-First Sync**: Complete the reconciliation logic between TanStack DB and Cloudflare D1. [/]
- [ ] **Design System**: Implement the vanilla CSS design system with glassmorphism and premium aesthetics.
- [ ] **AI-Elements Integration**: Build interactive chat interfaces for student tutoring and administrative assistants.
- [ ] **Portal Overhaul**: Modernize Student, Parent, and Teacher portals with sub-1ms reactive dashboards.
- [ ] **State Management**: Utilize **TanStack Query** and **TanStack DB** for reactive state orchestration.

---

## 🎨 Upcoming: Phase 7 - Frontend Modernization & AI-Elements (tanstack router, react-query, react-db)

**Goal**: Build a stunning, AI-native user experience using Svelte 5 and AI-Elements.

- [ ] **Design System**: Implement the vanilla CSS design system with glassmorphism and premium aesthetics.
- [ ] **AI-Elements Integration**: Build interactive chat interfaces for student tutoring and administrative assistants.
- [ ] **Portal Overhaul**: Modernize Student, Parent, and Teacher portals with real-time reactive dashboards.
- [ ] **State Management**: Utilize Svelte 5 runes for high-performance frontend state orchestration.

---

## 📈 Status Dashboard (Layer-by-Layer)

| Layer | Responsibility | Progress | Status |
| :--- | :--- | :--- | :--- |
| **API & Routes** | Hono endpoints & D1 integration. | 15% | 🏗️ IN PROGRESS |
| **Controllers** | Request parsing & Sync reconciliation. | 15% | 🏗️ IN PROGRESS |
| **Services** | Domain logic & AI orchestration. | 25% | 🏗️ IN PROGRESS |
| **Domain Repositories** | Edge-Native SQLite/D1 Adapters. | 100% | ✅ COMPLETED |
| **Domain Interfaces** | Abstract business logic contracts. | 100% | ✅ COMPLETED |
| **Database Schema** | Drizzle ORM definitions (18 Domains). | 100% | ✅ COMPLETED |
| **Security (PBAC)** | Middleware & Policy evaluation logic. | 15% | 🏗️ IN PROGRESS |
| **Infrastructure** | D1, KV, R2 & Sync Engine. | 30% | 🏗️ IN PROGRESS |
| **Frontend UI** | TanStack Start & AI-Elements. | 5% | 🏗️ IN PROGRESS |
