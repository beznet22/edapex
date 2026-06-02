# Slash-Command Tool Hardening Plan
**Status:** Draft · **Phase:** 3.1 + 3.2 (Atomic Tools & Governance) · **Owner:** EdApex Mastra

---

## 0. Executive Summary

Eight back-end slash-command tools (`searchEntity`, `manageResults`, `onboardEntity`, `assignEntity`, `patchEntity`, `manageAccess`, `switchWorkspace`, `systemStatus`) and **four** workflow tools (`extract`, `generate`, `validate`, `publish`) ship today, but a critical review reveals **twelve concrete bug classes** that prevent them from returning real data at runtime. The fourth workflow tool, `generate`, is in an even worse state than the other three: `generateWorkflow` is registered in the Mastra instance (`src/lib/server/mastra/index.ts:18,48`) but **no `generateTool`, `generateLogic`, or `generateSchema` exists in `tools/workflow-tools.ts`** and `tools/index.ts` does not export one. `/generate` is therefore not just a stub — it does not exist as a tool at all.

The right fix is **not** a new abstraction layer — the existing `ScopedRepositoryProvider` and `AssessmentService` are sufficient. The fix is a **single, well-defined bridge** between the Mastra `ToolExecutionContext` (which carries `requestContext`) and the `MastraToolContext` shape our logic functions consume, plus a small set of `AssessmentService` extensions for the gaps that the tools hit at runtime.

**Recommended decision on the DB-instance question:** **Hybrid.** The MySQL Drizzle client and `libSQL` Mastra client are *already* process-wide singletons behind memoized promises (`getDatabase()` and `createMastraDb()`). They are safe to share across requests because the underlying connection pool handles concurrency. Therefore the DB handle is **not** carried in `requestContext`; only the `TenantContext` is. The `ScopedRepositoryProvider` is the per-request cache that binds repositories to that tenant.

This is the **only** pattern that does not violate the AGENTS.md rule *"Never create global singletons"* in spirit — the singleton here is the connection pool, not a tenant-bound repository, which is the same shape Mastra itself uses internally.

---

## 1. The DB-Instance Decision (Singleton vs. Context-Punched)

### 1.1 Current state of the codebase

| Layer | Source | Lifetime | Tenant-bound? |
|---|---|---|---|
| MySQL `Drizzle` client | `src/lib/server/db/index.ts` `getDatabase()` | Module-level memoized Promise (singleton) | ❌ No — it is a connection pool, tenant-agnostic |
| `libSQL` Mastra DB | `src/lib/server/mastra/db` `createMastraDb()` | Per-call factory, internally memoized | ❌ No — same reasoning |
| `studentRepo`, `resultRepo`, `timelineRepo` (singletons) | `src/lib/server/repository/index.ts` | Module-level instances built with `BaseRepository.build()` and **default tenant** `{ schoolId: 1, userId: 1, designationId: 1, ... }` | ❌ **No — and this is the bug** |
| `ScopedRepositoryProvider` | `src/lib/server/mastra/scoped-repository.ts` | Per-request | ✅ Yes — bound to a frozen `TenantContext` |
| `AssessmentService` | `src/lib/server/service/assessment.service.ts` | Module-level singleton, but **imports the broken singleton repos above** | ❌ No — see §2.1 |
| `MastraToolContext` | `src/lib/server/mastra/tenant-context.ts` | Per-tool-call (declared, not actually constructed anywhere) | ✅ Should be — but see §2.2 |

### 1.2 Why context-punching the DB is the wrong answer

Injecting the Drizzle client into every `requestContext` would:
1. Force every tool wrapper, every test, and every code path that builds a `RequestContext` to plumb the DB through. The current test suite (`__tests__/slash-commands.test.ts`) constructs `MastraToolContext` directly without a DB — adding `db` to that contract would invalidate every existing test.
2. Duplicate a value that is already a process-wide singleton (`getDatabase()` returns the same Promise on every call). It adds no isolation; the pool is the isolation.
3. Make per-test DB mocks painful — every test would need to construct a context-poked DB instead of just spying on a repository.

### 1.3 Why the *current* singleton is also the wrong answer

`src/lib/server/repository/index.ts` exports `studentRepo`, `resultRepo`, `timelineRepo` as **module-level instances built with the default tenant**. Any code that imports and uses them (`assessment.service.ts` does) operates on `schoolId=1` regardless of the caller's tenant. This is the multi-tenant security bug we must fix.

### 1.4 The recommended pattern (hybrid)

- **DB connection (MySQL + libSQL):** process-wide singleton. No change. `getDatabase()` and `createMastraDb()` keep their current memoization. `AssessmentService` and every tool can call them freely.
- **`TenantContext`:** per-request, frozen, carried inside `requestContext` (the value at key `'tenantContext'`).
- **Repositories:** per-request, bound to the active `TenantContext` via `ScopedRepositoryProvider`, **constructed lazily** at the boundary that owns the request — the Mastra tool-execution bridge.
- **`AssessmentService`:** accept a `ScopedRepositoryProvider` in its constructor (or a per-call argument) instead of importing the broken singletons. Repos are then resolved per request and are tenant-bound.

The `MastraToolContext` interface in `tenant-context.ts:95-99` already declares `getRepo` and `audit`. The only missing piece is `getService` (which `ScopedRepositoryProvider` already exposes at line 31-39) plus a constructor signature on `AssessmentService`. We will add `getService` to the interface and a constructor overload to `AssessmentService`.

### 1.5 What this means for each caller

| Caller | Before | After |
|---|---|---|
| `searchEntityTool` | imports module-level `studentRepo`, `staffRepo` from `repository/index.ts` | calls `context.getRepo(StudentRepository)` / `getRepo(StaffRepository)` (already correct at `tools/index.ts:113-114`, but the **execute signature is broken** — see §2.2) |
| `manageResultsLogic` | uses `context.getRepo(...)` (correct shape) | unchanged after §2.2 fix |
| `AssessmentService.runExtraction` | `studentRepo`, `resultRepo`, `timelineRepo`, `staffRepo` from `repository/index.ts` | accepts `ScopedRepositoryProvider` arg; resolves `getRepo` per call |
| `AssessmentService.publishResults` | same singletons | same |
| `AssessmentService.getStudentResult` | same singletons | same |
| `AssessmentService.upsertStudentResult` | calls `resultRepo.db.transaction` (the singleton's DB) | unchanged at the DB layer; repo becomes per-request |

---

## 2. Critical Review: 12 Bug Classes Across the 8 Tools + 4 Workflows

Each bug is keyed to a file:line and a slash command. Bugs are ordered by severity (security/runtime crash first, contract drift last).

### B1. **[CRITICAL · multi-tenant security]** `AssessmentService` uses tenant-less singleton repos
- **Where:** `src/lib/server/service/assessment.service.ts:21,1051`; `src/lib/server/repository/index.ts:11-18`
- **Impact:** `runExtraction`, `publishResults`, `getStudentResult`, `upsertStudentResult`, `upsertAttendance`, `upsertTeacherRemark`, `upsertStudentRatings`, `getMappingData`, `getExtractedAssessment` all run against the `schoolId=1` default tenant. A teacher from school 2 calling `/extract` writes into school 1's data.
- **Additionally:** `runExtraction` hard-codes `tenantContext.schoolId: 1` (`assessment.service.ts:938`), so even if the tenant were propagated, the construction site overwrites it.
- **Fix:** Add `ScopedRepositoryProvider` parameter to `AssessmentService` (constructor + each public method). Resolve all repos via the provider. Migrate `runExtraction` to read `tenantContext.schoolId` from the provider, not from a hard-coded `1`.

### B2. **[CRITICAL · runtime crash]** `MastraToolContext` is never constructed and `execute()` reads the wrong shape
- **Where:** `src/lib/server/mastra/tools/index.ts:34-35,46-47,58-59,70-71,82-83,94-95,111,195,210,222,234` (and the logic files). Mastra's `ToolExecutionContext` carries `requestContext?: RequestContext<TRequestContext>` (`node_modules/.../tools/types.d.ts:303-326`), not `tenantContext` and `getRepo` at the top level.
- **Impact:** When the agent actually invokes a tool, `context.tenantContext` is `undefined` and `context.getRepo` throws. The tools *appear* to work in unit tests because tests hand-build the `MastraToolContext` object.
- **Fix:** Add a single `buildMastraToolContext(requestContext)` adapter in `tenant-context.ts` that:
  1. reads `tenantContext` from `requestContext.get('tenantContext')`,
  2. reads `audit` (threadId / modelId) from a parallel set of keys,
  3. constructs a `ScopedRepositoryProvider(db, tenantContext)` once,
  4. returns `{ tenantContext, getRepo, getService, audit }`.
  Each tool's `execute` then does `const mctx = buildMastraToolContext(context.requestContext)` and passes that to its `*Logic` function. Test mocks can call the same builder.

### B3. **[CRITICAL · silent no-op]** `extractLogic` / `validateLogic` / `publishLogic` are stubs
- **Where:** `src/lib/server/mastra/tools/workflow-tools.ts:35-62, 74-97, 108-137`
- **Impact:** `/extract`, `/validate`, `/publish` return `EXTRACTION_STARTED`/`VALIDATED`/`PUBLISH_STARTED` with `validCount: 0` and **never call** the real workflows in `src/lib/server/mastra/workflows/{extraction,validation,publish}.ts` or `AssessmentService`. The slash command appears to succeed but does nothing.

### B12. **[CRITICAL · tool does not exist]** `/generate` has no tool wrapper at all
- **Where:** `src/lib/server/mastra/tools/workflow-tools.ts` (no `generateSchema` / `generateLogic` / `generateTool` exports), `src/lib/server/mastra/tools/index.ts` (no `generateTool` in the exports), `src/lib/server/mastra/index.ts:18,48` (`generateWorkflow` registered as a workflow but never reachable from a tool)
- **Impact:** The slash-command resolver in `chat-helper.ts:198` maps `/generate` to the `assistant` skill, so the LLM is *told* `/generate` exists. The user types `/generate` and the LLM has no tool to call. The fallback path silently drops the request. The actual `generateWorkflow` in `workflows/generate.ts:160-180` is dead code from the agent's perspective.
- **Fix:** Create `generateSchema` / `generateLogic` / `generateTool` mirroring the other three, and call into a new `AssessmentService.runGenerateForTool` that resolves `generateWorkflow` from `mastra` (via the bridge's `context.mastra`) and invokes it.

### B4. **[CRITICAL · null deref]** `gradingTool` academic case calls `batchUpsertMarkRecords` with hard-coded rollNo/admissionNo
- **Where:** `src/lib/server/mastra/tools/grading-tools.ts:157-171`
- **Impact:** `studentRollNo: 1, studentAddmissionNo: 1` are hard-coded literals. Drizzle will not throw because the columns are nullable in `smMarkStores`, but every mark inserted through the agent is **wrong** — the roll number recorded against the mark is always `1`.
- **Fix:** Fetch the actual `rollNo` and `admissionNo` from the resolved `student` object (already returned by `studentRepo.getById` — extend the return shape or call `studentRepo.getStudentById` to include those columns).

### B5. **[CRITICAL · null deref]** `gradingTool` qualitative case calls `upsertTeacherRemark` without `teacherId`
- **Where:** `src/lib/server/mastra/tools/grading-tools.ts:213-218`
- **Impact:** The `teacherRemarks` table has a NOT NULL `teacherId` column. The insert will fail with a Drizzle/MySQL constraint error at runtime.
- **Fix:** Pass `teacherId: tenantContext.staffId` (the comment in the AssessmentService code at `assessment.service.ts:432` already does this — mirror the same logic).

### B6. **[HIGH · null deref]** `gradingTool` behavioral case missing required `schoolId`
- **Where:** `src/lib/server/mastra/tools/grading-tools.ts:235-243`
- **Impact:** `studentRatings.schoolId` is NOT NULL. The current call omits it.
- **Fix:** Add `schoolId: tenantContext.schoolId`.

### B7. **[HIGH · query failure]** `gradingTool` academic case fails when `tenantContext.examId` is null
- **Where:** `src/lib/server/mastra/tools/grading-tools.ts:153-155`
- **Impact:** Guarded with `MISSING_EXAM_CONTEXT` ✓ — but the test at `slash-commands.test.ts:659-674` only exercises this branch. The other three branches (`attendance`, `qualitative`, `behavioral`) also call repos with `examTypeId: tenantContext.examId` and will pass `null` to a NOT NULL FK. Need the same guard on all four branches.
- **Fix:** Add the same `if (tenantContext.examId === null) return { status: "ERROR", errorCode: "MISSING_EXAM_CONTEXT" }` check before each `case` that uses `examTypeId`.

### B8. **[HIGH · wrong scope]** `searchEntityTool` accepts but ignores `classId` / `sectionId` from input
- **Where:** `src/lib/server/mastra/tools/index.ts:108-109, 118-148`
- **Impact:** The tool's `inputSchema` declares `classId` and `sectionId` as optional filters, but the execute body only uses `tenantContext.classId` / `sectionId`. An IT admin trying to narrow a search to a specific class via the tool input gets silently ignored.
- **Fix:** Use `input.classId ?? tenantContext.classId` and `input.sectionId ?? tenantContext.sectionId` everywhere they appear in the execute body (the `getStudentsByClassSection` call and the `SearchCandidate` mapping).

### B9. **[HIGH · workspace lock bypass]** `assignEntityLogic` only checks the *target* workspace, not the source
- **Where:** `src/lib/server/mastra/tools/onboard-tools.ts:191-247`
- **Impact:** `validateWorkspaceLock(tenantContext, input.targetClassId, input.targetSectionId)` runs on the destination, but the student's *current* `classId/sectionId` is never validated against the tenant. A Class Teacher (designation 8) could move any student from any class into their own class without the source check firing.
- **Fix:** After fetching the student (`studentRepo.getById`), call `validateWorkspaceLock(tenantContext, student.classId, student.sectionId)` *before* mutating.

### B10. **[MEDIUM · N+1 query]** `manageAccessLogic` for staff uses `staffRepo.db.select` instead of a proper method
- **Where:** `src/lib/server/mastra/tools/gov-tools.ts:122-130`
- **Impact:** Reaches past the `StaffRepository` abstraction into raw Drizzle, importing `smStaffs` directly. Breaks the `BaseRepository.withErrorHandling` envelope, so Drizzle errors propagate as raw exceptions instead of `DbInternalError`. Also bypasses the configuration cache and any future cross-cutting concern (e.g., read-replica routing) added to the repo.
- **Fix:** Add `StaffRepository.getById(teacherId)` mirroring `StudentRepository.getById`, and call it.

### B11. **[MEDIUM · contract drift]** `onboardEntityLogic` queries `smBaseGroups` / `smBaseSetups` / `smStudentCategories` via raw Drizzle
- **Where:** `src/lib/server/mastra/tools/onboard-tools.ts:74-119`
- **Impact:** Same as B10 — bypasses repository, no error envelope, no caching, and duplicates the SQL already inside `studentRepo.getStudentRegistrationOptions` (`student.repo.ts:648-693`).
- **Fix:** Replace the inline `studentRepo.db.select...` calls with calls to `studentRepo.resolveGenderId(name)` and `studentRepo.resolveStudentCategoryId(name)` (new methods we will add — see §3.1) that mirror the registration-options query and live behind `withErrorHandling`.

---

## 3. AssessmentService Integration Plan

### 3.1 New methods to add to `AssessmentService`

These fill the gaps that the slash-command tools hit at runtime.

| Method | Signature | Used by | Notes |
|---|---|---|---|
| `upsertMarksForClassSection` | `(params: { classId, sectionId, examTypeId, marks: Array<{ studentId, subjectId, score, ... }>, staffId }) => Promise<{ count: number; errors: string[] }>` | new "bulk grade entry" use case (not in any current tool, but referenced in `slash_command_specs.md` §2.1 step 5) | atomic transaction |
| `resolveGenderAndCategory` | `(params: { genderName, categoryName }) => Promise<{ genderId?: number; studentCategoryId?: number }>` | `onboardEntityLogic` (replaces B11's raw Drizzle) | uses `studentRepo.getStudentRegistrationOptions` |
| `runExtractionForTool` | `(params: { provider: ScopedRepositoryProvider, userId, teacherId, file, classId, sectionId, studentId?, fullName?, admissionNo?, originalName? })` | `extractLogic` (B3) | drops the hard-coded `schoolId: 1` from B1 |
| `runGenerateForTool` | `(params: { provider: ScopedRepositoryProvider, fileIds: string[], classId, sectionId, staffId })` | `generateLogic` (B12) | resolves `generateWorkflow` from `mastra` via `context.mastra` and invokes it; tenant comes from `provider` |
| `getStudentResultForTool` | `(provider, params)` | any future read tool (none today, but `slash_command_specs.md` implies a `/result` read) | tenant-bound |
| `validateExtractionForTool` | `(provider, params: { workflowRunId, studentIds? })` | `validateLogic` (B3) | mirrors `validationWorkflow` |
| `publishResultsForTool` | `(provider, params: { studentIds, examId, scope: 'all' \| 'student', resend? })` | `publishLogic` (B3) | mirrors `publishWorkflow` |

### 3.2 Constructor signature change

```ts
// before
export const assessment = new AssessmentService();

// after
export class AssessmentService {
  constructor(
    private readonly provider: ScopedRepositoryProvider | null = null,
  ) {}

  // existing public methods now resolve repos via this.provider ?? globalFallback()
}
```

The `globalFallback()` path keeps backward compatibility for callers that do not yet pass a provider (e.g., the cron-style `runExtraction` call inside workflows that currently do not have a request context). It logs a warning and uses the broken singleton — acceptable for the migration window but flagged for removal in `6.1`.

### 3.3 New methods to add to `StudentRepository` (small, surgical)

| Method | Purpose | Replaces |
|---|---|---|
| `resolveGenderId(genderName: string): Promise<number \| null>` | B11 | raw Drizzle in `onboardEntityLogic` |
| `resolveStudentCategoryId(categoryName: string): Promise<number \| null>` | B11 | raw Drizzle in `onboardEntityLogic` |
| `getRollNoAndAdmissionNo(studentId): Promise<{ rollNo: number \| null; admissionNo: number \| null }>` | B4 | hard-coded `1`s in `gradingTool` |
| `getById(id)` already exists — `StudentRepository.getById:633-635` is the alias | — | — |

### 3.4 New method to add to `StaffRepository`

| Method | Purpose | Replaces |
|---|---|---|
| `getById(teacherId: number)` | B10 | raw `staffRepo.db.select` in `manageAccessLogic` |

### 3.5 New method to add to `ScopedRepositoryProvider`

Already exists: `getService<T>(ServiceClass)` at `scoped-repository.ts:31-39`. We will:
1. Add it to the `MastraToolContext` interface.
2. Wire it into the bridge from §2.2.

---

## 4. Implementation Plan (TDD slices, atomic per AGENTS.md)

Each slice is one commit, fully complete (interface + repo + service + tool + test). Each slice depends on the previous.

### Slice 0 — Bridge the context (foundational, blocks everything else)
**Files touched:** `src/lib/server/mastra/tenant-context.ts`, `src/lib/server/mastra/scoped-repository.ts`, `src/lib/server/mastra/db/index.ts` (read-only)

1. Add `getService<T>` to `MastraToolContext` interface.
2. Add `buildMastraToolContext(requestContext: RequestContext | undefined): MastraToolContext` in `tenant-context.ts`. It must:
   - return `{ tenantContext: <default>, getRepo: () => { throw }, getService: () => { throw }, audit: {} }` when `requestContext` is missing (so tests can omit it),
   - otherwise read `tenantContext`, `audit.threadId`, `audit.modelId` from the request context,
   - build a `ScopedRepositoryProvider` from `getDatabase()` + the tenant.
3. Add a unit test `bridge.test.ts` that asserts (a) the missing-context default, (b) the happy path with a populated `requestContext`, (c) the `getService` call returns a tenant-bound `AssessmentService`.

**Why first:** every other slice's tool will go through this bridge.

### Slice 1 — Fix the singleton vs per-request repo split (B1)
**Files touched:** `src/lib/server/service/assessment.service.ts`, `src/lib/server/repository/student.repo.ts`, `src/lib/server/repository/staff.repo.ts`, `src/lib/server/repository/result.repo.ts`, `src/lib/server/repository/timeline.repo.ts`, `src/lib/server/repository/base.repo.ts`

1. Add `StudentRepository.resolveGenderId`, `resolveStudentCategoryId`, `getRollNoAndAdmissionNo`.
2. Add `StaffRepository.getById`.
3. Refactor `AssessmentService` to accept a `ScopedRepositoryProvider` in its constructor. Replace every import of the module-level singleton with `this.provider.getRepo(...)` (with a `globalFallback` log-warning path for backward compat). Drop the hard-coded `tenantContext.schoolId: 1` in `runExtraction`.
4. Tests: `assessment.service.test.ts` that exercises (a) `runExtraction` writes to the provider's school, (b) `publishResults` writes to the provider's school, (c) `getStudentResult` reads from the provider's school. Use a mock `ScopedRepositoryProvider` that delegates to in-memory stores keyed by `schoolId`.

### Slice 2 — Wire the workflow tools to AssessmentService (B3, B12)
**Files touched:** `src/lib/server/mastra/tools/workflow-tools.ts`, `src/lib/server/mastra/tools/index.ts`

1. Replace `extractLogic` with a call to `provider.getService(AssessmentService).runExtractionForTool(...)`. Same for `validateLogic` → `validateExtractionForTool`, `publishLogic` → `publishResultsForTool`.
2. **Create the missing `generateSchema` / `generateLogic` / `generateTool` (B12).** `generateLogic` calls `provider.getService(AssessmentService).runGenerateForTool(...)`. `generateSchema` mirrors `generateTriggerSchema` in `workflows/generate.ts:8-17` minus the embedded `tenantContext` (which comes from the bridge).
3. Export the new `generateTool` from `tools/index.ts` and add it to the `workflowTools` aggregate so it is injected alongside `extract`, `validate`, `publish` whenever a `/workflow` slash command runs (see `chat-helper.ts:225-231`).
4. Add new methods on `AssessmentService` (3.1) that delegate to the existing workflow functions in `workflows/{extraction,generate,validation,publish}.ts` (so we do not duplicate logic).
5. Tests: `workflow-tools.test.ts` with a mock `AssessmentService` that records calls and asserts the input mapping is correct for **all four** workflow tools. Add an explicit assertion that `generateTool.id === 'generate-results'` (matching the workflow's id) so the resolver in `chat-helper.ts` can find it.

### Slice 3 — Fix `gradingTool` data-correctness bugs (B4, B5, B6, B7)
**Files touched:** `src/lib/server/mastra/tools/grading-tools.ts`, `src/lib/server/repository/student.repo.ts`

1. Add `MISSING_EXAM_CONTEXT` guard to all four branches (B7).
2. Fetch `rollNo` and `admissionNo` via `studentRepo.getRollNoAndAdmissionNo` (B4).
3. Pass `teacherId: tenantContext.staffId` to `upsertTeacherRemark` (B5).
4. Pass `schoolId: tenantContext.schoolId` to the behavioral rating (B6).
5. Tests: extend the existing `makeToolContext` test helper to also return `rollNo` / `admissionNo`, then add new assertions.

### Slice 4 — Fix `searchEntityTool` input filter (B8)
**Files touched:** `src/lib/server/mastra/tools/index.ts`

1. Use `input.classId ?? tenantContext.classId` and `input.sectionId ?? tenantContext.sectionId` throughout the execute body.
2. Add a test that asserts the `input.classId` override flows through to `studentRepo.getStudentsByClassSection`.

### Slice 5 — Fix `assignEntityLogic` workspace lock (B9)
**Files touched:** `src/lib/server/mastra/tools/onboard-tools.ts`

1. After fetching the student, call `validateWorkspaceLock(tenantContext, student.classId, student.sectionId)`.
2. Test: assign a student from class 99 to class 10, with the teacher locked to class 10 — expect `WorkspaceMismatchError`.

### Slice 6 — Replace raw Drizzle in `manageAccessLogic` and `onboardEntityLogic` (B10, B11)
**Files touched:** `src/lib/server/mastra/tools/gov-tools.ts`, `src/lib/server/mastra/tools/onboard-tools.ts`

1. Replace `staffRepo.db.select` with `staffRepo.getById(targetId)` (uses the new B10 method).
2. Replace the `smBaseGroups` / `smBaseSetups` / `smStudentCategories` raw Drizzle in `onboardEntityLogic` with `studentRepo.resolveGenderId` and `studentRepo.resolveStudentCategoryId`.
3. Tests: assert that the `getRegistrationOptions` shape from `studentRepo` is the source of truth (no divergence between the registration options and the resolution).

### Slice 7 — End-to-end bridge test
**Files touched:** `src/lib/server/mastra/__tests__/integration.test.ts` (new)

A single integration test that constructs a real `MastraToolContext` via the bridge from §4.Slice0, then invokes each of the 8 tool `*Logic` functions with a mock `ScopedRepositoryProvider`. Asserts that:
- tenant boundaries are honored,
- DB writes go to the provider's tenant,
- no null deref crashes occur on the happy path,
- error codes (`STUDENT_NOT_FOUND`, `WORKSPACE_MISMATCH`, `MISSING_EXAM_CONTEXT`, `USER_EXISTS`, `NEEDS_CONFIRMATION`) all return cleanly.

---

## 5. Files Touched (Consolidated)

| File | Action | Slices |
|---|---|---|
| `src/lib/server/mastra/tenant-context.ts` | edit — add `buildMastraToolContext`, add `getService` to interface | 0 |
| `src/lib/server/mastra/scoped-repository.ts` | read — no change | 0 |
| `src/lib/server/service/assessment.service.ts` | edit — refactor to per-request repos, add 6 methods | 1, 2 |
| `src/lib/server/repository/student.repo.ts` | edit — add 3 methods | 1, 3 |
| `src/lib/server/repository/staff.repo.ts` | edit — add 1 method | 1, 6 |
| `src/lib/server/repository/result.repo.ts` | read — no change | — |
| `src/lib/server/repository/timeline.repo.ts` | read — no change | — |
| `src/lib/server/mastra/tools/index.ts` | edit — fix B8, wire bridge, route workflow tools (incl. new `generateTool`) | 0, 2, 4 |
| `src/lib/server/mastra/tools/workflow-tools.ts` | edit — wire AssessmentService calls; add `generateSchema` / `generateLogic` (B12) | 2 |
| `src/lib/server/mastra/tools/grading-tools.ts` | edit — fix B4/B5/B6/B7 | 3 |
| `src/lib/server/mastra/tools/onboard-tools.ts` | edit — fix B9, B11 | 5, 6 |
| `src/lib/server/mastra/tools/gov-tools.ts` | edit — fix B10 | 6 |
| `src/lib/server/mastra/__tests__/bridge.test.ts` | new | 0 |
| `src/lib/server/service/__tests__/assessment.service.test.ts` | new | 1 |
| `src/lib/server/mastra/__tests__/workflow-tools.test.ts` | new | 2 |
| `src/lib/server/mastra/__tests__/integration.test.ts` | new | 7 |

---

## 6. Risk Register

| Risk | Mitigation |
|---|---|
| Tests that already pass against the broken singleton pattern start failing | Slice 1 keeps the `globalFallback` path with a `console.warn` for one minor version; remove in 6.1 |
| `AssessmentService` is also called from `src/lib/agents/assessment.ts` and the worker job | Slice 1's constructor overload (provider or null) preserves that path; add a follow-up task to thread the provider through the worker |
| Refactoring `AssessmentService` breaks `workflows/{extraction,generate,validation,publish}.ts` which call it | Slice 2 wires the workflow tools *before* flipping the workflow files; the workflow files continue to use the `globalFallback` path until they are refactored in a separate phase |
| `generateWorkflow` in `workflows/generate.ts:80-90` calls `mastra.getAgent('result-mapper')` — that agent must exist or the structured-output step throws | B12 includes a guard in `generateLogic` that returns a clear `MISSING_AGENT` error code before invoking the workflow; the agent registration is documented as a separate ops task |
| `generateWorkflow`'s `mapFilesStep` and `processFileWorkflow` re-emit `tenantContext` through every step using `as any` casts (`workflows/generate.ts:28,31,38,42,75,77,107,110,131`) — typed `tenantContext` is deferred to a follow-up | Out of scope; tracked for Phase 6 cleanup |
| `requestContext` in Mastra is generic over `TRequestContext` — the `tenantContext` key could collide | The key is namespaced as `'tenantContext'` in `chat-helper.ts:60` and `requestContextSchema` in `agents/shared.ts:15-32`; documented in the bridge as a contract |
| `BaseRepository` caches `ConfigurationCache` per `schoolId` in a module-level Map (`base.repo.ts:26-27`) — that is a hidden global | Out of scope for this plan; tracked for Phase 6 cleanup |

---

## 7. Acceptance Criteria

1. `pnpm test src/lib/server/mastra/__tests__/bridge.test.ts` passes.
2. `pnpm test src/lib/server/service/__tests__/assessment.service.test.ts` passes and asserts that `runExtraction` writes to a non-default school.
3. `pnpm run svelte-check --workspace src/lib/server/mastra/tools/index.ts` exits clean.
4. `pnpm test src/lib/server/mastra/__tests__/slash-commands.test.ts` still passes (no regressions to existing 13 unit tests).
5. Manual: invoke `/search Alice` and `/mark @John Math 85` against a dev tenant with `schoolId=2`; verify rows land in the school 2 tables, not school 1.
6. Manual: invoke `/extract` with a fixture file; verify a real `mastra_runs` row is created in `mastra.db` and the workflow resumes correctly on `/validate`.
7. Manual: invoke `/generate` with a fixture file; verify the `generateWorkflow` resumes with `processFileWorkflow` and commits the structured result to the correct school via `AssessmentService.upsertStudentResult`.
8. The `implementation_checklist.md` §3.2 items 1–13 are flipped to `[x]` with this plan's new test files as the citation.

---

## 8. Out of Scope (Deferred)

- Refactoring `BaseRepository` to remove the `ConfigurationCache` module-level Map (Phase 6, "Legacy Decommissioning").
- Threading `ScopedRepositoryProvider` through the worker thread jobs (`src/lib/server/worker/*`). The worker will continue to use the `globalFallback` path with a deprecation warning.
- Adding the `web-search` / `web-fetch` / `getContext` tools to the same review (they are read-only and have no DB-bypass risk).
- Replacing the `extractionWorkflow` / `generateWorkflow` / `validationWorkflow` / `publishWorkflow` Step files with the new `*ForTool` methods. They are equivalent; the new methods exist *in addition to*, not in place of, the workflow files.
- Registering the `result-mapper` agent that `generateWorkflow` looks up at `workflows/generate.ts:80`. The agent does not exist yet in `src/lib/server/mastra/agents/`. This is a separate ops/migration task; B12 includes a `MISSING_AGENT` error path in `generateLogic` so the slash command fails cleanly until the agent is registered.
- **The tool `id` and slash-command renames in §10 are a breaking change** for every external caller of `TOOL_MAP` keys and the `SLASH_COMMANDS` test constant. Mitigation: one-minor-version alias layer in `tools/index.ts` and `gateway.ts` (Slice 8 in §10.5), plus a deprecated-alias log in `chat-helper.ts`.

---

## 9. Frontend ↔ Backend Slash-Command Audit

### 9.1 Cross-reference: `CommandDropdown` → `skillCommandMap` → skills → tools

| Slash Cmd | Dropdown label | Dropdown desc (current) | Skill | Tool required | Tool exists? | Tool description (current) |
|---|---|---|---|---|---|---|
| `/extract` | "Extract data via Mistral OCR" | `assistant` | `extract-document` | ✅ `tools/index.ts:206` | "Extract data from uploaded documents/images via OCR. Initiates the extraction workflow." |
| `/validate` | "Human-in-the-loop review" | `assistant` | `validate-extraction` | ✅ `tools/index.ts:218` | "Validate extracted data against schema and business rules. Resumes a suspended extraction workflow." |
| `/generate` | "Upsert student results" | `assistant` | `generate-results` | ❌ **Missing (B12)** | — |
| `/publish` | "Publish final grade reports" | `assistant` | `publish-results` | ✅ `tools/index.ts:230` | "Publish validated results — generates PDF report cards and dispatches email notifications." |
| `/grade` | "Submit academic grade" | `grading` | `manage-results` (academic) | ✅ | "Manage student marks, attendance, remarks, and behavioral ratings." |
| `/mark` | "Add exam marks" | `grading` | `manage-results` (academic) | ✅ | same |
| `/attendance` | "Record attendance status" | `grading` | `manage-results` (attendance) | ✅ | same |
| `/register` | "Register new student or staff" | `onboarding` | `onboard-entity` | ✅ `tools/index.ts:30` | "Onboard a new student, guardian, or class." |
| `/enroll` | "Enroll student in a class" | `onboarding` | `onboard-entity` | ✅ | same |
| `/assign` | "Assign teacher or role" | `onboarding` | `assign-entity` | ✅ `tools/index.ts:66` | "Assign or transfer a student to a class and section." |
| `/update` | "Update system entity record" | `gov` | `patch-entity` | ✅ `tools/index.ts:42` | "Update or edit an existing student, guardian, or class record." |
| `/edit` | "Edit existing records" | `gov` | `patch-entity` | ✅ | same |
| `/rename` | "Rename class or subject" | `gov` | `patch-entity` | ✅ | same |
| `/ban` | "Revoke active system access" | `gov` | `manage-access` | ✅ `tools/index.ts:90` | "Ban, suspend, reset password, or delete students and staff." |
| `/suspend` | "Suspend user workspace access" | `gov` | `manage-access` | ✅ | same |
| `/reset` | "Reset context or workspace state" | `gov` | `manage-access` (reset password) | ✅ | same |
| `/search` | "Deep database entity search" | `default` | `search-entity` | ✅ `tools/index.ts:102` | "Search for students or staff by name or admission number." |
| `/find` | "Alias for entity lookup" | `default` | `search-entity` | ✅ | same |
| `/switch` | "Switch active workspace/tenant" | `default` | `switch-workspace` | ✅ `tools/index.ts:78` | "Atomic context switch between classes or sections." |
| `/status` | "Check health & active context" | `default` | `system-status` | ✅ `tools/index.ts:191` | "Check system health and current tenant context." |

### 9.2 Findings

#### B13. **[HIGH · UX correctness]** Eight dropdown descriptions are factually wrong or jargon

- **Where:** `src/lib/components/chat/CommandDropdown.svelte:29-154`
- **Impact:** Teachers are presented with academic-domain phrasing. Mismatches cause confusion and force them to memorise which command does what. Specifically:
  - `/generate` "Upsert student results" — the actual tool *generates* a structured `ResultOutput` from OCR'd markdown; it does not "upsert". Upserting is what `/validate` triggers downstream.
  - `/assign` "Assign teacher or role" — the actual tool assigns a *student* to a class/section, not a teacher or a role.
  - `/rename` "Rename class or subject" — the actual tool renames a *student* (firstName/lastName/fullName) or an *exam* (not implemented in `patchEntity` yet, see B11.5 below).
  - `/reset` "Reset context or workspace state" — the actual tool resets a *user's password*.
  - `/search` "Deep database entity search" — jargon, not pedagogical.
  - `/find` "Alias for entity lookup" — same.
  - `/switch` "Switch active workspace/tenant" — "tenant" is a backend term; the user-facing verb is "switch to another class".
  - `/validate` "Human-in-the-loop review" — vague, no indication that the review gates the database commit.
- **Fix:** Apply the new descriptions in §9.3 below. All descriptions must be written in teacher-facing academic language, not implementation jargon.

#### B14. **[HIGH · LLM tool-selection quality]** Tool descriptions are implementation-centric, not intent-centric

- **Where:** every `createTool({ id, description, inputSchema, execute })` in `src/lib/server/mastra/tools/{index,grading,onboard,gov,workflow,core}.ts`
- **Impact:** The Mastra Gateway Agent chooses tools by matching the user's natural-language intent against `description`. Current descriptions lead with implementation details ("via Mistral OCR", "via OCR", "via the extraction workflow") rather than the school-operations outcome the teacher wants ("extract marks from a scanned report card"). This causes the LLM to under-select tools, fall back to the default skill, and miss the slash command.
- **Fix:** Rewrite each `description` to follow the pattern *"Do X for Y in Z"* — verb, target, scope. Apply the new descriptions in §9.4 below.

#### B11.5. **[MEDIUM · spec drift]** `/rename` is wired to `patch-entity` but `patchEntity` does not actually support rename of classes or subjects

- **Where:** `src/lib/server/mastra/tools/gov-tools.ts:199-298` — the `patchEntitySchema` only accepts `studentId`, `firstName`, `lastName`, `dateOfBirth`, `genderId`, `studentCategoryId`, `rollNo`. There is no path to rename a class or subject, and there is no `examId` branch. The dropdown label "Rename class or subject" is therefore a lie.
- **Impact:** `/rename @exam` and `/rename @class` are unhandled. The tool will return `MISSING_ENTITY_ID` for any input that does not match the student branch.
- **Fix:** Either (a) restrict the dropdown to rename a *student* and update the description, or (b) extend `patchEntity` with `examId` and `classId` branches. This plan recommends (a) for the current slice and (b) as a follow-up Phase 3.1 task.

### 9.3 New `CommandDropdown` descriptions (academic / school-ops voice)

Replace `desc` field in `src/lib/components/chat/CommandDropdown.svelte`:

| Cmd | New desc |
|---|---|
| `/extract` | "Read marks from a scanned report card" |
| `/validate` | "Review OCR'd marks before saving" |
| `/generate` | "Generate a structured result from a transcript" |
| `/publish` | "Email report cards to parents" |
| `/grade` | "Enter a subject score for a student" |
| `/mark` | "Enter exam marks for a student" |
| `/attendance` | "Record days present and absent" |
| `/register` | "Add a new student or staff member" |
| `/enroll` | "Move a student into a class" |
| `/assign` | "Move a student to a different class" |
| `/update` | "Edit a student's profile details" |
| `/edit` | "Edit a student's name or class info" |
| `/rename` | "Change a student's full name" |
| `/ban` | "Permanently disable a user account" |
| `/suspend` | "Temporarily disable a user account" |
| `/reset` | "Reset a user's login password" |
| `/search` | "Look up a student or staff member" |
| `/find` | "Look up a student by name or number" |
| `/switch` | "Change to a different class" |
| `/status` | "Show the active class and term" |

### 9.4 New tool `description` fields (intent-first, school-ops voice)

These go into each `createTool({...})` call. The first sentence is the outcome; the second sentence is the guard / scope.

| Tool ID | New description |
|---|---|
| `extract-document` | "Extract marks and attendance from uploaded report-card images or PDFs. Use when a teacher uploads scanned or photographed result sheets. Returns a staging record for review; does not write to the academic database." |
| `validate-extraction` | "Review the staged marks from a previous /extract and commit them to the academic database. Use after a teacher has verified the OCR output. Writes student results, attendance, and remarks transactionally." |
| `generate-results` (NEW per B12) | "Generate a structured result card from a transcript or past result file. Use to produce a draft result before /validate. Returns a draft; does not write to the academic database." |
| `publish-results` | "Email validated report cards to parents and update each student's timeline. Use after /validate has committed results. Runs PDF generation and SMTP delivery." |
| `manage-results` | "Record a scholastic outcome for a student: a subject mark, attendance, a written remark, or a behaviour rating. Use for direct entry of grades into the academic record. Requires a resolved student and an active exam term." |
| `onboard-entity` | "Register a new student or staff member, or enrol a returning student into a class. Use when a student joins the school or a new staff account is needed. Captures guardian details and creates the user account in one transaction." |
| `assign-entity` | "Move an enrolled student to a different class or section. Use for transfers, mid-year class changes, or section reassignment. Preserves the student's existing academic history." |
| `patch-entity` | "Edit a student's profile: name, date of birth, gender, category, or roll number. Use for corrections to demographic or roster data. Protected fields (ID, school, role) cannot be changed through this tool." |
| `manage-access` | "Disable, suspend, reset the password of, or delete a user account. Use for account lifecycle changes. Destructive actions require explicit user confirmation; resets return a temporary password." |
| `search-entity` | "Look up a student or staff member by name, partial name, or admission number. Use to resolve @mentions or to list everyone in the active class. If multiple matches exist, returns candidates for disambiguation." |
| `system-status` | "Show the active class, section, term, and current user. Use to confirm the workspace before issuing a grade or registration. Returns the same IDs that the agent is currently scoped to." |
| `switch-workspace` | "Change the active class and section for the current session. Use when a teacher needs to operate on a different class. Flushes the workspace cache immediately; subsequent commands will be scoped to the new class." |

### 9.5 New test slice for descriptions

**Files touched:** `src/lib/server/mastra/__tests__/tool-descriptions.test.ts` (new)

Property-based test that, for every command in `SLASH_COMMANDS` (the 20 from `preservation.property.test.ts:82-91`):
1. The dropdown description is non-empty, ≤ 60 characters, and contains a verb in the imperative mood.
2. The matching tool's `description` is non-empty, ≥ 40 characters, contains the words "use" (action verb), and does *not* contain implementation jargon tokens ("MySQL", "Drizzle", "OCR pipeline", "tenant", "singleton", "request context", "via Mistral").
3. The tool's `id` matches the `id` declared in the relevant skill manifest (so the resolver in `chat-helper.ts:151-162` can find it).

This test would have caught B12 (no tool for `/generate`), B13 (jargon descriptions), and the wrong-flavoured description in the original `/assign` "Assign teacher or role".

### 9.6 Skill manifest updates

The skill `.skill.md` files in `src/lib/server/mastra/skills/` already use academic language in the body sections, but the tool lists are correct. No structural change needed; only the `assistant.skill.md` needs the new `generate-results` tool entry added once the tool is created (B12).

---

## 10. Tool Audit and Renaming Proposal (supplements §9)

This section formalises an academic and domain-specific vocabulary for every Mastra agent tool, the schemas that feed them, the skill manifests that activate them, and the slash commands that route to them. It **supplements** §9 — §9 covered the description drift; this section covers the **renames** themselves (tool `id`, schema name, slash command token) plus the slash-command additions the user has approved.

> **Breaking-change note:** the renames in §10.1 and the new slash commands in §10.2 will change the `TOOL_MAP` keys in `src/lib/server/mastra/gateway.ts:21-30`, the `tools:` array in every `src/lib/server/mastra/skills/*.skill.md` frontmatter, the `SLASH_COMMANDS` constant in `src/lib/server/mastra/__tests__/preservation.property.test.ts:82-91`, and the `commands` array in `src/lib/components/chat/CommandDropdown.svelte:29-154`. Tests must be updated in lockstep.

### 10.1 Tool ID & schema renames

| # | Current tool id | New tool id | Current schema | New schema | Description (academic voice) |
|---|---|---|---|---|---|
| 1 | `onboard-entity` | **`enroll-student`** | `onboardEntitySchema` | `enrollStudentSchema` | "Process new student admissions and enrollment, linking guardians to their wards and assigning initial class and section placements." |
| 2 | `patch-entity` | **`update-student-biodata`** | `patchEntitySchema` | `updateStudentBiodataSchema` | "Modify core student biographical data, including names, date of birth, gender, and assigned roll numbers within a class." |
| 3 | `assign-entity` | **`transfer-student`** | `assignEntitySchema` | `transferStudentSchema` | "Process student promotions or administrative transfers between different academic classes and sections within the school." |
| 4 | `search-entity` | **`search-school-directory`** | `searchEntitySchema` | `searchSchoolDirectorySchema` | "Query the school directory to locate students and academic staff by partial names, full names, or unique admission numbers." |
| 5 | `switch-workspace` | **`switch-academic-context`** | `switchWorkspaceSchema` | `switchAcademicContextSchema` | "Atomically switch the active operational context to a different class or section for subsequent administrative or grading actions." |
| 6 | `system-status` | **`get-academic-context`** | `systemStatusSchema` | `getAcademicContextSchema` | "Retrieve the active academic parameters and workload sandbox (current Academic Year, Term/Exam, Class, and Section) for the active user session." |
| 7 | `manage-results` | **`manage-academic-records`** | `manageResultsSchema` | `manageAcademicRecordsSchema` | "Manage comprehensive academic assessments, including continuous assessment scores, term examinations, daily attendance registers, qualitative teacher remarks, and psychomotor trait ratings." |
| 8 | `manage-access` | **`manage-account-access`** | `manageAccessSchema` | `manageAccountAccessSchema` | "Execute disciplinary actions such as account deactivations (suspensions) and permanent deletions, and manage system access credentials like password resets for students and staff." |
| 9 | `extract-document` | *(unchanged)* | `extractSchema` | *(unchanged)* | "Run OCR over uploaded report cards and stage the resulting marks for teacher review." |
| 10 | `validate-extraction` | *(unchanged)* | `validateSchema` | *(unchanged)* | "Review the staged marks from a previous /extract and commit them to the academic database transactionally." |
| 11 | `publish-results` | *(unchanged)* | `publishSchema` | *(unchanged)* | "Email validated report cards to parents and update each student's timeline. Runs PDF generation and SMTP delivery." |
| 12 | *(missing per B12)* | **`generate-results`** *(new)* | *(new)* | `generateResultsSchema` | "Generate a structured result card from a transcript or past-result file. Use to produce a draft result before /validate. Returns a draft; does not write to the academic database." |

**Tool IDs #9–#12 are kept stable** in `tools/index.ts:18` because they are referenced by the workflow Step files in `src/lib/server/mastra/workflows/{extraction,validation,publish}.ts` and by the background worker dispatchers. Renaming them would invalidate those references and is out of scope for this slice.

### 10.2 Database audit per tool

Audited against the repository layer (B10 + B11 were the trigger for this section).

| Tool | Underlying repository methods | Notes |
|---|---|---|
| `get-academic-context` (ex `system-status`) | `tenantContext` is read-only — no DB write. Reads the `TenantContext` keys `academicId`, `examId`, `classId`, `sectionId` plus the `smAcademicYears` / `smExamTypes` / `smClasses` / `smSections` names from the configuration cache. | Drop the `health: 'operational'` literal from the tool output (it has no DB meaning). |
| `manage-account-access` (ex `manage-access`) | `update` → `StudentRepository.updateStudent` / `StaffRepository.updateStudent`-equivalent; `suspend`/`ban` → `StudentRepository.updateStudentStatus({ active: false })` / `StaffRepository.updateStaffStatus({ active: false })`; `delete` → `StudentRepository.deleteStudent` / `StaffRepository.deleteStaff`; `reset` → `AuthRepository.updateUserPassword`. | All four actions are tenant-bound; the active branch is selected by the `action` discriminator in the input schema. |
| `enroll-student` (ex `onboard-entity`) | `StudentRepository.getStudentRegistrationOptions` (resolves `genderId` / `studentCategoryId` / `classId` / `sectionId` from human names — replaces B11's raw Drizzle); `StudentRepository.createStudent`; `AuthRepository.createUser`. | `studentRegistrationOptions` is now the single source of truth for class / section / category lookups. |
| `update-student-biodata` (ex `patch-entity`) | `StudentRepository.updateStudent` on columns `firstName`, `lastName`, `dateOfBirth`, `genderId`, `studentCategoryId`, `rollNo`. | The schema does **not** allow `classId` / `sectionId` / `schoolId` / `staffId` / `userId` renames. Protected fields rejected with `PROTECTED_FIELD`. |
| `transfer-student` (ex `assign-entity`) | `StudentRepository.updateStudentClassSection({ studentId, targetClassId, targetSectionId })` after `validateWorkspaceLock(tenantContext, student.classId, student.sectionId)` (B9). | Adds the source-side workspace lock. |
| `search-school-directory` (ex `search-entity`) | `StudentRepository.getStudentsByClassSection` and `StaffRepository.getStaffByName`; `input.classId ?? tenantContext.classId` (B8). | Returns up to 10 candidates; teacher disambiguates. |
| `manage-academic-records` (ex `manage-results`) | `StudentRepository.getRollNoAndAdmissionNo` (B4), `ResultRepository.batchUpsertMarkRecords` (with `teacherId: tenantContext.staffId` and `schoolId: tenantContext.schoolId` per B5/B6), `ResultRepository.upsertAttendance`, `ResultRepository.upsertTeacherRemark`, `ResultRepository.upsertStudentRatings`. | `MISSING_EXAM_CONTEXT` guard on all four branches (B7). |
| `switch-academic-context` (ex `switch-workspace`) | Writes to `requestContext` only (no DB write). Calls `validateWorkspaceLock(tenantContext, input.classId, input.sectionId)` before flipping. | Pure context mutation. |
| `extract-document` | `AssessmentService.runExtractionForTool` (B1, B3). | Reads `mastra_runs` from `mastra.db`; writes a staging record in MySQL. |
| `generate-results` (NEW) | `AssessmentService.runGenerateForTool` → resolves `mastra.getWorkflow('generate-workflow')` and invokes `processFileWorkflow` for each file (B12). | Requires the `result-mapper` agent to be registered in `src/lib/server/mastra/agents/`; returns `MISSING_AGENT` until then. |
| `validate-extraction` | `AssessmentService.validateExtractionForTool` (B3). | Resumes a suspended `mastra_runs` row. |
| `publish-results` | `AssessmentService.publishResultsForTool` (B3). | Triggers PDF generation + SMTP; updates the student timeline. |

### 10.3 Slash command refactor

User-facing tokens. Single verbs where possible; mapped directly to repository actions.

| Skill | Slash commands | Description |
|---|---|---|
| `onboarding` | `/admit` *(new)* | "Start conversational registration flow for new admissions." |
| `onboarding` | `/enroll` | "Enroll student in a specific class." |
| `onboarding` | `/transfer` *(new — replaces `/assign`)* | "Transfer student between classes/sections." |
| `grading` | `/mark` | "Add exam marks." |
| `grading` | `/grade` | "Submit academic grade." |
| `grading` | `/attendance` | "Record student attendance." |
| `gov` | `/update` | "Update student bio-data (name, DOB, roll number)." |
| `gov` | `/suspend` | "Deactivate a student or staff account (`active: false`)." |
| `gov` | `/delete` *(new)* | "Permanently remove a student or staff record from the system." |
| `gov` | `/password` *(new — replaces `/reset`)* | "Generate and reset a user's authentication password." |
| `gov` | `/ban` | "Revoke active system access (deactivate). *Deprecated alias for `/suspend`*." |
| `gov` | `/edit` | "Edit existing records. *Alias for `/update`*." |
| `gov` | `/rename` | "Rename a student. *Alias for `/update` (name-only)*." |
| `assistant` | `/extract` | "Extract data via Mistral OCR." |
| `assistant` | `/validate` | "Human-in-the-loop review." |
| `assistant` | `/generate` | "Generate a structured result from a transcript." |
| `assistant` | `/publish` | "Publish final grade reports." |
| `default` | `/search` | "Database entity search by name or admission number." |
| `default` | `/find` | "Alias for entity lookup. *Alias for `/search`*." |
| `default` | `/switch` | "Change the active class/section context." |
| `default` | `/context` *(new — replaces `/status`)* | "Retrieve the current Academic Year, Term, Class, and Section boundaries." |
| `default` | `/status` | "Show active class and term. *Alias for `/context`*." |

Net change: 20 commands → 22 commands; 4 command renames (`/assign`→`/transfer`, `/reset`→`/password`, `/status`→`/context`, plus the implicit `/extract` and `/validate` clarification); 4 new commands (`/admit`, `/delete`, `/password`, `/context`); 4 deprecated aliases retained for one minor version (`/ban`, `/edit`, `/rename`, `/find`, `/status`).

### 10.4 Skill manifest updates

For every `src/lib/server/mastra/skills/*.skill.md`:
1. Update `tools:` array in YAML frontmatter with the new tool ids from §10.1.
2. Update the `## Active Toolset` documentation block to the new ids and descriptions.
3. Update the `## Slash Commands` section to the tokens in §10.3.

Example diff for `onboarding.skill.md`:

```yaml
# before
tools:
  - onboard-entity
  - assign-entity

# after
tools:
  - enroll-student
  - transfer-student
```

```markdown
# before
## Slash Commands
- `/register`, `/enroll`, `/assign`

# after
## Slash Commands
- `/admit`, `/enroll`, `/transfer`
```

Example diff for `default.skill.md`:

```yaml
# before
tools:
  - search-entity
  - switch-workspace
  - system-status

# after
tools:
  - search-school-directory
  - switch-academic-context
  - get-academic-context
```

### 10.5 New TDD slice for the renames

**Slice 8 — Tool and slash-command renames (depends on Slices 0–7 passing)**
**Files touched:**
- `src/lib/server/mastra/tools/index.ts` — rename every `createTool({ id, description, inputSchema, execute })` to the new id and new description from §10.1; rename every `*Logic` / `*Schema` export alias. Keep old names as `export const searchEntityTool = searchSchoolDirectoryTool` style aliases for one minor version.
- `src/lib/server/mastra/tools/{core,grading,onboard,gov,workflow}-tools.ts` — rename schema identifiers, keep the `execute` body unchanged.
- `src/lib/server/mastra/gateway.ts` — update `TOOL_MAP` keys (line 21-30) to the new ids; keep old keys as `Object.assign` aliases.
- `src/lib/server/mastra/skills/{onboarding,grading,gov,default,assistant,supervisor}.skill.md` — update `tools:` and `## Slash Commands` per §10.4.
- `src/lib/server/helpers/chat-helper.ts` — update `skillCommandMap` (§10.3 tokens); add deprecated alias map (`/assign`→`/transfer`, `/reset`→`/password`, `/status`→`/context`, `/ban`→`/suspend`, `/edit`→`/update`, `/rename`→`/update`, `/find`→`/search`); log a `console.warn` when an alias is used.
- `src/lib/components/chat/CommandDropdown.svelte` — replace `commands` array (lines 29-154) with the 22 entries in §10.3.
- `src/lib/server/mastra/__tests__/preservation.property.test.ts` — replace the `SLASH_COMMANDS` constant (lines 82-91) with the new 22 tokens.
- `src/lib/server/mastra/__tests__/tool-descriptions.test.ts` (new, from §9.5) — assert the description text in §10.1, the id matches the skill manifest, and no implementation-jargon tokens appear in the description.

**Why this slice is its own commit:** the renames are pure identifier swaps with no behavioural change. The test surface for Slices 0–7 must continue to pass, and the alias layer keeps backward compatibility for any internal call sites that have not yet been migrated.

### 10.6 Acceptance criteria additions

Append to §7:

9. `pnpm test src/lib/server/mastra/__tests__/tool-descriptions.test.ts` passes and asserts the §10.1 description text, the §10.3 slash-command token list, and the absence of implementation-jargon tokens.
10. `grep -RIn "onboard-entity\|patch-entity\|assign-entity\|search-entity\|switch-workspace\|system-status\|manage-results\|manage-access" src/lib/server/mastra` returns **only** the legacy alias exports in `tools/index.ts` and the deprecated-alias log in `chat-helper.ts`. No other live reference.
11. `pnpm test src/lib/server/mastra/__tests__/preservation.property.test.ts` passes after the `SLASH_COMMANDS` constant is updated.
12. Manual: type `/transfer @alice 9A` and confirm the new `transfer-student` tool fires (not the old `assign-entity`). Repeat with `/password @bob` and confirm the new `manage-account-access` tool fires (not the old `manage-access`).

---

## 11. Cross-references

- §9 (frontend audit, description rewrites) is now **superseded by §10.1 + §10.3 for the description text and slash-command tokens**. The B13, B14, and B11.5 findings remain valid and their fixes are now distributed across Slices 2, 8.
- §3.1 (new `AssessmentService` methods) is unchanged. The `*ForTool` methods are the bridge between the renamed tools in §10.1 and the existing workflow Step files.
- §6 (risk register) acquires one new row in the next revision: "Renames break every external caller of `TOOL_MAP` keys". Mitigation: one-minor-version alias layer in `tools/index.ts` and `gateway.ts` (Slice 8).
- §4 Slice 2 must now produce four workflow tool exports (`extract-document`, `validate-extraction`, `publish-results`, **`generate-results`**) matching the names in §10.1, not the previous "extract / validate / publish" plan summary.

---
