# Plan: Repository Isolation

**Goal:** Ensure every database interaction is scoped to a specific tenant.
**Status:** Completed (Retroactive)

## Proposed Changes

### Domain Repositories
- [x] **Refactor**: Update all repository methods to accept and enforce `tenantId`.
- [x] **Verification**: Audit `src/domain/repositories/` to ensure no raw `db.select()` leaks without a `where(eq(table.tenantId, tId))` filter.

## Verification
- [x] `pnpm vitest run src/domain/repositories/`
