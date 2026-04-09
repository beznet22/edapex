# Phase 1: Foundation & Ledger - Context

**Gathered:** 2026-04-09
**Status:** Ready for planning (Retroactive)

<domain>
## Phase Boundary

Deliver the foundational multi-tenant data layer and the financial ledger system. This includes repository abstractions for all domains, strict tenant isolation, and atomic checkout logic for AI token consumption.

</domain>

<decisions>
## Implementation Decisions

### Persistence & Data Access
- **D-01:** Repository Pattern for all domain data access, decoupling business logic from Drizzle/SQLite implementation.
- **D-02:** Mandatory `tenant_id` filtering enforced at the repository level for all `select`, `update`, and `delete` operations.

### Financial Integrity
- **D-03:** Cent-based (integer) double-entry ledger for all financial events (token usage, tuition, payroll).
- **D-04:** Atomic Checkout loop requiring a confirmed ledger entry before AI inference begins.

### Agent Orchestration
- **D-05:** HMAS Supervisor Pattern using Mastra AI SDK, delegating goals from a Principal Assistant to specialized Domain Supervisors.
- **D-06:** Registry-based skill management mapping filesytem `SKILL.md` documents to agent capabilities.

### the agent's Discretion
- Choice of specific 18-domain naming conventions and directory structure in `src/`.
- Exact schema definition for domain-specific tables beyond core `tenants` and `ledger` tables.

</decisions>

<canonical_refs>
## Canonical References

### Core Architecture
- `docs/MASTER_ARCHITECTURE.md` — 8-layer edge-native architecture specification.
- `docs/AGENTIC_SCHOOL_V2_PLAN.md` — Multi-phase transformation roadmap and logic mapping.

### Agent Governance
- `AGENTS.md` — Virtual staff definitions and permission scopes.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/domain/repositories/`: Foundational repository implementations for multi-tenant isolation.
- `src/services/ai/`: Mastra-backed orchestration core and skill registry.

### Established Patterns
- **Repository-First**: Business logic never touches `db` directly; always through `repositories`.
- **Cent-Based Accounting**: All financial data stored as integers to avoid floating-point drift.

### Integration Points
- `src/app.ts`: Multi-tenant middleware and Hono RPC gateway.

</code_context>

<deferred>
## Deferred Ideas

- Local-first background sync (TanStack DB) — Phase 2.
- 3-Pane Command Center UI Shell — Phase 4.

</deferred>

---

*Phase: 01-foundation-ledger*
*Context gathered: 2026-04-09*
