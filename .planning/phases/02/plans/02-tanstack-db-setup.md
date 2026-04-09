# Plan: TanStack DB Core Setup

**Goal:** Configure the local-first data layer for all 18 domains.

## Proposed Changes

### Data Layer
- [ ] **NEW** `src/db/tanstack-db.ts`: Initialize `createCollection` for each domain matching the D1 schema.
- [ ] **Options**: Use `ssr: false` compatibility flags.

### Configuration
- [ ] **MODIFY** `app.config.ts`: Disable SSR globally for data routes to prevent hydration mismatch.

## Verification
- [ ] Verify IndexedDB population in browser devtools.
- [ ] Confirm `collection.preload()` successfully caches indices on route change.
