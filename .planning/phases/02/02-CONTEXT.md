# Phase 2: Gateway & Sync - Context

**Gathered:** 2026-04-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Implement the Edge Gateway PBAC (Policy-Based Access Control) evaluator and the local-first synchronization engine using TanStack DB. This includes Hono middleware for security enforcement and the background reconciliation loop between IndexedDB and Cloudflare D1.

</domain>

<decisions>
## Implementation Decisions

### PBAC Edge Gateway
- **D-01:** Use **Cloudflare KV** for sub-millisecond caching of PBAC policies. This ENSURES we stay within the 10ms CPU limit for Edge Workers.
- **D-02:** Evaluation happens *before* any tool execution or repository writes in the Hono middleware.

### Local-First Sync Engine
- **D-03:** Implement **Debounced Sync** (approx. 5s intervals) for non-critical domain mutations to reduce Cloudflare Workers utilization.
- **D-04:** For **Finance/Ledger** entries, bypass debounce for immediate "Strict Transactional" sync to prevent double-spending/token drift.

### Frontend Integration (TanStack Start)
- **D-05:** Mandate **ssr: false** for all data-driven routes to ensure local-first compatibility.
- **D-06:** Utilize `collection.preload()` in TanStack Start loaders to hydrate indices before component mounting.

### the agent's Discretion
- Choice of specific debounce intervals for different domain collections (e.g., Settings can be slower than Attendance).
- Selection of the KV key-naming convention for multi-tenant policy isolation.

</decisions>

<canonical_refs>
## Canonical References

### Real-Time & Sync
- `docs/MASTER_ARCHITECTURE.md` §6 — SSE Pipeline and Event Bus patterns.
- `docs/MASTER_ARCHITECTURE.md` §11.4 — Sync Engine reconciliation logic.
- `docs/AGENTIC_SCHOOL_V2_PLAN.md` §8.2 — Synchronization lifecycle.

### Security
- `docs/MASTER_ARCHITECTURE.md` §19 — PBAC Edge Gateway and Gateway Policy Evaluator.
- `AGENTS.md` — Permission scopes and reporting lines.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/middleware/rateLimiter.ts`: Example of an async Hono middleware implementation.
- `src/db/sqlite/domain-pbac.ts`: Multi-tenant schema for policies and role grants.

### Established Patterns
- **Local-only collections**: Some UI state (e.g., sidebar collapse) should be flagged as `localOnly` in TanStack DB and excluded from the sync engine.

### Integration Points
- `src/middleware/index.ts`: Central hub for injecting the PBAC evaluator.

</code_context>

<deferred>
## Deferred Ideas

- SSE Heartbeat visualization (Agent Pulse) — Phase 4.
- Recursive memory summarization — Phase 5.

</deferred>

---

*Phase: 02-gateway-sync*
*Context gathered: 2026-04-09*
