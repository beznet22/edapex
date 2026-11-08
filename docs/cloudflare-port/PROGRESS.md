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

**Phase 8 — Cutover preparation.** PR #8 is merged; `phase-8-cutover` is
rebased onto `phase-6-archive` and published as PR #9. The cutover pack,
offline-archive/live-only decision record, dump preflight and local drill are
prepared. No production D1/R2/DNS/MySQL action has been taken. The next work is
the archive-export/live-profile tooling and the resumable one-window loader. See
[`cutover/decisions.md`](./cutover/decisions.md).

## Phase status

| Phase | Name | Status | Owner | Started | Completed | Gate evidence |
|---|---|---|---|---|---|---|
| 0 | Scaffolding and guards | done | Kimchi | 2026-11-05 | 2026-11-05 | PR #1 check `port` green ([run 42083953037](https://github.com/beznet22/edapex/actions/runs/42083953037)): typecheck, boundary + self-test, Workers test, D1 apply, both verifiers. Local: `/health` 200. |
| 1 | D1 schema and migrations | done | Kimchi | 2026-11-06 | 2026-11-06 | PR #2 check `port` green ([run 42181282784](https://github.com/beznet22/edapex/actions/runs/42181282784)): typecheck, boundaries, 17 Workers-pool tests, local D1 apply, drift, both verifiers. Gate: 74 tables (62 legacy + 12 registered), 226 recovered + 5 spec indexes, every table ≤100 columns, `PRAGMA foreign_key_check` zero rows. |
| 2 | Repository layer | done | Kimchi | 2026-11-06 | 2026-11-06 | PR #3 check `port` green ([run 42233886498](https://github.com/beznet22/edapex/actions/runs/42233886498)): typecheck, boundaries, repository rules + self-test, map completeness, 139 Workers-pool tests, local D1 apply, drift, both verifiers. Gate: 108 `01b` rows (103 implemented + 4 retired + 2 non-async), zero `db.transaction(`, zero `any`, 66 guarded files ≤300 lines, tenant-isolation suite green. |
| 3 | Service layer | done | Kimchi | 2026-11-06 | 2026-11-06 | PR #4 check `port` green ([run 42265759924](https://github.com/beznet22/edapex/actions/runs/42265759924)): typecheck, 292 tests (55 files), boundaries, repository + service guards (53 service files, 45-file tree), method map 53/53 (37 mapped + 2 merged + 7 deleted + 5 retired + 2 out of scope), 77 tables, drift clean, both verifiers, report-settings import 1 file → 1 row verified. |
| 4 | HTTP layer | done | Kimchi | 2026-11-06 | 2026-11-06 | PR #5 check `port` green ([run 42280594997](https://github.com/beznet22/edapex/actions/runs/42280594997)): typecheck, 399 tests / 80 files, boundary/repository/service/HTTP guards + self-tests, repository map 108/108, service map 53/53, D1 apply, drift, deploy dry-run, both verifiers. Gate: 19 route modules / 42 handlers, 422 byte-compatible, `hc<AppType>` type test, CORS/tenant/dropped-route suites green. |
| 5 | Auth cutover flow | done | Kimchi | 2026-11-06 | 2026-11-06 | PR #6 check `port` green ([run 42288628524](https://github.com/beznet22/edapex/actions/runs/42288628524)): typecheck, 505 tests / 100 files, all guards + self-tests, 0002 apply + drift, deploy dry-run, both verifiers. Gate: claim → Google → session on local D1, 409 `AMBIGUOUS_EMAIL`, reissue revokes sessions, claim CPU 0.055 ms/attempt (Workers pool); `wrangler dev` handler p50 ~17 ms wall clock. |
| 6 | Archive and retrieval | done | Kimchi | 2026-11-06 | 2026-11-06 | PR #7 check `port` green ([run 42300456462](https://github.com/beznet22/edapex/actions/runs/42300456462)): typecheck, 115 files / 565 tests, all guards + self-tests, 0003 apply + drift, deploy dry-run, both verifiers. Gate: archive/restore round-trip, checksum quarantine, published immutability + supersede *n+1*, wipe blocked without the second admin token. |
| 7 | Migration execution | done | Kimchi | 2026-11-06 | 2026-11-06 | Local rehearsals A/B (`phase-7-migration`): 62 legacy tables / 196,801 rows / 0 FK / 0 reconciliation mismatches; target integrity green (0 identity, 0 target, 42 sections reviewed, 663 current records); 681 year-4 records = 666 unique default + 15 non-default duplicates; 639 promoted + 24 DAYCARE + 3 unplaced; 663 destination records; quarantine 237; sessions 1/2/4 archived with 652+641 checksum-verified objects (74/16 historical gaps), live marks/results/ratings/remarks/attendance zero; 853 referenced photo URLs (625 present/uploadable, 228 missing locally), 25 sample uploads and public route 200; 2 timeline exports; O2 10/10 present. Full local gate: typecheck, 591 tests / 123 files, all guards, 0004/0005 apply + drift, deploy dry-run, both verifiers. PR #8 check `port` green ([run 42345892456](https://github.com/beznet22/edapex/actions/runs/42345892456)). Report: [`audit/phase-7-rehearsal.md`](./audit/phase-7-rehearsal.md). |
| 8 | Cutover | in progress | Kimchi | 2026-11-07 | — | PR #8 merged; `phase-8-cutover` rebased and published as PR #9. Preparation evidence: preflight on the current dump (62 tables, 196,801 rows, 0 FK, 0 reconciliation, 44 SQL files, `executed:false`; rehearsal photos 625/228, production ZIP 633/220, old static fallback +10 → combined 643 present/210 accepted-missing; 10 fallbacks included; active/default report 206 students; R2 `edapex-media` created; **643/643 uploaded, audit 0 failures**); local drill passed (target green, 42 sections, FIRST TERM dates, teacher roster, NURSERY marks with grade, report-card review checksum, claim 404/202/202/409/404, core counts unchanged). Gmail reuse verified locally (HTTP 200, `gmail.send`); POC Gmail callback unchanged; domain move staged (`api.llacademy.ng` for EdApex, `sms-api.llacademy.ng` for POC). Design: offline session 1/2/4 archives + minimal live-only D1 load; Free 95k target/100k hard gate, checkpoint and next-UTC-day continuation; no Paid fallback; no historical raw rows in production D1. Archive export validated **1,293 objects / 3,802 summaries**; live plan **34 tables / 5,380 rows / 31 files (28 excluded)**; loader dry-run passes; full gate **126 files / 617 tests**; PR #9 `port` green ([run 42385118234](https://github.com/beznet22/edapex/actions/runs/42385118234)). Production execution on 2026-11-07: `edapex` D1 + Worker + auth/Gmail secrets + CORS `https://app.llacademy.ng`; live load **61,358 writes**, verification 0 failures; bootstrap/staffing/activation 42 sections, 231 initial assignments; promotion hit the Free Worker CPU limit (503) at batch 5. Recovered the validated local target into `edapex-recovery` (14,039 rows / **87,503 writes**): 663 target records, 237 students without a target current record, 42 reviewed sections, 6 categories, 7 bands, 663 outcomes, FK 0; archive upload **1,293/1,293** with last-object checksum verified; Worker health 200, claim 404. **Write-cap incident:** at least **148,861 account writes** today (>100k); no further D1 writes until 00:00 UTC; no Paid upgrade. Post-reset 2026-11-08: fixture cleanup **366 → 231**; admin login restored and target gate **green**; archive retrieval schema fixed (transcript and marksheet **200**); POC moved to `sms-api.llacademy.ng` and portal rebuilt; `api.llacademy.ng` switched to EdApex; health 200, protected route 401, claim 202, CORS `https://app.llacademy.ng`. Gmail adapter send returned **200** (`messageId 1a1b8f8110948b17`); 24 h watch started **2026-11-08T02:26Z**. Remaining: finish the 24 h watch (started 02:26Z) and owner POC login verification. |
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
- [x] Archive/restore round-trip on a fixture — `tests/services/restore.test.ts`
- [x] Checksum mismatch quarantines without aborting — `tests/services/archive-job.test.ts`
- [x] Published versions immutable; supersede creates *n+1* — `tests/services/report-card.test.ts`
- [x] Wipe blocked without the second admin token — `tests/services/wipe.test.ts`

### Phase 7 — Migration
- [x] Integrity gate zero (identity 0; target gate green after the staffing review)
- [x] Row counts and checksums reconciled (A/B identical; 0 load mismatches; archive objects checksum-verified)
- [x] 681 year-4 records = 666 unique default students + 15 non-default duplicates; 639 promoted + 24 DAYCARE + 3 unplaced; 663 destination current records; quarantine 237
- [x] 463 source subject assignments accounted: 231 active copied + 232 inactive; 6 student categories; 7 grade bands; readiness green

### Phase 8 — Cutover
- [x] Cutover runbook, checklist, monitoring, on-call and rollback-pack written; no production values invented
- [x] Dump preflight passes on the current snapshot: 62 tables, 196,801 rows, 0 FK, 0 reconciliation, 0 sequence/orphan failures, 44 SQL files, rehearsal photos 625/228. Production ZIP: **633 present / 220 missing**; old static tree adds **10 fallback** files → combined **643 present / 210 accepted-missing**; active/default report lists **206 students**; R2 upload **643/643**, audit **0 failures**
- [x] Local application drill passes: health 200, claim 404/202/202/409/404, target integrity green, 42 sections, FIRST TERM 2026-09-14 → 2026-12-11, teacher roster, NURSERY marks grade, report-card review checksum, core counts unchanged, source evidence hash unchanged
- [x] Monitoring/on-call/rollback pack prepared (production briefing and tabletop still pending)
- [x] Decision record written: same account, separate EdApex resources, POC D1 not reused, offline archives + live-only load, Gmail reuse, staged domain move
- [x] Gmail refresh token verified locally (HTTP 200, `gmail.send`); local `apps/api/.dev.vars` created and gitignored; production secrets pending Worker
- [x] POC host/domain move staged: `sms-api.llacademy.ng` for the POC, `api.llacademy.ng` for EdApex; `CLIENT_URL` stays on the portal
- [x] PR #8 merged; `phase-8-cutover` rebased and published as PR #9
- [x] Archive export validated: 1,293 objects, 3,802 summaries, checksums; live plan 34 tables/5,380 rows/31 files, 28 excluded; loader dry-run
- [x] Production photo 643/643 uploaded; full SHA-256/byte audit 0 failures; 206-student active/default report; 210 gap accepted
- [x] Full gate 126 files / 617 tests; PR #9 `port` green ([run 42385118234](https://github.com/beznet22/edapex/actions/runs/42385118234)); no production D1/domain switch
- [ ] POC second host + rebuilt portal verified; EdApex interim host verified
- [ ] Production D1/R2 created and loaded from the final frozen snapshot (fresh target; abort if non-empty; no delta)
- [ ] Production traffic switch, `/claim` enablement and 24 h monitoring
- [ ] Production rollback drill (local drill is not a substitute) and signed checklist

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
| 2026-11-06 | 5 | Phase 5 gate passed: PR #6 check `port` green ([run 42288628524](https://github.com/beznet22/edapex/actions/runs/42288628524)); 505 tests, all guards, 0002 apply + drift, dry-run and both verifiers | Kimchi |
| 2026-11-06 | 6 | Schema: `archive_objects` gains `exam_type_id`, `status`, `published_at`, `published_by`, `reason`, `error` and a version-scoped unique index; `session_jobs` is rebuilt with `wipe`, `cancelled`, `awaiting_approval` and actor/approval columns; `grade_change_audit` and `public_document_tokens` added (77 → 79 tables) | Kimchi |
| 2026-11-06 | 6 | Repositories: archive aggregate (objects, jobs, summaries, grade audit, tokens), raw assessment/attendance capture, idempotent restore helpers, R2 archive-store port; signed payloads move to `services/crypto/signed-payload.ts` | Kimchi |
| 2026-11-06 | 6 | Services: student-session capture, resumable archive job, manifest, purge, read-only restore, job control, dual-admin wipe, retrieval (live/archive marksheet, per-session and cross-session transcript, versions), JSON render payloads, public token/route, review/publish/supersede/override and session write rejection | Kimchi |
| 2026-11-06 | 6 | HTTP: `/students/:id/marksheets*`, `/students/:id/transcripts*`, the four `…/pdf` payload routes, `/r/:token`, `/admin/sessions/*`, `/admin/jobs/*`, `/admin/archive`, `/admin/tokens/:tokenId/revoke`, `/admin/results/:id/override`; `24` route modules and `42+` handlers now inspected by `check:http` | Kimchi |
| 2026-11-06 | 6 | Local gate: typecheck, full Workers suite, repository/service/HTTP/boundary guards + self-tests, migration 0003 apply on a populated `session_jobs` table, drift, deploy dry-run, both verifiers | Kimchi |
| 2026-11-06 | 6 | Deviations: `…/pdf` returns a JSON render payload (ironpress stays client-side; its Node binding is filesystem-bound and not Workers-ready); retention sweep/policy deferred to Phase 9; `archive-objects` split into a maintenance repo to stay under the 300-line cap; `class_attendances` stays in the assessment archive raw rows; `session-writable` is a free guard (service-to-service imports are banned) | Kimchi |
| 2026-11-06 | 6 | Phase 6 gate passed: PR #7 check `port` green ([run 42300456462](https://github.com/beznet22/edapex/actions/runs/42300456462)); 115 test files / 565 tests, 96 repository files, 103 service files, 35 route modules, 0003 apply + drift, deploy dry-run, both verifiers | Kimchi |
| 2026-11-06 | 7 | Schema: `sm_class_sections` staffing state (`pending`/`copied`/`reviewed`) in `0004_phase7_staffing.sql`; ten school/academic-leading O2 composites in `0005_phase7_o2_indexes.sql`; expectations regenerated (233 → 243 legacy secondary indexes) | Kimchi |
| 2026-11-06 | 7 | Offline migration: Adminer dump parser, pure §4 transform (academic years, records/defaults, parents/users/orphans, settings split, terms, timelines, passwords, chat ids, zero-FK sanitation), target-FK preflight and 62-table tiered load. 196,801 rows, 0 FK violations, 1,711 resolutions, 0 reconciliation mismatches | Kimchi |
| 2026-11-06 | 7 | APIs: integrity/resolutions, bootstrap (filtered staffing copy, terms/exam configs, activation gate), terms, per-class-section staffing replace + bulk accept, promotion (ladder batches, carry-forward, reversal), quarantine CSV/JSON payload; `session_jobs` bootstrap/promotion dispatch | Kimchi |
| 2026-11-06 | 7 | Rehearsals A/B: 681 year-4 records = 666 unique default + 15 non-default duplicates; 639 promoted + 24 DAYCARE + 3 unplaced; 663 destination records; quarantine 237; sessions 1/2/4 archived (652/0/641 objects, 74/16 gaps), live historical rows zero; 853 photo URLs (625 present, 228 missing locally), sample upload + public 200; 2 timeline exports; O2 10/10; A/B verified identical | Kimchi |
| 2026-11-06 | 7 | Deviations: the spec's 654/24/3/678/222 counts double-count 15 non-default year-4 records and omit the 4-term transcript/empty-class historical rows; promotion uses `is_default=1`, so the measured roster is 666 unique → 639 + 24 + 3, 663 records, quarantine 237 (approved). Categories/grade bands are copied year-independently because the source rows live in an earlier year. Transcript/marksheet validation was relaxed for 4-term historical transcripts and empty class/section labels; the archive captures a malformed student as a manifest gap instead of aborting. Photos are inventoried but only sampled (the local static tree lacks 228 referenced files); the production runbook uses `--photos full` after the source supplies them | Kimchi |
| 2026-11-06 | 7 | Phase 7 gate passed locally: typecheck, 123 test files / 591 tests, all guards + self-tests, 0004/0005 apply + drift, deploy dry-run, both verifiers; both rehearsals reconciled. PR #8 check `port` green ([run 42345892456](https://github.com/beznet22/edapex/actions/runs/42345892456)) | Kimchi |
| 2026-11-07 | 8 | Preparation branch `phase-8-cutover` created from `phase-7-migration` (PR #8 not merged, no push). Cutover runbook, checklist, monitoring, on-call brief and rollback-drill pack written; all production values are `<CUTOVER_INPUT>` placeholders | Kimchi |
| 2026-11-07 | 8 | Preflight tooling added (`cutover:preflight`) and run on the current dump: 62 tables, 196,801 rows, 0 FK, 0 reconciliation, 0 sequence/orphan failures, 1,711 resolutions, 44 SQL files, 625 uploadable/228 missing photos, `executed:false`; no remote command executed | Kimchi |
| 2026-11-07 | 8 | Local drill added (`cutover:drill`) and passed on a disposable D1 copy: health 200; claim 404/202/202/409/404; target green; 42 sections; FIRST TERM dates; teacher roster, NURSERY marks grade and report-card review checksum; core counts and source evidence hash unchanged. First attempt correctly failed the target gate because synthetic claim users were active and unprofiled (`P4`); drill accounts are now inactive. Production DNS/MySQL rollback remains a tabletop/window step | Kimchi |
| 2026-11-07 | 8 | Decision record added: reuse the existing Cloudflare account but create separate `edapex-api`/`edapex` D1/`edapex-media`; never clear or reuse the live POC `sms` D1; POC moves to `sms-api.llacademy.ng`, EdApex takes `api.llacademy.ng` in a staged handover; POC `CLIENT_URL` stays on the portal | Kimchi |
| 2026-11-07 | 8 | Gmail reuse verified: same Google client/sender as the POC; `gmail.send` token exchange HTTP 200; local `apps/api/.dev.vars` created (gitignored); production `GMAIL_*` secrets pending the first `edapex-api` deploy. POC Gmail callback remains `portal.llacademy.ng`; EdApex auth callback registered | Kimchi |
| 2026-11-07 | 8 | Billing/design revised: the all-tables load+purge is ~2.0–2.5M writes, so it is rejected. Use offline session 1/2/4 archives + minimal live-only D1 load + archive metadata: expected ~70–95k writes, Free 95k target/100k hard gate. If capped, checkpoint and resume after 00:00 UTC the next day; no Paid fallback. Historical raw tables stay empty; history serves from R2 | Kimchi |
| 2026-11-07 | 8 | PR #8 merged into `phase-6-archive`; `phase-8-cutover` rebased and published as PR #9. No production resources/domains/secrets touched | Kimchi |
| 2026-11-07 | 8 | Tooling validated: archive export **1,293 objects / 3,802 summaries** with checksum verification; live-only plan **34 tables / 5,380 rows / 31 files (28 excluded)**; resumable loader dry-run; full gate **126 test files / 617 tests**; PR #9 `port` green ([run 42385118234](https://github.com/beznet22/edapex/actions/runs/42385118234)). No production D1 load or domain switch | Kimchi |
| 2026-11-07 | 8 | Production resources: `edapex` D1 created/migrated, Worker first deployed, auth/Gmail/archive secrets set, CORS `https://app.llacademy.ng`, interim host `edapex-api.llacademy.ng`, health 200 and claim 404. Live-only load **61,358 writes**; live verification 0 failures. Bootstrap/staffing/activation: 42 sections, 231 initial assignments, 42 reviewed, active session 5 | Kimchi |
| 2026-11-07 | 8 | Promotion Free-plan CPU limit at batch 5 (78 students, 503). Recovered the validated local target into `edapex-recovery` instead of retrying: 14,039 rows, **87,503 writes**, 663 target records, 237 students without a target current record, 42 reviewed, 6 categories, 7 bands, 663 outcomes, FK 0. Recovery is bound to the Worker; old partial `edapex` retained. Archive **1,293/1,293** uploaded; last object SHA-256 matches | Kimchi |
| 2026-11-07 | 8 | **D1 Free write cap incident:** 61,358 + 87,503 = at least **148,861 account writes** today, above the 100k limit. Further D1 writes may fail until 00:00 UTC; no Paid upgrade. Remaining write-dependent steps are blocked: fixture-assignment cleanup (366 → 231), admin login/readiness, POC move/portal, switch, claim, 24 h watch and rollback drill | Kimchi |
| 2026-11-08 | 8 | Post-reset cleanup: deleted **135** rehearsal fixture assignments, leaving **231** active target assignments; 42/42 reviewed. Restored admin login; target gate green. Deployed archived-marksheet schema separation so historical 13-record/12-subject documents validate; archived transcript and marksheet both **200** | Kimchi |
| 2026-11-08 | 8 | POC staged: `sms-api.llacademy.ng` attached and root 200; `sms-portal` rebuilt with `VITE_API_URL=https://sms-api.llacademy.ng/api` and deployed; `portal.llacademy.ng` 200 and asset contains the new host. Removed `api.llacademy.ng` from POC and attached it to EdApex; `api.llacademy.ng/health` 200, protected 401, claim 202, CORS app origin; `sms-api` root 200 | Kimchi |
| 2026-11-08 | 8 | Remaining gate items: 24 h watch, owner verification of POC login/Gmail, production rollback drill and signed checklist. Claim is enabled; `CLAIM_ENABLED=1` and claim returns 202 | Kimchi |
| 2026-11-08 | 8 | Gmail adapter send returned 200 (`messageId 1a1b8f8110948b17`). Archived transcript and marksheet both 200 after the schema separation. Full gate green: **126 files / 617 tests**, both root verifiers, deploy dry-run. 24 h watch starts **2026-11-08T02:26Z**; POC login owner verification and production rollback drill remain | Kimchi |
| 2026-11-08 | 8 | Production rollback drill passed: detached `api.llacademy.ng` from EdApex (523), attached it back to POC (root 200), then restored EdApex (`/health` 200). Final smoke: protected 401, claim 202, archived transcript 200, integrity green (663 current records, 42 reviewed), `sms-api` 200, portal 200. Rollback drill complete; 24 h watch and owner POC login remain | Kimchi |

## Blockers and decisions

| Item | Blocks | Status | Owner |
|---|---|---|---|
| Terms 2 and 3 calendars | Phase 7 (terms endpoint only) | waiting on school | — |
| Term-date confirmation for FIRST TERM | Phase 7 | fixed from `assets/calendar.jpeg` (2026-09-14 → 2026-12-11); confirm against official notice | — |
| Production load/recovery | Phase 8 | done — live load 61,358 writes; recovery 14,039 rows / 87,503 writes; post-reset cleanup 135 deletes; old `edapex` retained | — |
| Archive export/live-profile tooling | Phase 8 | done — archive export 1,293/3,802; live plan 34 tables/5,380 rows/31 files; loader dry-run/checkpoint tested | — |
| D1 Free write cap | Phase 8 | resolved after 00:00 UTC — post-reset writes limited to fixture cleanup, admin reset and claim events; no Paid upgrade | — |
| Production student-photo ZIP | Phase 8 | done — 10 fallbacks included; combined 643/853; 210 gap accepted; active/default report 206 students; **643/643 uploaded, audit 0 failures** | — |
| EdApex CORS origin(s) | Phase 8 | done — `https://app.llacademy.ng` | — |
| Final frozen dump | Phase 8 | done — owner confirmed `edapexdb.sql` SHA-256 `6199720481c1…` as final; no independent source-freeze proof | — |
| Target assignment cleanup | Phase 8 | done — **231** active assignments; 42/42 reviewed; 15 sections intentionally have no subject teacher | — |
| POC owner verification | Phase 8 | pending — Gmail send verified; POC login still needs the owner’s real credentials; health and portal API base verified | — |
| 24 h watch | Phase 8 | in progress — started 2026-11-08T02:26Z; review claim/5xx/D1 before close | — |
| Production rollback drill | Phase 8 | done — host bounce to POC and back; final EdApex health 200 | — |
| Repository layout | Phase 9 completion | decided — `apps/api/` is the API service and becomes a pnpm workspace package; `apps/` is the deployable bucket; no standalone extraction | — |
| Phase 1 index arithmetic | Phase 2+ index work | decided — the 226 gate is 224 verbatim recovered (the two `session_id` indexes go with the dropped columns, `05 §4`) plus 01a O11's two new `chat_group_users` indexes; 05/04 add 5 more spec-mandated indexes, so legacy tables carry 231 secondary indexes total | — |
| `sm_general_settings.identity` | Phase 7 transform | decided — created as a new TEXT column per 01a §6 even though no legacy column exists; `extras` therefore holds 95 legacy fields, not 94. Phase 7 must read the schema, not the prose | — |
| `01a O2` school-id-leading composites | Phase 2 | done — 10 composites added in `0005_phase7_o2_indexes.sql`; all present, 9 chosen by the hot plans, and `teacher_remarks` is served by its existing `(student_id, exam_type_id, academic_id)` unique index. `student_ratings`/`teacher_remarks` lead with `academic_id` because those two legacy tables have no `school_id` | — |
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
| Phase 6 PDF boundary | Phase 6+ | decided — spec `06 §5` lists `…/pdf` routes, but ironpress is a client-side Rust/WASM renderer and its Node binding loads the WASM through the filesystem. The API returns `{ templateVersion, version, publishedAt, filename, document }`; no binary and no new dependency. Deviation recorded in the PR | — |
| Phase 6 version unit | Phase 6+ | decided — one `archive_objects` row per student-session snapshot, with `version` scoped by `(school, academic, student, version)`. `draft` is the absence of a row, `reviewed` is a snapshot, `publish` flips it, `supersede` writes *n+1* and marks *n* `superseded` | — |
| Phase 6 public tokens | Phase 6+ | decided — HMAC-signed payload (`studentId`, `sessionId`, `examTypeId`, `version`, `jti`, `exp`) plus a `public_document_tokens` row for revocation and the `:tokenId` endpoint. Tokens are 30 days, single-purpose, revocable | — |
| Phase 6 purge scope | Phase 6+ | decided — purge removes marks, results, ratings, remarks, student attendance and class attendance for the session; term/exam/setup definitions and the archive index/summaries stay, so restore is insert-only | — |
| Phase 6 retention | Phase 6/9 | deferred — `06 §7.1` sweep and policy endpoints stay Phase 9 work; Phase 6 owns archive, retrieval, versioning and controlled deletion only | — |
| Phase 6 R2 namespace | Phase 6+ | decided — archive objects reuse the `MEDIA` bucket under `schools/{schoolId}/sessions/{sessionId}/students/{studentId}/v{n}.json`; no new binding | — |
| Phase 6 `session_jobs` rebuild | Phase 6+ | decided — the kind/status CHECKs cannot be altered in place; the table has no dependents, so migration 0003 rebuilds it with `PRAGMA defer_foreign_keys=on` and preserves rows (verified on a populated scratch DB) | — |
| Phase 6 read-only restore | Phase 6+ | decided — `assertSessionWritable` (a free guard, because service-to-service imports are banned) rejects `archived`, `restoring` and `archived_readable` sessions in entry, feedback, attendance, publish, lifecycle and subject-assignment services. Report-card corrections/overrides intentionally bypass it | — |
| Phase 6 absent marks | Phase 6+ | decided — marksheet records gain an optional `absent: boolean[]`; class averages now exclude null/unassessed totals. The existing `Marksheet` fields are unchanged | — |
| Phase 7 681 records | Phase 7 | decided — use `student_records.is_default = 1` and the unique student roster: 681 year-4 records = 666 unique students + 15 non-default duplicate records; 639 promoted + 24 DAYCARE + 3 unplaced; 663 destination records. Promoting the duplicates would create multiple current records per student | — |
| Phase 7 subject assignments | Phase 7 | decided — the source has 463 rows, of which 231 are active and copied; the other 232 are inactive and are not staffing. The gate accounts for all 463 | — |
| Phase 7 categories/bands | Phase 7 | decided — copy all school category/grade-band rows into the target year; the five legacy categories and seven bands live in an earlier academic year, not year 4 | — |
| Phase 7 staffing copy | Phase 7 | decided — copy only active staff with active users; every skipped row writes `STAFFING_SKIPPED`; every class-section must be reviewed before activation; `accept-copied` never accepts an empty section | — |
| Phase 7 bootstrap job FK | Phase 7 | decided — `session_jobs.academic_id` is null for bootstrap until the first step creates the target year; the payload carries the target id | — |
| Phase 7 transcript schema | Phase 7 | decided — allow historical 4-term transcripts and marks above the modern 100 scale; empty class/section labels and zero totals are valid historical records. A malformed student becomes a manifest gap, not a failed session archive | — |
| Phase 7 archive gaps | Phase 7 | decided — sessions 1/2/4 archive 652/0/641 objects; 74/16 historical students have no complete transcript and are manifest gaps. Every existing object verifies by checksum; the live historical rows are zero | — |
| Phase 7 photos | Phase 7 | partial — 853 referenced URLs, 625 present/uploadable, 228 missing from the local static tree; two sampled uploads verify and the public 32/64-hex route returns 200. The full upload is the production runbook step after the source owner supplies the missing files | — |
| Phase 8 target | Phase 8 | decided — no production D1 exists, so the cutover is a **fresh initial load** from the final frozen snapshot, not a delta. Abort if a non-empty production D1 is found; a delta needs a separate design. This is a deliberate reading of `05 §8` for the current deployment state | — |
| Phase 8 preparation scope | Phase 8 | decided — PR #8 is merged; `phase-8-cutover` was rebased onto `phase-6-archive` and published as PR #9. Production D1/R2/DNS/MySQL writes still need the approved window | — |
| Phase 8 rollback evidence | Phase 8 | decided — the local drill proves application-level claim disable/restart, readiness and data stability only. DNS/route reversion, MySQL read-only state and pre-reset password restore remain production tabletop/drill items; the Phase 8 gate stays open | — |
| Phase 8 auth reset backup | Phase 8 | decided — back up source `users` passwords/full DB before the shared reset. Rollback after the reset restores the backup before reopening legacy login; the shared digest is not a rollback credential | — |
| Phase 8 photos | Phase 8 | decided — production ZIP 633 + 10 approved static fallbacks = **643 uploadable**; **210 accepted gap**; active/default report 206 students. R2 upload **643/643**, audit **0 failures**. Upload only the 643 union; no wholesale stale-tree upload. Keep legacy relative `student_photo` URLs and use a media-base helper for absolute client URLs; no backfill | — |
| Phase 8 photo URL contract | Phase 8 | decided — DB keeps `/uploads/students/<hash>.<ext>`; R2 key is `uploads/students/<file>`; the public route serves it; absolute client URLs are derived from `PUBLIC_MEDIA_BASE`/API base in the DTO. No `student_photo` backfill on storage moves; use the manifest + photo audit for consistency | — |
| Phase 8 account topology | Phase 8 | decided — reuse the existing Cloudflare account, but create separate `edapex-api`, `edapex` D1 and `edapex-media` R2. The live POC `sms` D1 has a different UUID schema and already contains migrated data; never clear or reuse it. Free quota is account-wide | — |
| Phase 8 billing | Phase 8 | decided — Workers Free; offline session 1/2/4 archives + minimal live-only D1 load. Expected ~70–95k writes; 95k target/100k hard gate. If the cap is reached, stop at the last completed file and resume after 00:00 UTC the next day; no Paid fallback. The all-tables load+purge (~2.0–2.5M writes) is rejected | — |
| Phase 8 Gmail | Phase 8 | decided — reuse the POC’s Google OAuth client and Gmail sender; one fresh consent with `gmail.send` produced a new refresh token (HTTP 200). Local `apps/api/.dev.vars` is gitignored; production `GMAIL_*` secrets wait for the first Worker deploy. POC Gmail callback remains on the portal; EdApex auth callback is `https://api.llacademy.ng/api/v1/auth/google/callback` | — |
| Phase 8 domain move | Phase 8 | decided — staged: POC gets `sms-api.llacademy.ng`, frontend `VITE_API_URL` updated and `sms-portal` rebuilt; only after verification is `api.llacademy.ng` removed from the POC and attached to EdApex. POC `CLIENT_URL` stays `https://portal.llacademy.ng`; keep old host until the new path is verified | — |
| Phase 8 local env | Phase 8 | decided — repository-root `.env` is legacy-app configuration and is not read by `apps/api`; local API values live in gitignored `apps/api/.dev.vars`; production values use `wrangler secret put` after the Worker exists | — |
| Phase 8 offline archives | Phase 8 | decided — generate session 1/2/4 archives locally from the final dump, export/upload the objects to R2, and load only `archive_objects` + `session_result_summary`. Historical raw marks/results/ratings/remarks/attendance/timelines stay out of production D1; retrieval reads R2. Do not import history back for normal serving | — |

## Notes

- The measured baseline in [README.md](./README.md) is a snapshot of the remote dump. Refresh `docs/cloudflare-port/audit/db-inventory.json` before Phase 7 and update the numbers if they moved.
- Phase gates are cumulative: a later phase passing does not excuse an earlier gate that was skipped.
- Phase 3 landed on `phase-3-services` (PR #4) with `phase-2-repository` as the PR base; the `port` check is green on run 42265759924.
- Phase 4 landed on `phase-4-http` (PR #5) with `phase-3-services` as the PR base; the `port` check is green on run 42280594997.
- Phase 5 landed on `phase-5-auth` with `phase-4-http` as the PR base; the `port` check is green on run 42288628524.
- Phase 7 landed on `phase-7-migration` with `phase-6-archive` as the PR base; PR #8 check `port` is green ([run 42345892456](https://github.com/beznet22/edapex/actions/runs/42345892456)) and both rehearsals reconciled. The committed rehearsal report is [`audit/phase-7-rehearsal.md`](./audit/phase-7-rehearsal.md). The 681/666/15 and 463/231/232 reconciliations are deliberate, approved deviations from the spec's record-level totals.
- Phase 8 preparation is on `phase-8-cutover`, rebased onto `phase-6-archive` after PR #8 merged and published as PR #9. No production resources/domains/secrets were touched. The decision record at [`cutover/decisions.md`](./cutover/decisions.md) is the first file the next agent should read; it records the POC/EdApex topology, offline archives + live-only load, one-window 95k/100k checkpoint, Gmail reuse and staged domain move.
- Phase 0 landed on `phase-0-scaffolding` (PR #1). `main` was not pushed because Dokploy deploys on commit; the branch carries the preflight spec-suite commit `b83de20`. Do not push `main` until the Dokploy trigger is confirmed blocked.
