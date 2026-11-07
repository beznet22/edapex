# Phase 8 cutover checklist

Use this in the approved window. Every checked item needs an evidence field:
timestamp, operator role, command/endpoint and result. No PII or secrets.

## Approval record

| Item | Value |
|---|---|
| Cutover lead | `<CUTOVER_INPUT>` |
| Rollback authority | `<CUTOVER_INPUT>` |
| Maintenance window | `<CUTOVER_INPUT>` |
| Deployed commit | `<CUTOVER_INPUT>` |
| Final dump SHA-256 | `<CUTOVER_INPUT>` |
| Shared claim digest verified | `[ ]` |
| Pre-reset backup location | `<CUTOVER_INPUT>` |
| On-call channel | `<CUTOVER_INPUT>` |

## Preparation status (local only)

- [x] Runbook, checklist, monitoring, on-call and rollback pack written with no production values.
- [x] Preflight passes on the current snapshot: 62 tables, 196,801 rows, 0 FK, 0 reconciliation, 44 SQL files, 625 uploadable/228 missing photos, `executed:false`.
- [x] Local drill passes: health 200; claim 404/202/202/409/404; target green; 42 sections; FIRST TERM dates; teacher roster; NURSERY marks grade; report-card review checksum; core counts and source evidence hash unchanged.
- [x] Decision record written: same account, separate EdApex resources, POC D1 not reused, paid-plan recommendation, Gmail reuse, staged domain move.
- [x] Gmail refresh token verified: HTTP 200, `gmail.send`; local `apps/api/.dev.vars` created and gitignored.
- [ ] Final frozen-dump preflight, production resources, load, switch, claim enablement, 24 h watch and production rollback drill.

**Stop:** preparation evidence does not authorize any production step. The
fresh-target and approval rules in the runbook still apply.

## A — Pre-cutover

- [ ] PR #8 merged; Phase 8 branch rebased; deployed commit recorded.
- [ ] Phase 7 report and A/B evidence reviewed.
- [ ] Cloudflare account plan confirmed; free load only with an approved multi-day window, otherwise Workers Paid.
- [ ] POC confirmed live and preserved; its D1, Worker, R2 bucket and current host are not touched before the staged move.
- [ ] POC Pages deploy method confirmed; `sms-portal` can be rebuilt and redeployed.
- [ ] Gmail reuse confirmed: same Google client, sender in the private record, `GMAIL_*` values available, OAuth publishing status checked.
- [ ] Google redirects registered: portal callbacks, EdApex `https://api.llacademy.ng/api/v1/auth/google/callback`, one-off consent redirect.
- [ ] Production D1 does not exist or is empty; **abort** if non-empty (fresh
      load only).
- [ ] Production D1 created; id recorded; placeholder id rejected.
- [ ] R2 bucket `edapex-media` created; binding verified.
- [ ] Production hostname/route and CORS origins configured; EdApex first deploys on `edapex-api.llacademy.ng`.
- [ ] Secrets set: `AUTH_COOKIE_SECRET`, `CLAIM_PASSWORD_DIGEST`,
      `ARCHIVE_TOKEN_SECRET`, `GOOGLE_*` for auth, `GMAIL_*` for email.
      `CLAIM_ENABLED` remains unset.
- [ ] EdApex Gmail test send succeeds from the POC sender account.
- [ ] Legacy app in maintenance mode; writes stopped.
- [ ] Pre-reset source password backup verified restorable.
- [ ] Shared claim reset run; reported row count recorded.
- [ ] `read_only=ON` verified; binlog position recorded.
- [ ] Final Adminer dump exported; SHA-256 recorded; 62 catalog tables present.
- [ ] 228 missing photos supplied or gap accepted in writing.
- [ ] Preflight passes: 62 tables, 0 FK, 0 reconciliation mismatches, 0 sequence
      failures, 0 current-record orphans, matching resolutions.
- [ ] Generated `d1-load.sh`, `d1-verify.sh`, `photo-upload.sh` reviewed; no
      remote command was executed during preflight.
- [ ] On-call briefed; rollback authority named; monitoring dashboard open.

**Stop:** any missing table, dump checksum mismatch, FK violation, unexplained
count variance, or unresolved photo decision.

## B — Load and migrate

- [ ] `wrangler d1 migrations apply DB --remote` completed.
- [ ] Tier files executed in order; no manual reordering.
- [ ] `PRAGMA foreign_key_check` zero rows.
- [ ] `d1-verify.sh` per-table counts equal `cutover-plan.json`.
- [ ] `sqlite_sequence` at or above every max id.
- [ ] `sm_students.current_record_id` has no orphans.
- [ ] `migration_resolutions` count equals the transform expectation.
- [ ] Worker deployed with claim disabled; `/health` 200; probe `/claim` 404.

**Stop:** any FK row, table mismatch >0.1% unexplained, sequence gap or current
record orphan.

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

## D — Archive and promote

- [ ] Session 1 archived with `purge:true`; manifest count matches; checksums
      verify; 74 gaps recorded; live rows zero.
- [ ] Session 2 archived; 0 objects; live rows zero.
- [ ] Session 4 archived with `purge:true`; manifest count matches; checksums
      verify; 16 gaps recorded; live rows zero.
- [ ] Promotion dry-run reviewed.
- [ ] Promotion real run completed; batches and outcomes recorded.
- [ ] Quarantine report generated; 237 rows reviewed (or final-snapshot
      equivalent explained).
- [ ] No student has more than one current record.

## E — Photos, timelines and readiness

- [ ] `photo-upload.sh` run with `--remote`; object count and total bytes
      recorded.
- [ ] Sample object hashes verify; sample public URLs return 200 with immutable
      caching.
- [ ] Missing photos match the accepted list; no placeholders uploaded.
- [ ] Timeline NDJSON uploaded; SHA-256 values match `manifest.json`; live
      timeline table stays empty.
- [ ] Production readiness: teacher → class/section → roster → term → marks
      entry → report card with a grade.
- [ ] Spot-check set matches; no unexplained result-total difference.

## F — Move POC, switch EdApex, monitor

- [ ] POC second custom domain `sms-api.llacademy.ng` attached; TLS, health, login and Gmail flow verified.
- [ ] POC `sms-frontend/.env.production` updated to `https://sms-api.llacademy.ng/api`; `sms-portal` rebuilt and redeployed.
- [ ] POC portal login and Gmail send verified on the new API host; `CLIENT_URL` still `https://portal.llacademy.ng`.
- [ ] EdApex interim host `edapex-api.llacademy.ng` verified before taking `api.llacademy.ng`.
- [ ] `api.llacademy.ng` removed from the POC and attached to EdApex only after the POC verification.
- [ ] Production host `api.llacademy.ng` points at EdApex; POC remains on `sms-api`.
- [ ] Smoke: `/health` 200, protected route 401, public photo 200, archive token sample if approved, Gmail send through EdApex.
- [ ] 15-minute 5xx/latency watch clean.
- [ ] `CLAIM_ENABLED=1` set; deploy verified; probe `/claim` 202.
- [ ] Claim removal date announced.
- [ ] 0–15 min, 15–60 min, 1–4 h, 4–12 h and 12–24 h checks recorded.
- [ ] Claim, 5xx and D1 budget metrics reviewed; no rollback trigger.
- [ ] Rollback window closed; MySQL retirement plan scheduled separately.

## Rollback drill record

- [x] Local drill run: `/health` 200; claim disabled 404; claim enabled
      202/202/409; teacher/roster/marks/report-card passed; rollback claim 404;
      core counts unchanged; source evidence hash unchanged.
- [ ] Production tabletop completed: disable claim → revert DNS/POC host if needed → keep MySQL read-only → restore pre-reset passwords if needed → verify legacy/POC.
- [ ] Production rollback drill (not just tabletop) completed before closing
      the gate. **This item is separate from the local drill and is not satisfied
      by it.**
- [ ] POC and EdApex host-rollback path recorded: POC stays on `sms-api`;
      EdApex returns to `edapex-api`; `CLIENT_URL` unchanged.

## Gate mapping

| Phase 8 gate | Checklist evidence |
|---|---|
| Final production load; verification repeated | Fresh initial load: sections A–E; final dump SHA, preflight, counts, FK, spot check |
| Rollback drilled | Local drill record + production tabletop + production drill |
| POC preserved through the move | `sms-api` health/login/Gmail checks; `api.llacademy.ng` handover only after verification |
| Monitoring dashboard and on-call briefed | Section A pack, monitoring schedule, on-call sign-off |

## Sign-off

| Role | Name/placeholder | Decision | Timestamp |
|---|---|---|---|
| Cutover lead | `<CUTOVER_INPUT>` | `[ ]` go / `[ ]` no-go | |
| Rollback authority | `<CUTOVER_INPUT>` | `[ ]` go / `[ ]` no-go | |
| Source owner | `<CUTOVER_INPUT>` | `[ ]` go / `[ ]` no-go | |
| On-call | `<CUTOVER_INPUT>` | `[ ]` briefed | |
