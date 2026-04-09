# Plan: PBAC Edge Gateway

**Goal:** Enforce policy-based access control at the Edge using Cloudflare KV.

## Proposed Changes

### Middleware
- [ ] **NEW** `src/middleware/pbacEvaluator.ts`: Hono middleware that extracts `user_id`, `tenant_id`, and `required_scope`.
- [ ] **Logic**: Lookup policy in `EDAPEX_PBAC_KV`. If missing, fallback to D1 and populate KV.

### Integration
- [ ] **MODIFY** `src/middleware/index.ts`: Inject PBAC evaluator into the global middleware chain.

## Verification
- [ ] `pnpm vitest run src/middleware/pbacEvaluator.test.ts`
- [ ] Manual check with `curl` to unauthorized endpoints.
