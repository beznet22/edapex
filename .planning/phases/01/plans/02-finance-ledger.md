# Plan: Financial Ledger Core

**Goal:** Establish an immutable, cent-based double-entry ledger.
**Status:** Completed (Retroactive)

## Proposed Changes

### Schema Implementation
- [x] **Drizzle**: Create `ledger` and `transactions` tables with `tenantId` and `amountCents` (Integer).
- [x] **Service**: Implement `FinanceService` with `createEntry` logic.

## Verification
- [x] Verify no floating point units are used for financial storage.
- [x] Confirm double-entry balance checks pass.
