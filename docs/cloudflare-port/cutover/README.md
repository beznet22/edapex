# Phase 8 cutover pack

Status: **prepared, not executed.** No production D1/R2 resource, DNS record,
source-MySQL write or traffic switch has been performed from this branch.

This pack turns Phase 8 of the [roadmap](../ROADMAP.md) into an ordered,
rehearsable production procedure. It implements the cutover section of
[`05`](../05-d1-migration.spec.md) and the auth sequence of
[`04a`](../04a-auth-cutover.spec.md) for the current deployment state: **there is
no production D1 yet**, so the cutover performs an initial load from the final
frozen snapshot, not a delta against an earlier production database.

## Preparation evidence

| Check | Status |
|---|---|
| Cutover runbook/checklist/monitoring/on-call/rollback pack | written |
| Decision record | written: account topology, paid-plan recommendation, Gmail reuse, staged domain move |
| Gmail refresh token | verified locally: HTTP 200, `gmail.send` scope; local `apps/api/.dev.vars`; production secrets pending Worker |
| Preflight on the current snapshot | passed: 62 tables, 196,801 rows, 0 FK, 0 reconciliation, 44 SQL files, 625 uploadable/228 missing photos, `executed:false` |
| Local application drill | passed: claim 404/202/202/409/404, target green, roster, marks grade, report-card checksum, core counts unchanged |
| Production resources, load, switch, claim enablement, 24 h watch | **not started** |
| Production rollback drill | **not started** |

The local preflight and drill are tooling evidence only; they do not close the
Phase 8 gate. The committed runbook, checklist and drill summary are the
review artefacts for the separate production approval.

## Documents

| Document | Purpose |
|---|---|
| [decisions.md](./decisions.md) | **Read first:** account topology, billing, Gmail reuse, domain move, open inputs and guardrails |
| [runbook.md](./runbook.md) | Ordered production sequence, commands and stop/go gates |
| [checklist.md](./checklist.md) | Go/no-go checklist, evidence fields and sign-off |
| [monitoring.md](./monitoring.md) | Dashboard panels, alert thresholds, queries and the 24 h watch |
| [oncall-brief.md](./oncall-brief.md) | Roles, escalation, first checks and known gaps |
| [rollback-drill.md](./rollback-drill.md) | What was drilled locally and what remains a production tabletop |

## Operating rules

1. **No cutover action without a separate approval.** The preparation branch is
   local-only. Merging PR #8, creating production resources, writing remote D1,
   uploading to remote R2, changing DNS or writing to source MySQL each require
   explicit approval for the maintenance window.
2. **Fresh target only.** The runbook aborts if the production D1 is non-empty.
   A delta over an existing production database needs a separate design.
3. **The POC is live and separate.** Do not clear or reuse the POC D1, Worker,
   R2 bucket or `api.llacademy.ng` host before the staged move is verified. See
   [decisions.md](./decisions.md).
4. **Free is not enough for the one-window load.** The 196,801-row load plus
   index and API writes exceeds the free 100,000 writes/day. Confirm a paid plan
   or design a multi-day window before starting.
5. **Placeholders are intentional.** Hostnames, account and database ids,
   secrets, on-call names and dates are `<CUTOVER_INPUT>` values. No production
   value is committed.
6. **No PII in git.** Dumps, generated SQL, NDJSON, photo inventories, quarantine
   CSVs and drill copies live under `apps/api/.tmp/` (gitignored). Committed
   evidence is counts, checksums and pass/fail status only.
7. **MySQL stays authoritative and read-only** until every pre-cutover check
   passes and the rollback window closes. The auth reset invalidates legacy
   logins, so the pre-reset password backup is a rollback prerequisite.
8. **The Phase 8 gate stays open** until production load, traffic switch,
   `/claim` enablement, 24 h monitoring and the production rollback drill are
   complete. A local drill is not a production drill.

## Cutover at a glance

```text
approve window
  -> create EdApex D1 + R2; deploy interim EdApex host; set Gmail secrets/test
  -> maintenance page, back up source passwords
  -> run the shared claim reset, set MySQL read_only
  -> take the final dump, record SHA-256
  -> preflight locally (62 tables, 0 FK, 0 reconciliation)
  -> apply migrations and load the remote EdApex D1
  -> integrity -> bootstrap -> staffing review -> activation
  -> archive 1/2/4 -> promotion -> quarantine -> photos/timelines
  -> readiness -> move POC to sms-api -> portal rebuild -> attach api to EdApex
  -> enable /claim -> 24 h watch -> close the rollback window
```

Rollback keeps the POC on `sms-api`, moves EdApex back to its interim host, and
keeps MySQL read-only. If the reset has already run, restore the pre-reset
password backup before pointing traffic back.

## Source material

- [Phase 7 rehearsal report](../audit/phase-7-rehearsal.md)
- [Migration order](../audit/migration-order.md)
- [Integrity report](../audit/integrity-report.md)
- [`apps/api/AUTH_CUTOVER.md`](../../../apps/api/AUTH_CUTOVER.md)
- [`apps/api/scripts/migration/README.md`](../../../apps/api/scripts/migration/README.md)
- [`apps/api/scripts/cutover/README.md`](../../../apps/api/scripts/cutover/README.md)
