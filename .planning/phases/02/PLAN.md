# Phase 2: Gateway & Sync - Plan

**Objective:** Implement the Edge Gateway PBAC evaluator and the local-first synchronization engine using TanStack DB.

## Acceptance Criteria (UAT)

- [ ] **Security Enforcement**: Unauthorized requests are rejected by the Hono middleware before reaching the repository layer.
- [ ] **Cache Performance**: PBAC policy lookups use Cloudflare KV, resulting in <5ms latency overhead.
- [ ] **Local-First State**: All domain data is accessible offline via IndexedDB.
- [ ] **Sync Integrity**: Mutations sync to Cloudflare D1 within a 5-second debounced window.
- [ ] **SSR Compatibility**: All data-driven routes function correctly with `ssr: false`.

## Implementation Steps

### 1. PBAC Edge Gateway
- **Plan**: `plans/01-pbac-gateway.md`
- **Focus**: Hono middleware + KV caching logic.

### 2. TanStack DB Core
- **Plan**: `plans/02-tanstack-db-setup.md`
- **Focus**: Multi-domain collection configuration and preloading.

### 3. Sync Engine
- **Plan**: `plans/03-sync-engine.md`
- **Focus**: Background reconciliation and conflict resolution (LWW).

---

*Phase: 02-gateway-sync*
*Plan created: 2026-04-09*
