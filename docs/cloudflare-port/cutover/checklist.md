# Phase 8 cutover checklist

Use this in the approved window. Every checked item needs an evidence field:
timestamp, operator role, command/endpoint and result. No PII or secrets.

## Approval record

| Item | Value |
|---|---|
| Cutover lead | Owner (confirmed 2026-11-09T02:53Z) |
| Rollback authority | Owner (confirmed 2026-11-09T02:53Z) |
| Maintenance window | 2026-11-07 → 2026-11-08 UTC (executed) |
| Deployed commit | `0275059` |
| Final dump SHA-256 | `6199720481c1dc02d49eef9e39f05642057ff45fc64a119c6e5f3543f6d6f9da` |
| Shared claim digest verified | `[x]` |
| Pre-reset backup location | Owner-held private cutover record; not committed |
| On-call channel | Owner (confirmed 2026-11-09T02:53Z) |

## Preparation status (local only)

- [x] Runbook, checklist, monitoring, on-call and rollback pack written with no production values.
- [x] Preflight passes on the current snapshot: 62 tables, 196,801 rows, 0 FK, 0 reconciliation, 44 SQL files, 625 uploadable/228 missing photos (rehearsal baseline only; production photo ZIP pending), `executed:false`.
- [x] Local drill passes: health 200; claim 404/202/202/409/404; target green; 42 sections; FIRST TERM dates; teacher roster; NURSERY marks grade; report-card review checksum; core counts and source evidence hash unchanged.
- [x] Decision record written: same account, separate EdApex resources, POC D1 not reused, offline archives + live-only load, Gmail reuse, staged domain move.
- [x] Gmail refresh token verified: HTTP 200, `gmail.send`; local `apps/api/.dev.vars` created and gitignored.
- [x] Final frozen-dump preflight, production resources, live-only load, switch, claim enablement and production rollback drill.
- [x] 24 h monitoring review, owner POC login verification and signed checklist.

**Status:** production execution and the 24 h watch are complete; this
checklist is signed. Evidence lives in [`PROGRESS.md`](../PROGRESS.md), the
watch record below and [`../cutover/README.md`](./README.md).

## 24 h watch evidence (2026-11-08T02:26Z → 2026-11-09T02:26Z)

| Signal | Result | Decision |
|---|---|---|
| `edapex-api` Worker | 2,298 requests, 0 errors, 0 non-success statuses; p95 duration 31.6 ms; p95 CPU 21.2 ms | No rollback trigger |
| POC `sms-api-production` | 1,352 requests, 0 errors, 0 non-success statuses | POC preserved |
| Claim funnel | 2 `claim_attempt`, 0 `claim_ticket_issued`; both were unknown-email probes | Expected for an idle window |
| Sessions | 0 new sessions; 1 active admin session | No unexplained auth activity |
| D1 | 96 write queries / 180 rows written; 108 rows read; database 3.68 MB | Well below the 100k/day cap |
| FK integrity | `PRAGMA foreign_key_check` returned 0 rows | No rollback trigger |
| Archives | `archive_objects` 1,293; `session_result_summary` 3,802 | Matches export |
| Active-year records | 663 current records in academic year 5 | Matches target |
| Live smoke | `/health` 200; protected `/me` 401; CORS preflight 204; claim 202; public photo 200; POC root 200; portal 200 | Healthy |
| Owner POC login | Confirmed by owner on 2026-11-09 | Passed |

POC health path correction: the POC API has no `/health` route. Its root
`https://sms-api.llacademy.ng/` returns **200** with JSON
`{"success":true,"message":"School Management API Running"}`. The monitoring
document now uses that endpoint.

## A — Pre-cutover

- [ ] PR #8 merged; Phase 8 branch rebased; deployed commit recorded.
- [ ] Phase 7 report and A/B evidence reviewed.
- [ ] Cloudflare account plan confirmed as Free; offline archive/live-only profile chosen; 95k target/100k hard gate and next-UTC-day continuation agreed.
- [ ] POC confirmed live and preserved; its D1, Worker, R2 bucket and current host are not touched before the staged move.
- [ ] POC Pages deploy method confirmed; `sms-portal` can be rebuilt and redeployed.
- [ ] Gmail reuse confirmed: same Google client, sender in the private record, `GMAIL_*` values available, OAuth publishing status checked.
- [ ] Google redirects registered: portal callbacks, EdApex `https://api.llacademy.ng/api/v1/auth/google/callback`, one-off consent redirect.
- [ ] Final-dump archive factory/export complete: 652/0/641 objects, `archive_objects` ~1,293, `session_result_summary` ~3,802, all checksums verified.
- [ ] Live-only profile generated; historical raw tables and timelines excluded; archive metadata included.
- [ ] Production D1 does not exist or is empty; **abort** if non-empty (fresh
      load only).
- [ ] Production D1 created; id recorded; placeholder id rejected.
- [ ] R2 bucket `edapex-media` created; binding verified.
- [ ] Production hostname/route and CORS origins configured; EdApex first deploys on `edapex-api.llacademy.ng`.
- [ ] Secrets set: `AUTH_COOKIE_SECRET`, `CLAIM_PASSWORD_DIGEST`,
      `ARCHIVE_TOKEN_SECRET`, `GOOGLE_*` for auth, `GMAIL_*` for email.
      `CLAIM_ENABLED` remains unset.
- [ ] EdApex Gmail test send succeeds from the POC sender account.
- [ ] Archive objects uploaded to R2; `archive_objects`/`session_result_summary` ready to load.
- [ ] Legacy app in maintenance mode; writes stopped.
- [ ] Pre-reset source password backup verified restorable.
- [ ] Shared claim reset run; reported row count recorded.
- [ ] `read_only=ON` verified; binlog position recorded.
- [ ] Final Adminer dump exported; SHA-256 recorded; 62 catalog tables present.
- [ ] Production student-photo ZIP supplied; production ZIP **633 present / 220 missing**, old static tree adds **10 fallback** files; combined **643 present / 210 missing** referenced images (only images counted). Current tree is stale and must not be wholesale uploaded; decide on the 10 fallback files.
- [ ] Preflight passes: 62 tables, 0 FK, 0 reconciliation mismatches, 0 sequence
      failures, 0 current-record orphans, matching resolutions.
- [ ] Generated `load-plan.json`, `d1-verify.sh`, `archive-upload.sh` and the production photo manifest reviewed; no remote command was executed during preflight.
- [ ] On-call briefed; rollback authority named; monitoring dashboard open.

**Stop:** any missing table, dump checksum mismatch, FK violation, unexplained
count variance, or unresolved photo decision.

## B — Live-only load

- [ ] `wrangler d1 migrations apply DB --remote` completed.
- [ ] Canary chunk `meta.rows_written` measured; projected total ≤100k.
- [ ] Live profile + archive metadata loaded in order; no historical raw tables.
- [ ] If the 100k cap was reached: stopped after the last completed file, checkpoint written, remaining files resumed after 00:00 UTC the next day.
- [ ] `PRAGMA foreign_key_check` zero rows.
- [ ] `d1-verify.sh` live-profile counts match `load-plan.json`.
- [ ] `archive_objects`/`session_result_summary` counts match the export.
- [ ] `sm_mark_stores`, `sm_result_stores`, `student_ratings`, `teacher_remarks`, `class_attendances`, `sm_student_attendances`, `sm_student_timelines` are zero for historical sessions.
- [ ] Worker deployed with claim disabled on the interim host; `/health` 200; probe `/claim` 404.

**Stop:** any FK row, table mismatch >0.1% unexplained, over-100k write, or historical raw row.

## C — Create 2026/27 and carry the roster

- [ ] Source integrity: blocking identity findings zero.
- [ ] Bootstrap dry-run reviewed.
- [ ] Bootstrap real run with `activate:false` completed.
- [ ] 14 classes, 3 sections, 42 class-sections, 19 subjects created.
- [ ] 231 active subject assignments copied; 463 source rows accounted
      (232 inactive).
- [ ] 6 categories and 7 grade bands in the target year.
- [ ] FIRST TERM dated 2026-09-14 → 2026-12-11; no invented dates.
- [ ] Every staffing row reviewed; copied rows accepted; empty sections
      assigned/reviewed.
- [ ] Activation run with `activate:true`; integrity gate green.
- [ ] 0 unreviewed sections; 0 classes without assignments.
- [ ] 663 destination current records (639 promoted + 24 DAYCARE) or a
      preflight-explained final-snapshot variance.
- [ ] 3 unplaced students reported; 234 no-current-record students reported;
      15 non-default source duplicates documented.

## D — Archive metadata/retrieval and promotion

- [ ] Session 1 archive objects (652) uploaded and checksum-verified; session 2 (0); session 4 (641).
- [ ] `archive_objects` ~1,293 and `session_result_summary` ~3,802 metadata loaded; counts match the export.
- [ ] Historical marksheet and transcript sample read from R2 with the expected checksum; no archive job or purge ran in production.
- [ ] Historical raw tables remain zero; no background import of previous sessions.
- [ ] Promotion dry-run reviewed.
- [ ] Promotion real run completed; batches and outcomes recorded.
- [ ] Quarantine report generated; 237 rows reviewed (or final-snapshot
      equivalent explained).
- [ ] No student has more than one current record.

## E — Photos, timelines and readiness

- [x] Production photo ZIP + 10 approved static fallbacks extracted; union manifest **643 present / 210 accepted missing**; active/default report **206 students** recorded locally.
- [x] `photos-union/photo-upload.sh` run with `--remote`; **643/643** objects and total bytes recorded; no stale wholesale upload.
- [x] Post-upload photo audit passes **643/643, 0 failures**; 210 accepted gap recorded.
- [ ] Sample public photo URLs return 200 with immutable caching (requires the deployed Worker).
- [ ] Missing photos match the accepted list; no placeholders uploaded.
- [ ] Timeline NDJSON uploaded; SHA-256 values match `manifest.json`; live
      timeline table stays empty.
- [ ] Production readiness: teacher → class/section → roster → term → marks
      entry → report card with a grade.
- [ ] Spot-check set matches; no unexplained result-total difference.

## F — Move POC, switch EdApex, monitor

- [x] POC second custom domain `sms-api.llacademy.ng` attached; TLS, root health, login and Gmail flow verified.
- [x] POC `sms-frontend/.env.production` updated to `https://sms-api.llacademy.ng/api`; `sms-portal` rebuilt and redeployed.
- [x] POC portal login verified on the new API host; `CLIENT_URL` still `https://portal.llacademy.ng`. EdApex Gmail send verified 200 (`messageId 1a1b8f8110948b17`); POC callback unchanged.
- [x] EdApex interim host `edapex-api.llacademy.ng` verified before taking `api.llacademy.ng`.
- [x] `api.llacademy.ng` removed from the POC and attached to EdApex only after the POC verification.
- [x] Production host `api.llacademy.ng` points at EdApex; POC remains on `sms-api`.
- [x] Smoke: `/health` 200, protected route 401, public photo 200, archive retrieval sample 200, Gmail send through EdApex 200.
- [x] 15-minute 5xx/latency watch clean.
- [x] `CLAIM_ENABLED=1` set; deploy verified; probe `/claim` 202.
- [x] Claim removal date announced: **2026-12-03** (former date; withdrawn — removal moved to 10G.2).
- [x] 24 h aggregate checks recorded; no per-window incident was raised.
- [x] Claim, 5xx and D1 budget metrics reviewed; no rollback trigger.
- [x] Rollback window closed; MySQL retirement plan scheduled separately.

## Rollback drill record

- [x] Local drill run: `/health` 200; claim disabled 404; claim enabled
      202/202/409; teacher/roster/marks/report-card passed; rollback claim 404;
      core counts unchanged; source evidence hash unchanged.
- [x] Production tabletop reviewed 2026-11-09T02:55Z with the owner: disable claim → revert DNS/POC host if needed → keep MySQL read-only → restore pre-reset passwords if needed → verify legacy/POC. No action required; the production drill below already exercised the host path.
- [x] Production rollback drill completed before closing the gate: detach
      `api.llacademy.ng` (523) → attach POC (200) → restore EdApex (200).
      **This is separate from the local drill.**
- [x] POC and EdApex host-rollback path recorded: POC stays on `sms-api`;
      EdApex returns to `edapex-api`; `CLIENT_URL` unchanged.

## Gate mapping

| Phase 8 gate | Checklist evidence |
|---|---|
| Final production load; verification repeated | Live-only + archive metadata: sections A–E; final dump SHA, preflight, canary, counts, FK, spot check |
| Rollback drilled | Local drill record + production tabletop + production drill |
| POC preserved through the move | `sms-api` health/login/Gmail checks; `api.llacademy.ng` handover only after verification |
| Historical retrieval from R2 | Archive objects/metadata + historical marksheet/transcript sample |
| Monitoring dashboard and on-call briefed | Section A pack, monitoring schedule, on-call sign-off |

## Sign-off

| Role | Name/placeholder | Decision | Timestamp |
|---|---|---|---|
| Cutover lead | Owner | `[x]` go / `[ ]` no-go | 2026-11-09T02:55Z |
| Rollback authority | Owner | `[x]` go / `[ ]` no-go | 2026-11-09T02:55Z |
| Source owner | Owner | `[x]` go / `[ ]` no-go | 2026-11-09T02:55Z |
| On-call | Owner | `[x]` briefed | 2026-11-09T02:55Z |
