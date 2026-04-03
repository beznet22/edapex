# Phase 1: Foundation & Orchestration Backbone — Execution Plan

> **Last updated**: 2026-04-03 (Agent Session 1)
> **Status**: ✅ COMPLETE — All tasks 1–11 finished.

---

## Task Status Legend

- ✅ DONE — Implemented, type-checked, merged
- 🔨 IN PROGRESS — Currently being worked on
- ⬜ NOT STARTED — Queued for this phase

---

## Task 1: Schema Enhancements ✅

All schema changes applied across **4 dialects** (SQLite, D1, MySQL, PostgreSQL).
`pnpm tsc --noEmit` passes cleanly.

### Files Modified (all 4 dialects)

| Domain File           | Changes                                                                                                                                                                                                                                                                       |
| :-------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `domain-ai.ts`        | `aiSessions`: +`summary`, +`tokenStats` (JSON/`TokenStats`), +`isCompressed`. `aiMessages`: +`cacheBreakpoint`, +`toolCallId`. `aiTasks`: +`sessionId` FK, +`invocationType` enum, +`usageJson` (JSON/`TaskUsageJson`), +`logRef`, +`errorCode`, +`exitCode`, +session index. |
| `domain-finance.ts`   | New `financeEvents` table (debit/credit, category enum, amountCents, balanceAfterCents, currency, idempotencyKey, referenceType/Id). Type: `FinanceEventMetadata`. 4 indexes.                                                                                                 |
| `domain-classroom.ts` | `classroomMemoryLedger`: +`parentLedgerId`, +`isCompacted`.                                                                                                                                                                                                                   |
| `domain-settings.ts`  | New types: `BaseCurrency`, `Locale`. `FinanceConfig`: +`baseCurrency`, +`locale`. `SettingConfig` union: +`HomeschoolConfig`, +`ClassroomConfig`.                                                                                                                             |

---

## Task 2: Logger & Config ✅

### Files Created

| File                  | Status                                                                                                                                                                                                |
| :-------------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/utils/logger.ts` | ✅ 8-layer trace logger (`LogLayer`, `LogLevel`, `LogContext`, `Logger`, `setLogLevel()`). JSON structured output with `run_id`, `tenant_id`, `session_id` correlation. Extra context key forwarding. |

### Files Modified

| File                  | Changes                                                                                                                                                                      |
| :-------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/config/index.ts` | ✅ Added `AppMode` type (`production`/`development`/`stress_lab`), `UnifiedConfig` interface (rateLimits, heartbeatIntervalMs, ai budget defaults), `buildConfig()` factory. |
| `src/utils/index.ts`  | ✅ Uncommented logger export.                                                                                                                                                |

---

## Task 3: Classroom Interface & Repository ✅

### Files to Create

| File                                                     | Purpose                                                                                                       | Status |
| :------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------ | :----- |
| `src/domain/interfaces/classroom.interface.ts`           | `IClassroomSession`, `IClassroomMemoryLedger`, `IClassroomParticipant`, `IClassroomRepository`                | ✅     |
| `src/domain/repositories/sqlite/classroom.repository.ts` | SQLite impl of `IClassroomRepository` with session CRUD, memory ledger append/compact, participant management | ✅     |

### Files Modified

| File                                      | Changes                                          | Status |
| :---------------------------------------- | :----------------------------------------------- | :----- |
| `src/domain/interfaces/index.ts`          | Added `export * from './classroom.interface.js'` | ✅     |
| `src/domain/repositories/sqlite/index.ts` | Added `export { SqliteClassroomRepository }`     | ✅     |

---

## Task 4: Heartbeat Service ✅

### Files Created

| File                                   | Status                                                                                                                                  |
| :------------------------------------- | :-------------------------------------------------------------------------------------------------------------------------------------- |
| `src/services/ai/heartbeat.service.ts` | ✅ Routine Engine with `processWakeup()`, `HeartbeatService` class, STRESS_LAB boot flag.                                               |
| `src/types/ai.types.ts`                | ✅ `StatelessEvent`, `HeartbeatTick`, `WakeupRequest`, `IdempotencyKeyResult`, `ClockSyncResult`, `StateCheckpoint`, `AgentPulseEvent`. |

### Stress Defense Tools Implemented

| Tool                       | Status                                                                                                                      |
| :------------------------- | :-------------------------------------------------------------------------------------------------------------------------- |
| `generateIdempotencyKey()` | ✅ SHA-256 via Web Crypto API. Edge-safe. Deterministic key from `(tenant_id, entity_type, natural_key, timestamp_bucket)`. |
| `validateClockSync()`      | ✅ Detects drift > 5s across edge nodes. Returns `ClockSyncResult`.                                                         |
| `captureStateCheckpoint()` | ✅ JSON snapshot of entity state before mutations. Returns `StateCheckpoint` with rollback token.                           |

---

## Task 5: Finance & AI Services ✅

### Files Created

| File                                      | Status                                                                                                           |
| :---------------------------------------- | :--------------------------------------------------------------------------------------------------------------- |
| `src/services/finance/finance.service.ts` | ✅ `FinanceService` with `recordCostEvent()` (idempotency-key dedup), `getBalance()`, `listEvents()`.            |
| `src/services/ai/ai.service.ts`           | ✅ `AIService` with session CRUD, message CRUD, `updateTokenStats()`, cost event delegation to `FinanceService`. |

### Files Modified

| File                                         | Status                                                                                                                                                                                                                                                                 |
| :------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/domain/interfaces/ai.interface.ts`      | ✅ Added `ITokenStats`, `ITaskUsageJson`, `InvocationType`. Updated `IAiChat` (+`summary`, `tokenStats`, `isCompressed`), `IAiMessage` (+`cacheBreakpoint`, `toolCallId`), `IAiTask` (+`sessionId`, `invocationType`, `usageJson`, `logRef`, `errorCode`, `exitCode`). |
| `src/domain/interfaces/finance.interface.ts` | ✅ Added `IFinanceEvent`, `IFinanceEventRepository`, `FinanceEventType`, `FinanceEventCategory`, `IFinanceEventMetadata`.                                                                                                                                              |
| `src/services/index.ts`                      | ✅ Exports `HeartbeatService`, `AIService`, `FinanceService`, `ClassroomService`, stress defense functions.                                                                                                                                                            |

---

## Task 6: Classroom Service & SSE ✅

### Files Created

| File                                          | Status                                                                                                                                                       |
| :-------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/services/classroom/classroom.service.ts` | ✅ `ClassroomService` with atomic `startSession()`, `endSession()`, `pauseSession()`, `dehydrateMemoryBuffer()`, `compactMemory()`, `buildStatelessEvent()`. |

### Notes

- `src/routes/classroomRoutes.ts` deferred to Task 8 (Hono Routes).
- Memory buffer persistence on every yield via `dehydrateMemoryBuffer()`.
- Atomic session locking reuses checkout pattern from heartbeat.

---

## Task 7: Edge Middleware & Rate Limiting ✅

### Files Created

| File                            | Status                                                                                                                                   |
| :------------------------------ | :--------------------------------------------------------------------------------------------------------------------------------------- |
| `src/middleware/rateLimiter.ts` | ✅ In-memory sliding window. 50/min human, 1000/min AI. 429 + `Retry-After` header. Auto-cleanup. `clearRateLimitWindows()` for testing. |

### Files Modified

| File                      | Status                                                                              |
| :------------------------ | :---------------------------------------------------------------------------------- |
| `src/middleware/index.ts` | ✅ Exports `rateLimiter`, `clearRateLimitWindows`, `RateLimiterConfig`.             |
| `src/app.ts`              | ✅ Wired `rateLimiter(unifiedConfig.rateLimits)` on `/api/*` before route handlers. |

---

## Task 8: Hono Routes ✅

### Files Created

| File                            | Status                                                                                     |
| :------------------------------ | :----------------------------------------------------------------------------------------- |
| `src/routes/aiRoutes.ts`        | ✅ `GET /pulse` (SSE), `POST /wakeup`, `GET /status`.                                      |
| `src/routes/classroomRoutes.ts` | ✅ `GET /sse` (SSE with 10ms yield), `POST /sessions/:id/start`, `POST /sessions/:id/end`. |

### Files Modified

| File                  | Status                                                                |
| :-------------------- | :-------------------------------------------------------------------- |
| `src/routes/index.ts` | ✅ Mounted `aiRoutes` at `/ai` and `classroomRoutes` at `/classroom`. |

---

## Task 9: Unit Tests ✅

### Files to Create

| File                               | Tests                                                                                                                      |
| :--------------------------------- | :------------------------------------------------------------------------------------------------------------------------- |
| `src/tests/heartbeat.test.ts`      | Atomic checkout race conditions — simulate 10 concurrent `claimNextWakeup()` calls, assert only 1 succeeds.                |
| `src/tests/idempotency.test.ts`    | `idempotency_key_generator` — submit same event 5x with same key, assert 1 row in DB. Network retry storm simulation.      |
| `src/tests/stress-defense.test.ts` | `clock_sync_validator` — feed drifted timestamps, assert rejection. `atomic_state_checkpoint` — capture, mutate, rollback. |

### Completion Criteria for Layer 1 Resilience

- Each defensive tool has a unit test simulating the specific stressor it defends against.
- All tests pass via `pnpm vitest run`.

---

## Task 10: TypeCheck & Drizzle Push ✅

| Step         | Command                                                                                                            |
| :----------- | :----------------------------------------------------------------------------------------------------------------- |
| TypeCheck    | `pnpm tsc --noEmit` — must pass with zero errors                                                                   |
| Drizzle Push | `pnpm run db:push` — migrate `ai_sessions`, `ai_messages`, `ai_tasks`, `finance_events`, `classroom_memory_ledger` |

---

## Task 11: Git Commit & Roadmap ✅

| Step        | Detail                                                                                             |
| :---------- | :------------------------------------------------------------------------------------------------- |
| Roadmap     | Update `docs/PROJECT_ROADMAP.md` — mark Phase 1 as COMPLETE                                        |
| Commit      | `git add . && git commit` with AI attribution headers                                              |
| Attribution | `Signed-off-by: Beznet <[EMAIL_ADDRESS]>` + `Co-Authored-By: Antigravity <antigravity@google.com>` |
