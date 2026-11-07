# Phase 8 cutover runbook

Status: **template for the approved cutover window.** No step below has been
executed against production from this branch. Commands run from `apps/api/`
unless a step says otherwise.

## Inputs

Fill these only in the private cutover record, never in git:

| Input | Value |
|---|---|
| Cutover lead / rollback authority | `<CUTOVER_INPUT>` |
| Maintenance window | `<CUTOVER_INPUT>` |
| Production API hostname | `api.llacademy.ng` (after the POC moves) |
| Interim EdApex host | `edapex-api.llacademy.ng` |
| POC API host after move | `sms-api.llacademy.ng` |
| POC frontend | `https://portal.llacademy.ng` (unchanged) |
| Cloudflare account and zone | existing SMS POC account `<CUTOVER_INPUT>` |
| Workers plan | Workers Paid (recommended) or approved multi-day free window |
| Production D1 database id | `<CUTOVER_INPUT>` (new `edapex`, never the POC `sms`) |
| Production R2 bucket | `edapex-media` (or `<CUTOVER_INPUT>`) |
| Final frozen dump path | `<CUTOVER_INPUT>` |
| Final dump SHA-256 | `<CUTOVER_INPUT>` |
| Shared claim digest | `<CUTOVER_INPUT>` (the SHA-256 stored in `CLAIM_PASSWORD_DIGEST`) |
| Pre-reset source backup | `<CUTOVER_INPUT>` |
| On-call channel / contacts | `<CUTOVER_INPUT>` |

## Deployment topology and coexistence

The existing Cloudflare account is shared with a **live** SMS POC. The cutover
must not break it.

| Resource | POC | EdApex |
|---|---|---|
| Worker | `sms-api` (live) | new `edapex-api` |
| D1 | `sms` (live, UUID schema, already contains migrated data) | new `edapex` |
| R2 | `sms-study-materials` | new `edapex-media` |
| Frontend | Pages `sms-portal` at `portal.llacademy.ng` | EdApex frontend (origin `<CUTOVER_INPUT>`) |
| API host | moves to `sms-api.llacademy.ng` | takes `api.llacademy.ng` |

Rules:

- **Never clear, overwrite or reuse the POC D1.** It is not a disposable demo.
- **Do not create a second Cloudflare account** for quota; free limits are
  account-wide and a new Worker/D1 does not add free resources.
- **Do not attempt the 196,801-row load in one free-plan window.** Confirm
  Workers Paid or a multi-day staged load before starting.
- Keep the POC’s `CLIENT_URL=https://portal.llacademy.ng`; its Gmail callback is
  on the portal and must not move with the API.

See [decisions.md](./decisions.md) for the full decision record.

## Phase 0 — Approvals and preconditions

- [ ] PR #8 is merged into `phase-6-archive` and the Phase 8 branch is rebased;
      the deployed commit is recorded.
- [ ] The Phase 7 report and A/B evidence are reviewed:
      [`audit/phase-7-rehearsal.md`](../audit/phase-7-rehearsal.md).
- [ ] The Cloudflare account plan is confirmed. Free is acceptable only with an
      approved multi-day load; otherwise use Workers Paid.
- [ ] The POC is confirmed live and must remain so; its D1, Worker, R2 bucket
      and current host are not touched until the staged move.
- [ ] The POC Pages deploy method is confirmed (Git integration or
      `wrangler pages deploy`) and the frontend can be rebuilt.
- [ ] The Gmail reuse is confirmed: same Google client, sender in the private
      record, `GMAIL_*` values available, OAuth app publishing status checked.
      Local `apps/api/.dev.vars` is present and gitignored.
- [ ] Google redirect URIs are registered: POC portal callbacks, EdApex
      `https://api.llacademy.ng/api/v1/auth/google/callback`, and the one-off
      consent redirect.
- [ ] The EdApex Worker does not exist yet; the first deploy will use the
      interim host, not `api.llacademy.ng`.
- [ ] The maintenance window, communications and rollback authority are
      approved.
- [ ] The 228 missing student-photo files are supplied, or the school has
      accepted the gap in writing. Do not upload placeholders.
- [ ] The source owner confirms the final dump method (Adminer export), the
      source backup location and the pre-reset password backup.
- [ ] Cloudflare account access, D1/R2 permissions and DNS access are confirmed.
- [ ] The production D1 does **not** exist or is empty. If it is non-empty,
      **stop**: this runbook is a fresh load, not a delta.

## Phase 1 — Production resources and configuration

1. Create the EdApex-only resources and record the ids. Do **not** reuse the
   POC database or bucket:

   ```bash
   pnpm exec wrangler d1 create edapex
   pnpm exec wrangler r2 bucket create edapex-media
   ```

2. Put the real D1 id in `wrangler.jsonc` and set the production CORS origins.
   Add the **interim** custom domain or Worker route for
   `edapex-api.llacademy.ng`. Do not attach `api.llacademy.ng` yet; the POC still
   owns it. Keep `CLAIM_ENABLED` unset so `/claim` stays 404.

3. The Worker does not exist yet, so secrets cannot be set in this phase.
   Record the secret names below; after the first deploy in Phase 4, set them all
   with `wrangler secret put` (values are entered interactively or through the
   dashboard; never in git):

   ```bash
   pnpm exec wrangler secret put AUTH_COOKIE_SECRET
   pnpm exec wrangler secret put CLAIM_PASSWORD_DIGEST
   pnpm exec wrangler secret put ARCHIVE_TOKEN_SECRET
   pnpm exec wrangler secret put GOOGLE_CLIENT_ID
   pnpm exec wrangler secret put GOOGLE_CLIENT_SECRET
   pnpm exec wrangler secret put GMAIL_CLIENT_ID
   pnpm exec wrangler secret put GMAIL_CLIENT_SECRET
   pnpm exec wrangler secret put GMAIL_REFRESH_TOKEN
   pnpm exec wrangler secret put GMAIL_SENDER_EMAIL
   pnpm exec wrangler secret put GMAIL_SENDER_NAME
   # plus MISTRAL_* if OCR is enabled
   ```

   The Gmail client can be the same Google client as the POC; the refresh token
   is the one generated for EdApex. `GMAIL_SENDER_EMAIL` is in the private
   cutover record, not git.

4. Before any deploy, reject the placeholder database id:

   ```bash
   grep -q '00000000-0000-0000-0000-000000000000' wrangler.jsonc \
     && { echo 'STOP: placeholder D1 id'; exit 1; }
   ```

## Phase 2 — Freeze the source, back up, reset, take the final dump

The order matters. The auth reset invalidates legacy logins, and a rollback
after the reset needs the pre-reset password hashes.

1. Announce the window; put the legacy app into maintenance mode and stop new
   writes.

2. Back up the source before the reset (full database or at minimum `users`):

   ```bash
   mysqldump <SOURCE_OPTIONS> <SOURCE_DB> users > <BACKUP_PATH>/users-pre-reset.sql
   # or the source owner's equivalent snapshot
   ```

3. Generate and review the shared-digest reset SQL, then run it against source
   MySQL:

   ```bash
   pnpm run auth:claim-reset-sql -- --password '<SHARED_CLAIM_PASSWORD>' \
     > .tmp/cutover/claim-reset.sql
   ```

   Run it in the window and verify the row count it reports. Record the count in
   the checklist. The reset is a source write and needs the same approval as the
   cutover.

4. Freeze writes and record the position:

   ```sql
   SET GLOBAL read_only = ON;
   SHOW GLOBAL VARIABLES LIKE 'read_only';   -- expect ON
   SHOW MASTER STATUS;                       -- record file + position
   ```

   Any write after this point is a stop condition. Do not take the dump while
   writes are still possible.

5. Export the final Adminer dump to `<FINAL_DUMP>` using the same method as
   `edapexdb.sql`. Record:

   ```bash
   sha256sum <FINAL_DUMP>
   ```

   Verify it contains the 62 catalog tables. A missing or extra catalog table is
   a stop condition.

## Phase 3 — Local preflight (no remote writes)

Run the preflight against the final frozen dump:

```bash
pnpm run cutover:preflight -- \
  --source <FINAL_DUMP> \
  --out .tmp/cutover-plan \
  --digest '<CLAIM_DIGEST>' \
  --fresh
```

Require all of the following before continuing:

- 62 legacy tables present; 0 foreign-key violations; 0 reconciliation
  mismatches; 0 sequence failures; 0 current-record orphans; expected equals
  actual resolution count.
- The generated SQL files are in tier order and each has a SHA-256.
- `cutover-plan.json` has `executed:false`; the preflight has not called
  `wrangler ... --remote`.
- The photo manifest lists every referenced image. The 228 historically missing
  files are either present or covered by the written acceptance from Phase 0.

Review `d1-load.sh`, `d1-verify.sh` and `photo-upload.sh` before the window.
They are generated command lists; they are not run by the preflight.

## Phase 4 — Remote schema and initial load

1. Apply migrations to the fresh production D1:

   ```bash
   pnpm exec wrangler d1 migrations apply DB --remote
   ```

2. Review `d1-load.sh` once more. It must contain only `--remote` commands and
   must not contain `mintAdminSession`, a local persist directory or a secret.
   Execute it:

   ```bash
   bash .tmp/cutover-plan/d1-load.sh
   ```

3. Verify:

   ```bash
   pnpm exec wrangler d1 execute DB --remote --command="PRAGMA foreign_key_check;"
   bash .tmp/cutover-plan/d1-verify.sh
   ```

   Every table count must equal `cutover-plan.json`. Any FK row, unexplained
   count variance above 0.1%, sequence gap or current-record orphan is a stop
   condition.

4. Deploy the Worker with claim disabled to the **interim** host:

   ```bash
   pnpm exec wrangler deploy
   curl -fsS "https://edapex-api.llacademy.ng/health"
   curl -s -o /dev/null -w '%{http_code}\n' \
     -X POST "https://edapex-api.llacademy.ng/api/v1/auth/claim" \
     -H 'content-type: application/json' \
     -d '{"email":"probe@example.test","password":"probe"}'
   # expect 404
   ```

5. Now that the Worker exists, set all production secrets from Phase 1 (auth,
   claim, archive and Gmail), then send a test email through EdApex to a private
   test address. A successful token exchange is not enough; verify the Gmail
   adapter sends. If it returns `invalid_grant`, stop: the token is
   expired/revoked or was issued to a different client.

## Phase 5 — API-driven migration and history

Use a real administrator login. **Never use the rehearsal
`mintAdminSession` path against remote D1.** Keep the admin cookie in the
private cutover shell; do not paste it into logs.

1. Read the source gate:

   ```bash
   curl -fsS "https://edapex-api.llacademy.ng/api/v1/admin/sessions/4/integrity" \
     -H "Cookie: $ADMIN_COOKIE" -H 'X-Academic-Id: 4'
   ```

   Blocking identity findings must be zero.

2. Bootstrap the target session (id 5, 2026/2027, 2026-09-14 → 2027-07-30)
   with the FIRST TERM dated 2026-09-14 → 2026-12-11 and `activate:false`.
   Use the payload shape in `scripts/migration/rehearse.mjs` (`bootstrapBody`),
   including the three `UPPER_BASIC_CLASSES` from `scripts/migration/tables.mjs`.
   Run the dry-run first, then the real run; poll the returned job.

3. Review staffing:

   ```bash
   curl -fsS "https://edapex-api.llacademy.ng/api/v1/admin/sessions/5/staffing" \
     -H "Cookie: $ADMIN_COOKIE" -H 'X-Academic-Id: 5'
   ```

   Accept copied rows, then replace every remaining section with its reviewed
   teacher/subject set. Activation is blocked until every section is reviewed.

4. Rerun bootstrap with `activate:true`. Verify:
   - target integrity gate green;
   - 42 class-sections, 231 active subject assignments, 6 categories, 7 grade
     bands and one dated FIRST TERM;
   - no unreviewed sections and no unstaffed classes.

5. Archive sessions 1, 2 and 4 with `purge:true`, one at a time. For each:
   - confirm the manifest object count equals the exported count;
   - verify every object checksum;
   - record gaps (74 for session 1, 16 for session 4, 0 for session 2);
   - confirm live marks/results/ratings/remarks/attendance for that session are
     zero after purge.

6. Run promotion class by class through the API:

   ```bash
   POST /api/v1/admin/sessions/5/promote   { "dryRun": true,  "outcomeForMissing": "quarantine" }
   POST /api/v1/admin/sessions/5/promote   { "dryRun": false, "outcomeForMissing": "quarantine" }
   ```

   Poll the job endpoints used by the rehearsal. Verify the destination roster
   against the Phase 7 evidence (663 current records on the current snapshot;
   639 promoted + 24 DAYCARE, 3 unplaced, 234 no current record, 15 non-default
   duplicate source records). A different final snapshot is allowed only when
   the preflight explains the variance. Generate the quarantine CSV and PDF
   payload; review the 237-row report.

7. Upload photos:

   ```bash
   bash .tmp/cutover-plan/photo-upload.sh
   ```

   This uses `wrangler r2 object put ... --remote` (Wrangler v4 defaults to local
   mode, so `--remote` is mandatory). Verify object count, total bytes and a
   sample of full-object hashes; fetch the same sample through
   `/uploads/students/...` and expect 200 with immutable caching. The 228
   missing files stay listed in `missing-photos.csv`; do not upload placeholders.

8. Upload the timeline NDJSON exports from the preflight’s
   `.tmp/cutover-transform/timelines/` to the archive namespace in R2, then
   verify their SHA-256 values against `manifest.json`. The live
   `sm_student_timelines` table stays empty by design.

9. Readiness check: repeat the local drill’s production equivalent with real
   accounts — teacher → class/section → roster → term → marks entry → report
   card with a grade. Record the account ids and status, not names or marks.

## Phase 6 — Final verification

- [ ] Per-table counts: final dump vs D1; every variance explained.
- [ ] `PRAGMA foreign_key_check` returns zero rows.
- [ ] Every archived object checksum verifies; manifest counts match.
- [ ] Live historical marks/results/ratings/remarks/attendance are zero.
- [ ] Every student has at most one current record; the 3 unplaced and 234
      no-current students are quarantined, not silently placed.
- [ ] Every class-section is reviewed; zero classes without assignments.
- [ ] FIRST TERM has dates; 7 grade bands exist for year 5.
- [ ] The spot-check set (Phase 7 archive checksums plus a deterministic sample
      of student results) matches; any unexplained result-total difference is a
      rollback trigger.
- [ ] Readiness test passed.
- [ ] Claim is still 404 before the switch.

## Phase 7 — Move the POC, switch EdApex, enable `/claim`

1. Add `sms-api.llacademy.ng` as a **second** custom domain to the POC Worker;
   deploy the production env; verify TLS, `/health`, login and the Gmail flow.
   Keep `api.llacademy.ng` attached to the POC for now.
2. Change only the POC frontend API base:
   `sms-frontend/.env.production` → `https://sms-api.llacademy.ng/api`.
   Rebuild and redeploy `sms-portal`; verify the portal and a Gmail send. Keep
   `CLIENT_URL=https://portal.llacademy.ng`; do not move the Gmail callback.
3. Only after step 2 passes, remove `api.llacademy.ng` from the POC Worker.
   Attach it to EdApex in `wrangler.jsonc`, deploy, and verify TLS and `/health`.
   This handover is a short hostname window; do it in low traffic.
4. Smoke EdApex through `api.llacademy.ng`: `/health`, an unauthenticated
   protected route (401), a public photo sample (200), an archive token sample
   if approved, and a Gmail send through EdApex.
5. Watch 5xx/latency for 15 minutes. If clean, enable claim:

   ```bash
   pnpm exec wrangler secret put CLAIM_ENABLED   # enter 1
   pnpm exec wrangler deploy
   curl -s -o /dev/null -w '%{http_code}\n' \
     -X POST "https://api.llacademy.ng/api/v1/auth/claim" \
     -H 'content-type: application/json' \
     -d '{"email":"probe@example.test","password":"probe"}'
   # expect 202
   ```

   If the deployment model does not require a second deploy after the secret
   update, verify the live version instead. Do not enable claim before the
   readiness and spot checks pass.

6. Announce the claim removal date. Start the 24 h watch using
   [monitoring.md](./monitoring.md).

## Phase 8 — Close the window

- [ ] 24 h of claim metrics, 5xx rate and D1 query budget reviewed.
- [ ] No rollback trigger fired, or the incident is recorded and resolved.
- [ ] MySQL remains read-only and authoritative until the rollback window
      closes; then follow the separately approved retirement plan.
- [ ] Checklist signed; evidence attached; PROGRESS updated.
- [ ] Do not delete the source backup, the final dump, the D1 database or the R2
      objects during the rollback window.

## Rollback

**Triggers:** any FK violation, unexplained count variance above 0.1%, result
totals differing from the spot-check set, sustained 5xx or a failed readiness
check.

1. Disable claim first (`CLAIM_ENABLED` unset or `0`; deploy if required) and
   confirm `/claim` returns 404.
2. If the failure is after EdApex took `api.llacademy.ng`, keep the POC on
   `sms-api.llacademy.ng` and move EdApex back to `edapex-api.llacademy.ng`.
   Reattach `api.llacademy.ng` to the POC only if external clients still use
   that host; the portal already points at `sms-api`.
3. If the failure is during the POC move, revert the POC frontend
   `VITE_API_URL` to the old `api.llacademy.ng` base and keep the POC route;
   do not change `CLIENT_URL`.
4. Keep MySQL read-only. If the shared reset has already run, restore the
   pre-reset `users` password backup **before** reopening legacy login; verify a
   known account.
5. Do not write to D1 after the rollback decision. Record the D1 state, request
   ids, timestamps and the reason in the incident log.
6. Verify legacy/POC health and a read-only smoke path; confirm no new writes are
   reaching the source while the decision is open.
7. Keep the dump, D1, R2 objects and generated evidence for the post-mortem.

The production rollback drill is a tabletop before the window. The local drill
proves the application-level claim disable/restart and data stability; it does
not prove DNS or MySQL rollback. See [rollback-drill.md](./rollback-drill.md).

## Evidence to record

For every phase: timestamp, operator role, command or endpoint, result, and the
evidence path. Use the checklist. Committed evidence must contain counts,
checksums and statuses only — no student names, emails, phone numbers, marks or
secrets.

## Do not

- clear, reuse or overwrite the POC D1, Worker, R2 bucket or host;
- remove `api.llacademy.ng` from the POC before the new host and portal are
  verified;
- change the POC `CLIENT_URL`; its Gmail callback is on the portal;
- attempt the 196,801-row load in one free-plan window;
- deploy from a feature branch without recording the commit;
- use the rehearsal session-minting path against remote D1;
- run a delta against an existing production D1 under this runbook;
- invent term dates, class placements or photo files;
- enable claim before the readiness and spot checks pass;
- push `main` as part of the cutover.
