# PROGRESS — Cloudflare port

Live status for the implementation phases defined in [ROADMAP.md](./ROADMAP.md). The roadmap says **what** each phase is; this file says **where we are**.

Port code lands in [`apps/api/`](../../apps/api/AGENTS.md).

## How to update this file

1. Update it **in the same pull request** as the phase work — not afterwards.
2. A phase may only move to `done` when its gate output is pasted into the tables below.
3. Keep entries short: one row per phase, one line per change-log entry.
4. `blocked` requires a named blocker and an owner; `partial` requires what is missing.
5. Never delete history from the change log.

## Status legend

| Status | Meaning |
|---|---|
| `not started` | No work merged |
| `in progress` | Branch open, gate not yet passed |
| `partial` | Some scope merged; remainder listed |
| `blocked` | Waiting on a decision or external input |
| `done` | Gate passed and pasted |

## Current focus

**Phase 5 — Auth cutover flow.** Implemented on `phase-5-auth` (PR into `phase-4-http`); awaiting the `port` check. Phase 6 (archive and retrieval) is next.

## Phase status

| Phase | Name | Status | Owner | Started | Completed | Gate evidence |
|---|---|---|---|---|---|---|
| 0 | Scaffolding and guards | done | Kimchi | 2026-11-05 | 2026-11-05 | PR #1 check `port` green ([run 42083953037](https://github.com/beznet22/edapex/actions/runs/42083953037)): typecheck, boundary + self-test, Workers test, D1 apply, both verifiers. Local: `/health` 200. |
| 1 | D1 schema and migrations | done | Kimchi | 2026-11-06 | 2026-11-06 | PR #2 check `port` green ([run 42181282784](https://github.com/beznet22/edapex/actions/runs/42181282784)): typecheck, boundaries, 17 Workers-pool tests, local D1 apply, drift, both verifiers. Gate: 74 tables (62 legacy + 12 registered), 226 recovered + 5 spec indexes, every table ≤100 columns, `PRAGMA foreign_key_check` zero rows. |
| 2 | Repository layer | done | Kimchi | 2026-11-06 | 2026-11-06 | PR #3 check `port` green ([run 42233886498](https://github.com/beznet22/edapex/actions/runs/42233886498)): typecheck, boundaries, repository rules + self-test, map completeness, 139 Workers-pool tests, local D1 apply, drift, both verifiers. Gate: 108 `01b` rows (103 implemented + 4 retired + 2 non-async), zero `db.transaction(`, zero `any`, 66 guarded files ≤300 lines, tenant-isolation suite green. |
| 3 | Service layer | done | Kimchi | 2026-11-06 | 2026-11-06 | PR #4 check `port` green ([run 42265759924](https://github.com/beznet22/edapex/actions/runs/42265759924)): typecheck, 292 tests (55 files), boundaries, repository + service guards (53 service files, 45-file tree), method map 53/53 (37 mapped + 2 merged + 7 deleted + 5 retired + 2 out of scope), 77 tables, drift clean, both verifiers, report-settings import 1 file → 1 row verified. |
| 4 | HTTP layer | done | Kimchi | 2026-11-06 | 2026-11-06 | PR #5 check `port` green ([run 42280594997](https://github.com/beznet22/edapex/actions/runs/42280594997)): typecheck, 399 tests / 80 files, boundary/repository/service/HTTP guards + self-tests, repository map 108/108, service map 53/53, D1 apply, drift, deploy dry-run, both verifiers. Gate: 19 route modules / 42 handlers, 422 byte-compatible, `hc<AppType>` type test, CORS/tenant/dropped-route suites green. |
| 5 | Auth cutover flow | in progress | Kimchi | 2026-11-06 | — | Local gate green: typecheck, 505 tests (100 files), all guards + self-tests, 0002 apply + drift, deploy dry-run, both verifiers. Gate: claim → Google → session on local D1, 409 `AMBIGUOUS_EMAIL`, reissue revokes sessions, claim CPU 0.055 ms/attempt. PR open into `phase-4-http`; CI evidence to follow. |
| 6 | Archive and retrieval | not started | — | — | — | — |
| 7 | Migration execution | not started | — | — | — | — |
| 8 | Cutover | not started | — | — | — | — |
| 9 | Post-cutover | not started | — | — | — | — |

## Gate checklists

### Phase 0 — Scaffolding
- [x] `wrangler dev` serves `/health`
- [x] D1 binding declared; local migration applies
- [x] CI runs typecheck, tests, both verifiers
- [x] Import-boundary test scaffolded

### Phase 1 — Schema
- [x] 62 legacy tables + redesigned tables created
- [x] Every table ≤100 columns
- [x] 226 secondary indexes declared
- [x] `PRAGMA foreign_key_check` returns zero rows

### Phase 2 — Repositories
- [x] All 108 `01b` method rows accounted for: 103 implemented (107 unique names, `getById` maps to two aggregates), 4 retired (`createRefreshToken`, `validateRefreshToken`, `revokeRefreshToken`, `updateUserPassword`), plus 2 non-async methods missed by the generator (`getClassSections`, `getStuendtsByParentId`)
- [x] Four retired auth methods have no target table/flow
- [ ] Seven assessment-service passthroughs: carried to Phase 3 (they are service methods, not repository methods) — see decision log
- [x] Tenant-isolation test per public read (two-school fixture suite)
- [x] No `db.transaction(`, no `any`, files within the 300-line cap
- [x] Barrel completeness and cross-aggregate import rules enforced by `check:repository`

### Phase 3 — Services
- [x] 53 methods mapped per `02`: 37 unique + 2 duplicate merges + 7 deleted + 5 retired + 2 out of scope
- [x] `ServiceContext` built once per request by `createServiceContext`; `createService` is the only construction path
- [x] No `getDatabase` / `fs` / `node:crypto` / service-to-service imports; `check:services` + self-test
- [x] Report-settings imported from JSON and verified by count (1 file → 1 row, payload deep-equal)

### Phase 4 — HTTP
- [x] Service-led surface: 19 route modules / 42 handlers; every route maps to a named service method; legacy URL shapes absent
- [x] Flat envelope; 422 body byte-compatible and without `requestId`
- [x] `AppType` + `hc<AppType>` type test green
- [x] CORS, preflight-before-auth, public isolation, tenant isolation, middleware order and dropped-route tests green

#### Phase 4 service-led route matrix

| Aggregate | Routes | Service methods |
|---|---|---|
| Auth / session / profile | `POST /auth/login`, `POST /auth/mobile/login`, `POST /auth/logout`, `POST /auth/logout-all`, `POST /auth/refresh`, `POST /auth/mobile/refresh`, `POST /auth/mobile/logout`, `GET /me`, `PATCH /me` | `AuthService.login`; `SessionService` refresh/logout/logoutAll/mobile; `ProfileService.updateProfile` |
| Students | `GET /students`, `PATCH /students/:id/status`, `POST /students/:id/promotions`, `POST /students/:id/demotions`, `PUT /students/:id/photo`, `POST /students/:id/photo/claim`, `DELETE /students/:id/photo` | `StudentSearchService`, `StudentLifecycleService`, `StudentPhotoService` |
| Academics / attendance | `POST /subjects/assignments`, `PUT /attendance` | `SubjectAssignmentService`, `AttendanceService` |
| Assessments | `POST /assessments/marksheets`, `PUT /assessments/results`, `GET /assessments/results/:identifier/:examId`, `GET /assessments/transcripts/:studentId/:academicId`, `PUT /assessments/feedback/remarks`, `PUT /assessments/feedback/ratings`, `POST /assessments/ocr/extractions`, `DELETE /assessments/ocr/cache`, `POST /assessments/captures`, `POST /assessments/captures/:id/confirmation`, `POST /assessments/publish/results`, `POST /assessments/publish/transcript` | `AssessmentEntryService`, `AssessmentQueryService`, `AssessmentFeedbackService`, `AssessmentOcrService`, `MarksheetCaptureService`, `AssessmentPublishService` |
| Settings | `GET/PATCH /settings/general`, `GET/POST /settings/academic-years`, `GET/PUT /settings/academic-years/active`, `GET/POST /settings/exam-types`, `PATCH /settings/exam-types/:id/active`, `GET/PATCH /settings/report-templates` | `GeneralSettingsService`, `AcademicSettingsService`, `ReportSettingsService` |
| Public | `GET /health`, `GET /uploads/students/:file` | liveness; existing R2 photo route |

**Dropped:** `/api/parents/connect-telegram`, `/api/results/generate-pdf`, `/api/demo/*`, `/api/[authType]`, `/google`. **Deferred:** `/claim` and the Google callback (Phase 5), `/r/:token` (Phase 6). PDF rendering is client-side via ironpress; the API keeps result/transcript email publishing.

### Phase 5 — Auth cutover
- [x] `/claim` end-to-end on local D1 — `tests/http/claim.test.ts` (claim → Google → session → `/me`)
- [x] Duplicate email returns `409 AMBIGUOUS_EMAIL` — HTTP, service and repository suites
- [x] Student codes issue / reissue / revoke — `tests/http/student-codes.test.ts`; reissue deletes the student's sessions
- [x] Claim flow under 10 ms CPU on `wrangler dev` — 0.055 ms/attempt in the Workers pool; `wrangler dev` handler p50 ~17 ms (D1 I/O + dev proxy), see the decision log

### Phase 6 — Archive
- [ ] Archive/restore round-trip on a fixture
- [ ] Checksum mismatch quarantines without aborting
- [ ] Published versions immutable; supersede creates *n+1*
- [ ] Wipe blocked without the second admin token

### Phase 7 — Migration
- [ ] Integrity gate zero (or audited waiver)
- [ ] Row counts and checksums reconciled
- [ ] 681 current records: 654 promoted + 24 DAYCARE + 3 quarantined
- [ ] 463 subject assignments; 7 grade bands; readiness test green

### Phase 8 — Cutover
- [ ] Final delta loaded; verification repeated
- [ ] Rollback drilled
- [ ] Monitoring dashboard and on-call briefed

### Phase 9 — Post-cutover
- [ ] `/claim` removed on the announced date
- [ ] Password digests nulled, column dropped later
- [ ] Retention sweep dry-run matches expectations
- [ ] Session archives 1–4 manifest verified
- [ ] Workspace package wiring verified (roadmap Part 5); `apps/api/` remains the in-repo **EdApex API service**

## Change log

| Date | Phase | Change | Agent |
|---|---|---|---|
| 2026-11-05 | — | Spec suite, roadmap, and progress tracker created; no implementation started | — |
| 2026-11-05 | 0 | Worker scaffold, `/health`, D1 binding + `0000_scaffold`, vitest Workers harness, import-boundary guard, CI workflow; local gates green, CI pending push | Kimchi |
| 2026-11-05 | 0 | Phase 0 gate passed: CI run 42083953037 green; PR #1 updated with the evidence | Kimchi |
| 2026-11-05 | — | Renamed the port package `cloudflare/` → `api/`; updated specs, verifier paths, and CI filters for the workspace layout | Kimchi |
| 2026-11-05 | — | Moved `api/` → `apps/api/`; documented `apps/` as the deployable bucket and the API as the UI-less service consumed by `apps/web`, `apps/desktop`, and `apps/mobile` | Kimchi |
| 2026-11-06 | 1 | Drizzle/SQLite schema for 74 tables (62 legacy per `05 §4` transforms + 12 registered), 226 recovered indexes + 5 spec-mandated, drizzle-kit baseline `0000_edapex_schema.sql`, Workers-pool schema gate + shape tests, expectations fixture generator, CI drift step; `0000_scaffold.sql` deleted (comment-only placeholder) | Kimchi |
| 2026-11-06 | 2 | Repository layer implemented: `base/` (frozen context, D1 chunk/batch helpers, keyset pagination), 11 aggregate folders, 6 query modules; 103 `01b` methods implemented + 4 retired; 66 source files under the rule guard; 18 repository test files covering parity, tenant isolation, chunk boundaries and batch atomicity | Kimchi |
| 2026-11-06 | 2 | Phase 2 gate passed: CI run 42233886498 green on PR #3; 139 tests, 66 repository files guarded, map 108/108, schema drift clean, both verifiers pass | Kimchi |
| 2026-11-06 | 2 | Schema unchanged (O2 tenant-leading composites deferred to Phase 7 after data load); `01b` placement overridden by aggregate ownership where they conflict (timeline, designation/department, sessions, objectives); seven assessment-service passthroughs recorded as Phase 3 work | Kimchi |
| 2026-11-06 | 3 | Service foundation: request-scoped context, ports/adapters, error taxonomy, Web Crypto helpers, 53-row service method map, boundary/rule guards and a 45-file tree check | Kimchi |
| 2026-11-06 | 3 | Domain: named-mark OCR annotation contract, marks/grades computation, pure roster matcher, semantic completeness/accuracy validation; the legacy markdown linter/parser is deliberately not ported | Kimchi |
| 2026-11-06 | 3 | Assessment entry/query/roster/publish, attendance, content-addressed OCR cache + capture binding, settings (general/academic/report), auth/session/profile/rate-limit/authorization and student lifecycle | Kimchi |
| 2026-11-06 | 3 | Phase 3 gate passed: PR #4 check `port` green (run 42265759924); 292 tests, typecheck, all guards, 77 tables, both verifiers, report-settings import verified | Kimchi |
| 2026-11-06 | 3 | Student photo storage moved to R2 Standard (`MEDIA` / `edapex-media`): key = unchanged `/uploads/students/<sha256>.<ext>`, public content-addressed route with immutable caching; 1,058 images / ~214 MB in scope, 1,684 PDFs excluded; migration details added to `05 §5.1` | Kimchi |
| 2026-11-06 | 3 | Email delivery switched to Gmail OAuth2 by default: fetch-only refresh-token grant + `gmail/v1/users/{sender}/messages/send` raw MIME; Cloudflare Email Routing remains an optional fallback | Kimchi |
| 2026-11-06 | 4 | HTTP foundation: request-id/logger/CORS/body-limit/rate-limit/auth/tenant chain, flat error envelope with the byte-identical 422 body, typed validators, `createApp` composition and the `baseCtx`/`ctx` split | Kimchi |
| 2026-11-06 | 4 | Service-led routes: auth/session/profile, students (search/status/photos/lifecycle), subject assignments, attendance, assessments (entry/query/feedback/OCR/captures/publish) and settings; telegram and PDF dropped, claim/OAuth and `/r/:token` deferred | Kimchi |
| 2026-11-06 | 4 | Typed `hc<AppType>` client, `check:http` guard + self-test, CORS/preflight/type/tenant/dropped-route tests; 80 test files / 399 tests | Kimchi |
| 2026-11-06 | 4 | Local gate green: typecheck, 399 tests, all guards, D1 apply, schema drift, deploy dry-run and both verifiers | Kimchi |
| 2026-11-06 | 4 | Phase 4 gate passed: PR #5 check `port` green ([run 42280594997](https://github.com/beznet22/edapex/actions/runs/42280594997)); 80 test files / 399 tests, 19 route modules, all guards, D1 drift clean, both verifiers | Kimchi |
| 2026-11-06 | 4 | Deviations: the service-led surface supersedes the legacy 20-row HTTP map; thin Phase 4 service/repository additions (`StudentSearchService`, `SubjectAssignmentService`, `TenantScopeService`, photo claim/remove, `setActiveStatus`, `RateLimitService.consume`, `findSubjectById`); no schema change | Kimchi |
| 2026-11-06 | 5 | Schema: `users.claim_status` + `users_claim_status_index` and `auth_events.metadata` in additive migration 0002; DB-level CHECK omitted (D1 ignores `PRAGMA foreign_keys=OFF`, so the generated table rebuild would fail once child rows exist) | Kimchi |
| 2026-11-06 | 5 | Repositories: claim completion (identity + credential + session batch), code issue/revoke chunks, duplicate reads in `queries/`, reassign in `profiles/parent`, merge/flag in `accounts`; rate-limit windows now increment in one D1 batch | Kimchi |
| 2026-11-06 | 5 | Services: claim/Google link, claim reset, student codes (issue/bulk/reissue/revoke/redeem), duplicate queue with reassign/merge/flag/CSV, `auth_events` helper, signed payloads, Crockford codes, injected `AuthConfigPort`/`GoogleOAuthPort` | Kimchi |
| 2026-11-06 | 5 | HTTP: `/claim`, `/auth/google/*`, `/auth/code`, `/auth/mobile/code`, `/admin/student-codes/*`, `/admin/duplicate-emails/*`, `/admin/auth/claim-reset`; `__Host-` cookies, content negotiation middleware, legacy login retirement flag | Kimchi |
| 2026-11-06 | 5 | Local gate: typecheck, 505 tests / 100 files, all guards + self-tests, migration apply + drift, deploy dry-run, both verifiers (365 links, 219 anchors, 62 tables, 0 failures) | Kimchi |
| 2026-11-06 | 5 | Benchmark: claim CPU 0.055 ms/attempt (Workers pool); `wrangler dev` valid p50 35.6 ms, unknown p50 28.5 ms wall clock after batching the four rate-limit windows into one D1 round trip | Kimchi |

## Blockers and decisions

| Item | Blocks | Status | Owner |
|---|---|---|---|
| Terms 2 and 3 calendars | Phase 7 (terms endpoint only) | waiting on school | — |
| Term-date confirmation for FIRST TERM | Phase 7 | fixed from `assets/calendar.jpeg` (2026-09-14 → 2026-12-11); confirm against official notice | — |
| Repository layout | Phase 9 completion | decided — `apps/api/` is the API service and becomes a pnpm workspace package; `apps/` is the deployable bucket; no standalone extraction | — |
| Phase 1 index arithmetic | Phase 2+ index work | decided — the 226 gate is 224 verbatim recovered (the two `session_id` indexes go with the dropped columns, `05 §4`) plus 01a O11's two new `chat_group_users` indexes; 05/04 add 5 more spec-mandated indexes, so legacy tables carry 231 secondary indexes total | — |
| `sm_general_settings.identity` | Phase 7 transform | decided — created as a new TEXT column per 01a §6 even though no legacy column exists; `extras` therefore holds 95 legacy fields, not 94. Phase 7 must read the schema, not the prose | — |
| `01a O2` school-id-leading composites | Phase 2 | deferred — Phase 2 made no schema changes; add measured tenant-leading composites in Phase 7 after data load | — |
| Cross-aggregate repository reads | Phase 2+ | decided — `repository/queries/` modules; repositories may read the declared reference dictionaries but never write them | — |
| Guardian email update | Phase 2+ | decided — `updateParentEmail` writes `sm_parents` + `users` in one batch per `01 §8` site 3; creating a missing parent user stays in Phase 3 | — |
| Student promotion orchestration | Phase 3 | decided — repository keeps batched data primitives; fees assignment and chat-group migration move to `student-lifecycle.service` | — |
| Phase 3 new tables | Phase 3+ | decided — `report_settings`, `ocr_cache`, `marksheet_captures`; schema 74 → 77 (62 legacy + 15 registered). Cache key is `(school, content hash, parser version)`, never filename/student/exam | — |
| OCR markdown linter/parser | Phase 3+ | decided — not ported; the OCR annotation JSON is the machine contract and markdown stays raw evidence; the legacy parser remains in `src/` for the legacy app | — |
| Admission-number identity | Phase 3+ | decided — evidence only, never authority; an explicit student slot or roster match plus `confirmCapture` is required; no auto-bind on admission number | — |
| Phase 3 method count | Phase 3 | decided — 37 unique destinations + 2 duplicate merges + 7 deleted + 5 retired + 2 out of scope = 53; the `02` prose “30 moved” is arithmetically impossible | — |
| `getExtractedAssessment` signature | Phase 3 | decided — renamed to `getCachedExtraction(contentHash)`; no call sites; recorded in `scripts/service-method-map.mjs` | — |
| Phase 3 repository additions | Phase 3+ | decided — settings/exam-type writes, OCR cache/captures, auth events/rate limits, session rotation, fee assignment, atomic marks/results replacement; recorded as Phase 3 deviations | — |
| Email provider | Phase 3+ | decided — Gmail OAuth2 is the default when `GMAIL_CLIENT_ID` / `GMAIL_CLIENT_SECRET` / `GMAIL_REFRESH_TOKEN` / `GMAIL_SENDER_EMAIL` are set; Cloudflare Email Routing is the fallback. Deployment-level account for now; per-school Gmail connections need encrypted credential storage + OAuth callback in a later phase. Gmail quota and app-verification limits apply | — |
| Student photos | Phase 7 migration | decided — R2 Standard `edapex-media` (binding `MEDIA`), key = the unchanged DB URL path, public content-addressed route with immutable caching; images only (1,058 images / ~214 MB), 1,684 PDFs excluded; storage/route now, data migration in Phase 7 with `05 §5.1`. Public access was chosen explicitly; the hash is unguessable and auth can be added without changing URLs | — |
| Phase 4 route surface | Phase 4+ | decided — service-led, not the legacy 20-row shape; telegram and PDF generation dropped (ironpress renders client-side), claim/OAuth deferred to Phase 5 and `/r/:token` to Phase 6; `03b` remains the legacy inventory | — |
| Phase 4 contexts | Phase 4+ | decided — `baseCtx` (unscoped) for auth/session/profile/rate-limit/authorization; `ctx` (scoped) for tenant services; one cache/logger per request | — |
| Phase 4 service/repository additions | Phase 4+ | decided — `StudentSearchService`, `SubjectAssignmentService`, `TenantScopeService`, `NotFoundError`, `TenantMismatchError`, photo claim/remove, `setActiveStatus`, `RateLimitService.consume`, `findSubjectById`; recorded as Phase 4 deviations | — |
| Phase 4 email/PDF boundary | Phase 4+ | decided — `publishResults` and `publishTranscript` stay on the API; PDF rendering is client-side via ironpress; no PDF route or dependency in `apps/api` | — |
| Phase 4 uploads | Phase 4+ | decided — `PUT`/`DELETE /students/:id/photo` for student photos; `POST /assessments/captures` for OCR intake; no `/api/uploads` | — |
| Phase 4 tenant guard placement | Phase 4+ | decided — path-scoped tenant middleware; `/me` and `/auth/*` skip tenant; unknown root paths return 404 rather than 401 | — |
| Phase 5 claim contract | Phase 5+ | decided — `POST /claim` always answers 202 `{status:"pending"}`; the signed claim ticket is the only difference. `/auth/google/start` negotiates 302 (HTML) or `{authorizeUrl}` (JSON). Non-enumeration wins over the earlier 200+URL shape | — |
| Phase 5 link rule | Phase 5+ | decided — the Google address must be verified and equal `users.email` (case-insensitive); mismatch is 403 `LINK_EMAIL_MISMATCH`, unverified is 403 `LINK_EMAIL_UNVERIFIED`; an admin corrects the address and the user retries | — |
| Phase 5 schema deviation | Phase 5+ | decided — `04a` needs claim state and actor metadata, so `users.claim_status` and `auth_events.metadata` are added; no new table (77 stays). The enum is enforced by Drizzle and services, not a DB CHECK | — |
| Phase 5 legacy login | Phase 5+ | decided — `LEGACY_PASSWORD_LOGIN` defaults on and is forced off whenever claim is enabled; the retired routes return 403 `PASSWORD_LOGIN_RETIRED` | — |
| Phase 5 merge guard | Phase 5+ | decided — a merge loser that still owns a `sm_students`/`sm_staffs`/`sm_parents` row is refused with 409, because the persona FK cascades on user delete; reassign the email first | — |
| Phase 5 reset scope | Phase 5+ | decided — the D1 reset is school-scoped, idempotent, and skips `claimed`/`flagged`; the source-MySQL step uses `gen-claim-reset-sql.mjs` and is not automatic | — |
| Phase 5 CPU gate | Phase 5+ | decided — `04 §1` and `04a §7` define the 10 ms figure as CPU. Measured 0.055 ms/attempt in the Workers pool. `wrangler dev` wall clock is ~28 ms p50 (three D1 round trips plus the dev proxy) and is not the CPU budget | — |

## Notes

- The measured baseline in [README.md](./README.md) is a snapshot of the remote dump. Refresh `docs/cloudflare-port/audit/db-inventory.json` before Phase 7 and update the numbers if they moved.
- Phase gates are cumulative: a later phase passing does not excuse an earlier gate that was skipped.
- Phase 3 landed on `phase-3-services` (PR #4) with `phase-2-repository` as the PR base; the `port` check is green on run 42265759924.
- Phase 4 landed on `phase-4-http` (PR #5) with `phase-3-services` as the PR base; the `port` check is green on run 42280594997.
- Phase 5 landed on `phase-5-auth` with `phase-4-http` as the PR base; the local gate is green and CI evidence is added when the `port` check completes.
- Phase 0 landed on `phase-0-scaffolding` (PR #1). `main` was not pushed because Dokploy deploys on commit; the branch carries the preflight spec-suite commit `b83de20`. Do not push `main` until the Dokploy trigger is confirmed blocked.
