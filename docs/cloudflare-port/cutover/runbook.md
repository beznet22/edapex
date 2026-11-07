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
| Production API hostname | `<CUTOVER_INPUT>` |
| Legacy hostname kept for rollback | `<CUTOVER_INPUT>` |
| Cloudflare account and zone | `<CUTOVER_INPUT>` |
| Production D1 database id | `<CUTOVER_INPUT>` |
| Production R2 bucket | `edapex-media` (or `<CUTOVER_INPUT>`) |
| Final frozen dump path | `<CUTOVER_INPUT>` |
| Final dump SHA-256 | `<CUTOVER_INPUT>` |
| Shared claim digest | `<CUTOVER_INPUT>` (the SHA-256 stored in `CLAIM_PASSWORD_DIGEST`) |
| Pre-reset source backup | `<CUTOVER_INPUT>` |
| On-call channel / contacts | `<CUTOVER_INPUT>` |

## Phase 0 — Approvals and preconditions

- [ ] PR #8 is merged into `phase-6-archive` and the Phase 8 branch is rebased;
      the deployed commit is recorded.
- [ ] The Phase 7 report and A/B evidence are reviewed:
      [`audit/phase-7-rehearsal.md`](../audit/phase-7-rehearsal.md).
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

1. Create the resources and record the ids:

   ```bash
   pnpm exec wrangler d1 create edapex
   pnpm exec wrangler r2 bucket create edapex-media
   ```

2. Put the real D1 id in `wrangler.jsonc` and set the production CORS origins.
   Add the custom domain or Worker route for `<CUTOVER_HOST>`. Keep
   `CLAIM_ENABLED` unset so `/claim` stays 404.

3. Set production secrets (values are entered interactively or through the
   dashboard; never in git):

   ```bash
   pnpm exec wrangler secret put AUTH_COOKIE_SECRET
   pnpm exec wrangler secret put CLAIM_PASSWORD_DIGEST
   pnpm exec wrangler secret put ARCHIVE_TOKEN_SECRET
   pnpm exec wrangler secret put GOOGLE_CLIENT_ID
   pnpm exec wrangler secret put GOOGLE_CLIENT_SECRET
   # plus GMAIL_* or the email-routing binding, and MISTRAL_* if OCR is enabled
   ```

   `CLAIM_PASSWORD_DIGEST` must equal the digest passed to the final preflight.

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

4. Deploy the Worker with claim disabled:

   ```bash
   pnpm exec wrangler deploy
   curl -fsS "https://<CUTOVER_HOST>/health"
   curl -s -o /dev/null -w '%{http_code}\n' \
     -X POST "https://<CUTOVER_HOST>/api/v1/auth/claim" \
     -H 'content-type: application/json' \
     -d '{"email":"probe@example.test","password":"probe"}'
   # expect 404
   ```

## Phase 5 — API-driven migration and history

Use a real administrator login. **Never use the rehearsal
`mintAdminSession` path against remote D1.** Keep the admin cookie in the
private cutover shell; do not paste it into logs.

1. Read the source gate:

   ```bash
   curl -fsS "https://<CUTOVER_HOST>/api/v1/admin/sessions/4/integrity" \
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
   curl -fsS "https://<CUTOVER_HOST>/api/v1/admin/sessions/5/staffing" \
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

## Phase 7 — Switch traffic and enable `/claim`

1. Lower DNS TTL ahead of the window. Keep the legacy host resolvable.
2. Point `<CUTOVER_HOST>` at the Worker; keep the legacy host as the rollback
   target. Confirm CORS origins include the production UI origins.
3. Smoke the Worker through the production host: `/health`, an unauthenticated
   protected route (401), a public photo sample (200), an archive token sample
   if one is approved.
4. Watch 5xx/latency for 15 minutes. If clean, enable claim:

   ```bash
   pnpm exec wrangler secret put CLAIM_ENABLED   # enter 1
   pnpm exec wrangler deploy
   curl -s -o /dev/null -w '%{http_code}\n' \
     -X POST "https://<CUTOVER_HOST>/api/v1/auth/claim" \
     -H 'content-type: application/json' \
     -d '{"email":"probe@example.test","password":"probe"}'
   # expect 202
   ```

   If the deployment model does not require a second deploy after the secret
   update, verify the live version instead. Do not enable claim before the
   readiness and spot checks pass.

5. Announce the claim removal date. Start the 24 h watch using
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
2. Revert DNS/routes to `<LEGACY_HOST>`. Do not delete the Worker or its data.
3. Keep MySQL read-only. If the shared reset has already run, restore the
   pre-reset `users` password backup **before** reopening legacy login; verify a
   known account.
4. Do not write to D1 after the rollback decision. Record the D1 state, request
   ids, timestamps and the reason in the incident log.
5. Verify legacy health and a read-only smoke path; confirm no new writes are
   reaching the source while the decision is open.
6. Keep the dump, D1, R2 objects and generated evidence for the post-mortem.

The production rollback drill is a tabletop before the window. The local drill
proves the application-level claim disable/restart and data stability; it does
not prove DNS or MySQL rollback. See [rollback-drill.md](./rollback-drill.md).

## Evidence to record

For every phase: timestamp, operator role, command or endpoint, result, and the
evidence path. Use the checklist. Committed evidence must contain counts,
checksums and statuses only — no student names, emails, phone numbers, marks or
secrets.

## Do not

- deploy from a feature branch without recording the commit;
- use the rehearsal session-minting path against remote D1;
- run a delta against an existing production D1 under this runbook;
- invent term dates, class placements or photo files;
- enable claim before the readiness and spot checks pass;
- push `main` as part of the cutover.
