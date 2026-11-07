# Phase 8 decision record

Status: **decisions taken during preparation.** No production resource, domain,
secret, D1/R2 write or traffic switch has been performed. This file is the
single summary the next agent should read before touching Cloudflare.

## D1 — Account and resource topology

| Decision | Detail |
|---|---|
| Cloudflare account | Reuse the existing account (`76846cbc…`), not a new account |
| POC Worker | `sms-api` stays live; do not replace or delete it |
| POC D1 | `sms` (production) is **not disposable**; it has a different UUID schema and already contains migrated EdApex data. Never clear or reuse it for EdApex |
| POC R2 | `sms-study-materials` stays POC-only |
| POC frontend | Pages project `sms-portal` at `portal.llacademy.ng` |
| POC API host | Moves to `sms-api.llacademy.ng` as part of the staged cutover |
| EdApex Worker | New `edapex-api` |
| EdApex D1 | New `edapex` database |
| EdApex R2 | New `edapex-media` bucket |
| EdApex host | `api.llacademy.ng` after the POC has moved and verified |

Creating a second Worker/D1 does **not** add free quota. Cloudflare free limits
are account-wide and are shared with the live POC.

## D2 — Billing and the one-window load

| Decision | Detail |
|---|---|
| Plan | **Workers Free**; POC traffic is not budgeted because the POC is being removed soon |
| Window | **One preferred maintenance window**; target **95,000 writes**, hard cap **100,000** |
| Strategy | **Offline historical archives + minimal live-only D1 load**. Historical marks/results never enter production D1, so the 196,801-row load and the ~171k-row purge disappear |
| Expected writes | ~**70–95k** for live/structural data + archive metadata + bootstrap/promotion, versus ~**2.0–2.5M** for the all-tables-load-and-purge approach |
| Canary | Measure a small production chunk’s `meta.rows_written` first; extrapolate and stop if the total would exceed 100k |
| If the cap is reached | **Stop after the last completed file, write the checkpoint, and resume after 00:00 UTC the next day.** Do not switch to Paid and do not silently exceed 100k |
| Rejected | Loading all 62 tables then archiving/purging on Free; that is a multi-week window, not one careful window |

Storage is not the blocker: the local D1 is about 36 MB (free limit 500 MB per
database / 5 GB per account), and the photo set is about 123 MB (R2 free 10 GB).
The archive JSON adds R2 objects, not D1 rows.

## D3 — Gmail reuse

| Decision | Detail |
|---|---|
| Sender | The POC’s active Gmail account; the address is in the private cutover record and `GMAIL_SENDER_EMAIL`, not git |
| POC storage | Refresh token is AES-GCM ciphertext in production D1 `gmail_accounts`, encrypted with `MASTER_ENCRYPTION_KEY` |
| POC secrets | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `MASTER_ENCRYPTION_KEY` exist on the production `sms-api` environment; secret values are write-only |
| EdApex variables | `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`, `GMAIL_SENDER_EMAIL`, `GMAIL_SENDER_NAME` |
| Reuse path chosen | Reuse the same Google OAuth client and Gmail account; one fresh consent with `gmail.send` produced a new refresh token; the OAuth screen is published |
| Verification | Token exchange returned HTTP 200, `gmail.send` scope, access token received; sender matches the POC account |
| Local configuration | Root `.env` is **not** read by `apps/api`; the five Gmail values were copied to gitignored `apps/api/.dev.vars` |
| Production configuration | Not set yet: the `edapex-api` Worker does not exist. Set with `wrangler secret put` after the first deploy |
| POC Gmail callback | `https://portal.llacademy.ng/integrations/gmail/callback` — remains on the portal and is unaffected by the API host move |
| EdApex auth callback | `https://api.llacademy.ng/api/v1/auth/google/callback` — registered on the Google client |
| OAuth status | Published (confirmed). If it is returned to Testing, refresh tokens expire after 7 days |
| Sending limit | Consumer Gmail is roughly 400–500 recipients/day; keep a cap for report-card mail |

The POC’s encrypted token was not decrypted and no POC secret was read or
changed. The one-time consent is independent of the POC’s stored token.

## D4 — Domain move

| Decision | Detail |
|---|---|
| POC API | Move to `sms-api.llacademy.ng` |
| EdApex API | Take `api.llacademy.ng` |
| Mode | Staged, not a hard swap |
| POC `CLIENT_URL` | Must stay `https://portal.llacademy.ng`; changing it would move the Gmail callback and break the registered redirect |
| POC frontend | Change only `sms-frontend/.env.production` to `https://sms-api.llacademy.ng/api`; rebuild and redeploy `sms-portal` |
| POC scripts | Update hardcoded `api.llacademy.ng` in `scripts/verify-replay-api.mjs` and `scripts/replay-edapex-api.mjs` |
| Keep old host until verified | Keep `api.llacademy.ng` attached to the POC while `sms-api.llacademy.ng` and the rebuilt portal are verified |
| EdApex interim host | Deploy and verify EdApex on `edapex-api.llacademy.ng` before taking `api.llacademy.ng` |
| Short detach window | Removing `api` from the POC and attaching it to EdApex is a brief hostname handover; do it in a low-traffic window |
| Google callbacks | Keep the portal callbacks; add EdApex’s API callback; multiple redirect URIs are allowed |
| Rollback | If EdApex fails after taking `api`, keep the portal on `sms-api`; EdApex can return to its interim host. If the POC move fails, revert the frontend API base and route |

## D5 — Local env versus production secrets

- The repository-root `.env` belongs to the legacy app; `apps/api` does not read it.
- Local API development uses `apps/api/.dev.vars` (gitignored). It now contains the five Gmail variables only.
- Production values are set with `wrangler secret put` after the Worker exists. `.env` files are not deployed.
- The local `.dev.vars` file is mode `600` and ignored; never commit it.
- No secret value, token, ciphertext or PII belongs in this repository or in the
  cutover evidence.

## D6 — Offline historical archives and minimal live profile

| Decision | Detail |
|---|---|
| Archive generation | Run the final dump through a local rehearsal; the existing Phase 6 archive-capture code generates sessions 1/2/4 objects, manifests and checksums. Validated on the current rehearsal: **1,293 objects / 3,802 summaries**, 652/641 by session |
| Archive export | Export ~1,293 archive JSON objects + `archive_objects` (~1,293) + `session_result_summary` (~3,802) metadata; upload objects to production R2, load metadata to D1 |
| Live-only load | Load identity/roster/structure/config + archive metadata. Historical **marks, results, ratings, remarks, attendance and timelines stay out of production D1**. Validated live plan: **34 tables, 5,380 live rows, 31 files, 28 excluded** |
| Skipped tables | `sm_mark_stores`, `sm_result_stores`, `student_ratings`, `teacher_remarks`, `class_attendances`, `sm_student_attendances`, `sm_student_timelines`; plus unused chat/finance/homework/dormitory/transport/library tables and historical `sm_exams`/`sm_exam_setups` (target bootstrap generates its own 189 configs from target assignments) |
| FKs | Historical `student_records`, classes, sections, academic years and `sm_exam_types` are loaded so archive metadata FKs resolve; the live profile includes all FK parents required by the loaded rows |
| Serving historical results | Existing archive retrieval reads the archive object from R2, verifies the checksum and serves the marksheet/transcript; no D1 historical raw rows |
| Photo source | The current `static/uploads/students` tree is **stale/rehearsal-only**. The production ZIP has 2,945 files and covers **633** of the 853 referenced images; the old static tree adds **10 fallback** files, so the combined set is **643 present / 210 missing**. The 210-image gap is **accepted**. The 10 fallbacks are included. The active/default report lists **206 students** still needing a photo (639 target default records with class+section; 24 DAYCARE/no-section excluded by the condition). Production R2 upload completed **643/643**; full SHA-256/byte audit **0 failures**. Extract under `.tmp/photos-production`; the report stays under `.tmp` |
| Gradual import | **Rejected as a normal path.** Do not import previous sessions back into D1; that reintroduces writes and live historical rows. Restore only a specific session for a rare correction |
| Historical corrections | Use the existing restore flow for the affected session, correct, re-archive and re-purge; budget those writes separately |

## D7 — Open inputs before production

| Input | Why it blocks |
|---|---|
| EdApex production frontend origin(s) | Required for `CORS_ORIGINS` and the Google post-login redirect |
| Final frozen dump | Archives and live load must use the same final snapshot |
| 228 missing photos | The production ZIP covers 633/853; the old static tree adds 10 fallback files; combined 643/853. **The 210-image gap is accepted.** The report lists 206 active/default students needing photos; upload only the 643 union files. No stale wholesale upload |
| One-window canary result | Confirms the index/write amplification fits under 100k; if it reaches the cap, resume the remaining files after 00:00 UTC the next day |
| POC removal timing | The POC must remain healthy on `sms-api` through the staged move |

## D8 — Guardrails

1. Do not clear, overwrite or repurpose the POC D1.
2. Do not load historical raw assessment rows into production D1; they belong in R2.
3. Do not import previous sessions back into D1 for normal serving.
4. Do not exceed the 100k write cap. Stop after the last completed file and resume after 00:00 UTC the next day; do not switch to Paid and do not spill silently.
5. Do not remove `api.llacademy.ng` from the POC before the new host and portal are verified.
6. Do not change the POC `CLIENT_URL`; the Gmail callback is the portal.
7. Do not upload the current stale `static/uploads/students` tree wholesale; upload the 643-file union manifest (633 production ZIP + 10 explicitly approved fallbacks). The 210-image gap is accepted; record it.
8. Do not write absolute storage URLs into `student_photo`; keep the legacy relative key and use a media-base helper for clients if needed.
9. Do not treat the local drill as the production rollback drill.
10. Do not start Phase 9 until Phase 8’s production load, switch, 24 h watch and rollback gate are complete.

## D9 — Photo URL contract and storage portability

| Decision | Detail |
|---|---|
| DB value | Keep the legacy relative `/uploads/students/<hash>.<ext>`; do **not** backfill `student_photo` with R2/CDN URLs |
| Storage key | `uploads/students/<hash>.<ext>`; the public route maps the relative URL to the storage adapter |
| Client URLs | If an absolute URL is needed, derive it in the DTO from `PUBLIC_MEDIA_BASE`/API base; do not store it |
| Storage move | Keep the key contract, copy objects to the new store, run the photo audit, switch the binding/adapter; no DB migration |
| Consistency | Use the inventory manifest (SHA-256/bytes) and a post-upload `photo-audit` comparing D1 references ↔ storage objects; rerun after any storage move |

## D10 — Production recovery and Free-plan stop (2026-11-07)

| Decision | Detail |
|---|---|
| Partial D1 | `edapex` (`9fe491dc-…`) received the 61,358-write live load and is retained for rollback; it is not the active binding |
| Recovery D1 | `edapex-recovery` (`a6ae7003-…`) was loaded from the validated local rehearsal target (14,039 rows, **87,503 writes**) and is now bound as `DB`; it has 663 target records, 237 students without a target current record, 42 reviewed sections and FK 0 |
| Reason | Promotion batches above ~65 students exceed the Free Worker CPU limit (503) at batch 5; retrying does not advance. Recovery uses the already-validated Phase 7 target instead of rewriting promotion |
| Quota | Account writes are at least **148,861** today, above the Free 100k limit. **Stop all D1 writes** until 00:00 UTC; do not upgrade to Paid |
| Assignment variance | The recovery target has 366 active subject assignments because the rehearsal fixture filled 15 otherwise-empty sections; the bootstrap produced 231. Clean/review after the reset before calling the gate final |
| POC | Untouched; `api.llacademy.ng` still points at the POC. The staged move and EdApex switch remain pending |

## Linked records

- [Runbook](./runbook.md)
- [Checklist](./checklist.md)
- [Monitoring](./monitoring.md)
- [On-call brief](./oncall-brief.md)
- [Rollback drill](./rollback-drill.md)
- [Phase 7 rehearsal report](../audit/phase-7-rehearsal.md)
