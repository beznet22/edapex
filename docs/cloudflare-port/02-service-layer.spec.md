# 02 — Service Layer Specification

Orchestration layer for the EdApex Hono API on Workers with D1. Covers **only the services that touch catalog tables**; the four app-db services are excluded by measurement, not by preference.

---

## 1. Scope

### 1.1 In scope — measured catalog reach

| Service | Lines | Async methods | Reaches catalog tables via | Status |
|---|---|---|---|---|
| `assessment.service.ts` | 1,185 | 20 | `StudentRepository`, `ResultsRepository`, `TimelineRepository`, `StaffRepository` | redesign + split |
| `auth.service.ts` | 732 | 16 | `authRepo` → `users`, `sm_staffs`; sessions move to the new auth tables | redesign |
| `assessment-publisher.service.ts` | 371 | 4 | repositories + `smSchools` directly | merge into assessment |
| `settings.service.ts` | 326 | 11 | `sm_general_settings`, `sm_academic_years`, `sm_exam_types` | split three ways |
| `assessment-ocr.service.ts` | 278 | 2 | `ResultsRepository`, `StudentRepository` | merge into assessment |
| **Total** | **2,892** | **53** | | |

### 1.2 Out of scope — measured zero catalog references

| Service | Lines | Why excluded |
|---|---|---|
| `potluck.service.ts` | 506 | Operates on `encrypted_credentials` in app-db; `node:crypto` only |
| `mistral-ocr.service.ts` | 335 | External API client; no database access |
| `ocr-batch.service.ts` | 326 | app-db OCR pipeline |
| `user-donation.service.ts` | 146 | app-db |

These belong to a future app-db / edge-services spec. `mistral-ocr.service.ts` is **wrapped behind an `OcrClient` port** rather than redesigned, so the in-scope OCR service does not depend on its implementation.

---

## 2. Principles

Each principle names the concrete violation it removes.

### P1 — Services orchestrate; they do not compute, persist, or fetch

A service coordinates repositories, ports, and pure domain functions. It contains no SQL, no filesystem calls, and no algorithmic logic that could be tested without I/O.

*Violation:* `doProcessMarks` (marks aggregation) and `getClassAverages` (averaging) are inside a service that also performs database writes — [assessment.service.ts:908](../../src/lib/server/service/assessment.service.ts#L908), [:1078](../../src/lib/server/service/assessment.service.ts#L1078).

### P2 — Ports and adapters at the edge

Anything external — email, OCR, report-settings storage — is an interface in `ports/` with one implementation in `adapters/`. Services depend on the interface.

*Violation:* report settings are written to the filesystem directly — [settings.service.ts:62](../../src/lib/server/service/settings.service.ts#L62), [:103](../../src/lib/server/service/settings.service.ts#L103).

### P3 — One context, one composition root

`ServiceContext { repos, ports, config, cache, logger }` is built once per request. `createService(Class, ctx)` is the only construction path.

*Violation:* five different patterns coexist — `new XService(provider)`, `new SettingsService(schoolId)`, `static async build()` calling `getDatabase()`, module singletons, and services constructing services.

### P4 — No service imports another service class

Composition happens in the context or in a use-case that receives interfaces. Service-to-service calls are how `assessment` grew to 1,185 lines.

*Violation:* [assessment-publisher.service.ts:92](../../src/lib/server/service/assessment-publisher.service.ts#L92) constructs `new AssessmentService(provider)`; [assessment.service.ts:557](../../src/lib/server/service/assessment.service.ts#L557) constructs `new SettingsService(schoolId)`.

### P5 — Delete thin passthroughs

A method whose body is a single repository call is not a service method. Routes call the repository.

*Violation:* six methods in `assessment.service` forward directly to `ResultsRepository` (§6).

### P6 — Mirror the repository aggregates

`attendance/`, `assessment/`, `settings/` exist in both layers with the same ownership. A table belongs to one aggregate at every layer.

*Decision:* `feedback` stays inside `assessments/` on both layers — the data (`teacher_remarks`, `student_ratings`) is exam-term scoped.

### P7 — No hidden I/O and no module-scope state

No `fs`, no `node:crypto` in the ported path, no mutable module variables. Workers isolates are per-location and evictable, so module state is not shared state.

*Violation:* `const failedAttempts = new Map()` at [auth.service.ts:34](../../src/lib/server/service/auth.service.ts#L34), and `reportCache` at [settings.service.ts:77](../../src/lib/server/service/settings.service.ts#L77).

### P8 — ~400 lines per file

Beyond that, a service is covering more than one responsibility. Pure `domain/` modules target **~200 lines** because they carry no I/O; route modules are governed separately by [03 H10](./03-http-layer.spec.md).

*Violation:* `assessment.service.ts` at 1,185 lines.

### Renaming policy

Method and module renames are allowed in this port — several current names predate the target boundaries. A rename is accepted only after a **critical and exhaustive contextual audit**:

1. Every call site is enumerated — repository, service, route, Mastra tool, test — and updated in the same change.
2. The old → new mapping is recorded in [01b](./01b-repository-migration-map.md) so traceability survives the rename.
3. The rename is behaviour-preserving; a semantic change ships as a separate commit.
4. If the audit finds ambiguity (near-identical names, or a name meaning different things to different callers), the semantics are resolved before any rename.

A rename without that audit is rejected. The mapping entry is the evidence that it happened.

---

## 3. Dependency matrix

| From | May depend on | Must never depend on |
|---|---|---|
| `services/*` | `repository/*`, `ports/*`, `domain/*`, `context/*` | another service class, `getDatabase`, `fs`, `node:crypto` |
| `adapters/*` | `ports/*`, external SDKs | repositories, services |
| `domain/*` | nothing | anything |
| `ports/*` | nothing | anything |
| `context/*` | repositories, ports, config | services, adapters' implementations |

Allowed at composition time only: `context` may import adapters to wire ports; nothing else may.

---

## 4. Target tree

```text
src/lib/server/services/
  context/
    service-context.ts          // ServiceContext + ServiceCache
    create-service-context.ts   // per-request composition root
  ports/
    email-sender.port.ts
    ocr-client.port.ts
    report-settings-store.port.ts
    clock.port.ts
  adapters/
    cloudflare-email.adapter.ts   // Workers Email binding
    mistral-ocr.adapter.ts        // wraps the existing MistralOcrService
    d1-report-settings.adapter.ts // replaces the filesystem store
  domain/
    marks.ts                      // doProcessMarks (pure)
    grades.ts                     // getClassAverages, grade banding (pure)
    ocr-mapping.ts                // extracted payload → marks draft (pure)
  assessment/
    entry.service.ts              // upsertStudentResult, upsertMarksheet
    query.service.ts              // getStudentResult, getTranscript, getObjectives
    publish.service.ts            // publishResults, publishTranscript, isEmailAlreadySent
    roster-query.service.ts       // getMappingData (composed reads)
    feedback.service.ts           // teacher remarks, student ratings
    ocr.service.ts                // runExtraction, getExtractedAssessment
    index.ts
  attendance/
    attendance.service.ts         // upsertAttendance
    index.ts
  settings/
    general.service.ts            // get/save general settings
    academic.service.ts           // academic years + exam types
    report.service.ts             // get/save report settings via port
    index.ts
  auth/
    auth.service.ts               // claim/login, updateProfile
    session.service.ts            // getSession, refresh, logout*
    rate-limit.service.ts         // D1-backed attempt limits
    index.ts
  authorization/
    authorization.service.ts      // isAdmin
    index.ts
  index.ts
```

### 4.1 Ports

| Port | Method | Adapter | Replaces |
|---|---|---|---|
| `EmailSender` | `send(template, to, data)` | Cloudflare Email binding | implicit email calls in publishing |
| `OcrClient` | `extract(payload)` | wraps `MistralOcrService` | direct service dependency |
| `ReportSettingsStore` | `get(schoolId)`, `save(schoolId, settings)` | D1 adapter | `fs/promises` JSON files |
| `Clock` | `now()` | system clock | `Date.now()` scattered through services |

### 4.2 Service context

```ts
interface ServiceContext {
  readonly repos: ScopedRepositoryProvider;
  readonly ports: { email: EmailSender; ocr: OcrClient; reportSettings: ReportSettingsStore; clock: Clock };
  readonly config: ConfigurationCache;   // per-request, filled once
  readonly logger: Logger;
}
```

`createServiceContext(env, tenant)` is the only place adapters are instantiated. It runs once per request in Hono middleware.

## 5. Method mapping

All 53 methods, each exactly once.

### 5.1 `assessment.service.ts` (20)

| Method | Destination | Note |
|---|---|---|
| `publishResults` | `assessment/publish.service` | Merges with the publisher's duplicate |
| `isEmailAlreadySent` | `assessment/publish.service` | Merges with the publisher's duplicate |
| `upsertStudentResult` | `assessment/entry.service` | |
| `upsertMarksheet` | `assessment/entry.service` | |
| `getStudentResult` | `assessment/query.service` | |
| `getTranscript` | `assessment/query.service` | |
| `getObjectives` | `assessment/query.service` | Keeps the `NURSERY` guard, so it is not a passthrough |
| `getMappingData` | `assessment/roster-query.service` | Composes five repository reads; must use `db.batch` (O7) |
| `upsertTeacherRemark` | `assessment/feedback.service` | |
| `upsertStudentRatings` | `assessment/feedback.service` | |
| `upsertAttendance` | `attendance/attendance.service` | Attendance is a separate aggregate |
| `doProcessMarks` | `domain/marks.ts` | Pure computation — no I/O |
| `getClassAverages` | `domain/grades.ts` | Pure computation over supplied rows |
| `assignSubjects` | **deleted** | Single repository call |
| `getClassSections` | **deleted** | Single repository call |
| `getAssignedClassSection` | **deleted** | Single repository call |
| `getStaffByClassSection` | **deleted** | Single repository call |
| `getStudentsByStaffId` | **deleted** | Single repository call |
| `getStudentsByClassSection` | **deleted** | Single repository call |
| `getAssignedSubjects` | **deleted** | Single repository call |

### 5.2 `auth.service.ts` (16)

| Method | Destination | Note |
|---|---|---|
| `login` | `auth/auth.service` | Replaced by the claim flow during cutover, then by social/magic link |
| `getSession` | `auth/session.service` | |
| `refresh` | `auth/session.service` | |
| `logout` | `auth/session.service` | |
| `logoutAll` | `auth/session.service` | |
| `logoutMobile` | `auth/session.service` | |
| `refreshMobile` | `auth/session.service` | |
| `updateProfile` | `auth/profile.service` | Writes `users` |
| `isAdmin` | `authorization/authorization.service` | Authorization, not authentication |
| `subscribeToPush` | **out of port scope** | app-db notification concern |
| `sendPushNotification` | **out of port scope** | app-db notification concern |
| `signup` | **retired** | No self-registration in the target model ([04 §3.2](./04-auth-identity.spec.md)) |
| `changePwd` | **retired** | Passwordless target |
| `requestReset` | **retired** | Replaced by magic link ([04 §3.1](./04-auth-identity.spec.md)) |
| `resetPwd` | **retired** | Replaced by magic link |
| `verifyEmail` | **retired** | Google/magic-link verification replaces it |

### 5.3 `settings.service.ts` (11)

| Method | Destination |
|---|---|
| `getGeneralSettings` | `settings/general.service` |
| `saveGeneralSettings` | `settings/general.service` |
| `getReportSettings` | `settings/report.service` (via `ReportSettingsStore`) |
| `saveReportSettings` | `settings/report.service` (via `ReportSettingsStore`) |
| `listAcademicYears` | `settings/academic.service` |
| `getActiveAcademicYear` | `settings/academic.service` |
| `createAcademicYear` | `settings/academic.service` |
| `setActiveAcademicYear` | `settings/academic.service` |
| `listExamTypes` | `settings/academic.service` |
| `createExamType` | `settings/academic.service` |
| `toggleExamTypeActive` | `settings/academic.service` |

### 5.4 `assessment-publisher.service.ts` (4)

| Method | Destination | Note |
|---|---|---|
| `publishResults` | `assessment/publish.service` | **Duplicate of the assessment implementation** — one survives |
| `publishTranscript` | `assessment/publish.service` | |
| `isEmailAlreadySent` | `assessment/publish.service` | **Duplicate** — one survives |
| `resolveSchoolIdentity` | `settings/general.service` | School identity, not publishing; publish receives it as input rather than calling a service |

### 5.5 `assessment-ocr.service.ts` (2)

| Method | Destination | Note |
|---|---|---|
| `runExtraction` | `assessment/ocr.service` | Calls `OcrClient` port |
| `getExtractedAssessment` | `assessment/ocr.service` | Reads persisted extraction state |

---

## 6. Runtime replacements

| Current | Replacement | Principle | Why |
|---|---|---|---|
| `fs/promises` JSON store ([settings.service.ts:62](../../src/lib/server/service/settings.service.ts#L62), [:103](../../src/lib/server/service/settings.service.ts#L103)) | `ReportSettingsStore` → D1 adapter | P2, P7 | No filesystem on Workers |
| `process.cwd()` paths ([settings.service.ts:62](../../src/lib/server/service/settings.service.ts#L62)) | Binding-derived identifiers | P7 | No process filesystem |
| `reportCache` module `Map` ([settings.service.ts:77](../../src/lib/server/service/settings.service.ts#L77)) | `ServiceContext.cache` (request-scoped) | P3, P7 | Isolate-local cache is unreliable |
| `failedAttempts` module `Map` ([auth.service.ts:34](../../src/lib/server/service/auth.service.ts#L34)) | `auth_rate_limits` table ([04 §2](./04-auth-identity.spec.md)) | P7 | State must survive isolate eviction |
| `setTimeout` cleanup ([auth.service.ts:143](../../src/lib/server/service/auth.service.ts#L143)) | none — expiry is data, not a timer | P7 | Timers die with the isolate |
| 1 s sleep on failed login ([auth.service.ts:164](../../src/lib/server/service/auth.service.ts#L164)) | `RateLimitError` rejection | P1 | Wastes wall-clock for no added protection |
| `bcrypt-ts` via `hashPwd`/`checkPwd` ([utils.ts:10](../../src/lib/server/helpers/utils.ts#L10)) | shared SHA-256 digest during claim ([04a §2](./04a-auth-cutover.spec.md)); none afterwards | P1 | No KDF on the login path; measured 0.004 ms vs 6.1 ms |
| `new AssessmentService(provider)` ([assessment-publisher.service.ts:92](../../src/lib/server/service/assessment-publisher.service.ts#L92)) | injected interface or route composition | P4 | Service-to-service coupling |
| `new SettingsService(schoolId)` ([assessment.service.ts:557](../../src/lib/server/service/assessment.service.ts#L557)) | `ServiceContext.config` | P4 | Same |
| `export const auth = new AuthService()` ([auth.service.ts:732](../../src/lib/server/service/auth.service.ts#L732)) | `createService(AuthService, ctx)` | P3 | Module singleton |

### 6.1 Report-settings migration

Existing files live at `<cwd>/data/report-settings/<schoolId>.json`. Migration is one pass:

1. Read every file; assert the count matches the school list.
2. Insert one row per school into `report_settings` (school_id PK, payload JSON, updated_at).
3. Re-read and compare against the file content.
4. Only then remove the filesystem code path.

---

## 7. Errors owned by this layer

Repositories raise `Db*` errors ([01 §7](./01-repository-layer.spec.md)); services translate them and raise the rest. HTTP middleware maps both using the envelope in [01 §7](./01-repository-layer.spec.md#7-errors).

| Error | HTTP | `code` | Raised when |
|---|---|---|---|
| `ValidationError` (zod) | 400 | `VALIDATION_FAILED` | Input fails schema validation; includes the field path |
| `AuthError` | 401 | `UNAUTHENTICATED` | Missing, expired, or revoked session |
| `PermissionError` | 403 | `FORBIDDEN` | Authenticated but not allowed |
| `WorkspaceMismatchError` | 403 | `TENANT_MISMATCH` | Teacher acting on a class they do not own |
| `AmbiguousEmailError` | 409 | `AMBIGUOUS_EMAIL` | More than one account shares a verified email ([04 §5](./04-auth-identity.spec.md)) |
| `RateLimitError` | 429 | `RATE_LIMITED` | Attempt budget exhausted |
| `PortError` | 502 | `UPSTREAM_FAILURE` | Email or OCR adapter failed after retries |

Rules:
- Services never construct HTTP responses and never import the HTTP layer.
- A `DbEntityNotFoundError` crossing a service boundary is either translated to the domain equivalent or rethrown unchanged — never swallowed into an empty result.

---

## 8. Hazard inventory

| Hazard | Where it exists today | Principle | Removal |
|---|---|---|---|
| `fs` | `settings.service.ts` report store | P2 | D1 adapter + one-time import (§6.1) |
| `module-singleton` | `auth.service.ts:732`, `MistralOcrService.instance`, `OcrBatchService.instance` | P3 | `createService` |
| `in-memory-state` | `failedAttempts`, `reportCache` | P7 | D1 table / request cache |
| `direct-db` | `settings.service.ts:141`, `assessment-ocr.service.ts:275`, `assessment-publisher.service.ts:112` | P1 | repositories via context |
| `service-to-service` | publisher → assessment, assessment → settings | P4 | injected interface or route composition |
| `oversized` | `assessment.service.ts` 1,185 lines | P8 | four-way split (§5.1) |
| `duplicate-logic` | `publishResults` / `isEmailAlreadySent` in two services | P1 | single implementation |
| `thin-passthrough` | seven assessment methods | P5 | deleted |
| `no-kdf-budget` | bcrypt-ts on the login path | P1 | shared digest ([04a](./04a-auth-cutover.spec.md)) |

---

## 9. Testing and acceptance

### 9.1 Test layers

| Layer | Setup | Covers |
|---|---|---|
| Domain | no runtime, no D1 | `marks.ts`, `grades.ts`, `ocr-mapping.ts` |
| Service | fake ports, in-memory repositories | orchestration, error translation, query budgets |
| Parity | local D1 | `doProcessMarks` output matches the current implementation before deletion |
| Boundary | import graph | no `getDatabase`, `fs`, `node:crypto`, or service-to-service imports |

### 9.2 Mandatory tests

1. **Domain parity** — `doProcessMarks` produces byte-identical marks/results payloads for a fixture corpus before the old method is removed.
2. **Port failure** — email or OCR adapter throws: the service surfaces `PortError` and leaves no partial write.
3. **No module state** — a static check fails if a `new Map`/`new Set` appears at module scope in `services/`.
4. **Boundary** — `services/**` may not import `getDatabase`, `fs`, `node:crypto`, or another `*.service.ts` in a different folder.
5. **Query budget** — each use-case asserts its statement count against the declared budget.

### 9.3 Acceptance criteria

- [ ] Five in-scope services split into the §4 tree; no file exceeds 400 lines
- [ ] 53 methods accounted for: 30 moved, 7 deleted, 5 retired, 2 out of scope, plus the merged duplicates
- [ ] No module-scope mutable state in `services/`
- [ ] No `fs`, `getDatabase`, or `node:crypto` import in `services/`
- [ ] `ReportSettingsStore` has exactly one adapter; filesystem path removed after import
- [ ] `auth_rate_limits` replaces `failedAttempts`
- [ ] `ServiceContext` constructed exactly once per request
- [ ] Boundary test green

### 9.4 What this spec does not cover

HTTP routes and middleware are `03`; schema translation and cutover execution are `05`; the four excluded app-db services are a separate spec.

