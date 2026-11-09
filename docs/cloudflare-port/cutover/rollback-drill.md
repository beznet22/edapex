# Rollback drill

Status: **local drill passed; production drill still required.** This document
records what the local execution proves and what it does not. It is not evidence
that the Phase 8 rollback gate is closed.

## Why this drill exists

The Phase 8 gate requires a rehearsed rollback. The production rollback changes
DNS/routing and may need a source-MySQL password restore, neither of which can be
exercised from a prep branch. The local drill exercises the application-level
part on a disposable copy of the Phase 7 D1; the production part remains a
tabletop until the approved window.

## Local drill

From `apps/api/`:

```bash
pnpm run cutover:drill -- \
  --persist .tmp/rehearsal-a \
  --out .tmp/cutover-drill
```

The drill copies the rehearsal D1 to `.tmp/cutover-drill/d1`; it refuses to use
the source directory as its output. It verifies the source
`.tmp/rehearsal-a/evidence.json` SHA-256 before and after, so the Phase 7 evidence
cannot be silently mutated.

### What it proves

- The Worker starts against the copy and `/health` returns 200.
- With claim disabled, `POST /api/v1/auth/claim` returns 404.
- The target session integrity gate is green; the unreviewed-section count is
  zero and the current-record count matches the Phase 7 evidence.
- The staffing list matches the Phase 7 evidence; a teacher session can read its
  class/section roster.
- A one-subject result can be written and read back, and the report-card review
  returns a document with a non-null grade/total.
- With claim enabled, a known drill account returns 202 with a claim cookie; an
  unknown email returns 202 without a ticket; an ambiguous email returns
  409 `AMBIGUOUS_EMAIL`.
- Rolling back to claim-disabled returns `/claim` to 404 while the admin session
  still reaches the integrity endpoint.
- Core student/record/class/section counts are unchanged; only the expected
  drill tables change (`users`, `auth_events`, `auth_sessions`, marks/results,
  archive).

### What it does not prove

- DNS or route reversion. There is no production host in the drill.
- Source-MySQL read-only state, binlog position or password-backup restore.
- Production traffic volume, Cloudflare cache behaviour or real claim traffic.
- Completion of the claim ticket through Google. The drill proves ticket
  issuance, not the Google link; the Phase 5 suite covers the link.

**The production rollback drill and the signed checklist are still required
before the Phase 8 gate can be marked complete.**

## Production tabletop (before the window)

Walk the following with the cutover lead, rollback authority and source owner:

1. **Disable claim first.** Set `CLAIM_ENABLED` to unset/`0`; deploy or update
   the secret; call `/claim` and confirm 404.
2. **Move the host, not the data.** Keep the POC on `sms-api.llacademy.ng`.
   Return EdApex to `edapex-api.llacademy.ng`; reattach `api.llacademy.ng` to
   the POC only if external clients still require that host. The portal already
   points at `sms-api`; `CLIENT_URL` stays the portal.
3. **Keep MySQL read-only.** Do not reopen writes just because traffic moved
   back. Record the read-only state and binlog position.
4. **Restore the pre-reset password backup if the shared reset already ran.**
   Verify a known account can authenticate through the legacy path. If the
   restore cannot be completed, the rollback authority declares the legacy app
   unavailable and opens an incident; the API is not used to “fix” source
   passwords.
5. **Freeze D1.** No writes after the decision; capture the table counts and
   request ids for the post-mortem.
6. **Communicate and preserve.** Announce the rollback, keep the dump, D1, R2
   objects and evidence, and schedule the post-mortem.

## Production drill (during the window)

The gate item is satisfied only by an executed drill that records:

- claim disable → `/claim` 404;
- route/POC check → `sms-api.llacademy.ng` healthy; portal login and Gmail send work;
- MySQL read-only verified; password backup restore tested or explicitly
  deferred by the rollback authority with the consequence recorded;
- no D1 writes after the decision;
- return to the cutover state (if the drill is non-destructive) or a clean
  rollback decision.

## Drill findings

- The first run failed the target integrity gate because the synthetic claim
  accounts were seeded as **active** users with no student/staff/parent profile,
  which correctly raised the blocking `P4` count. The drill now seeds those
  accounts as inactive; the claim path does not filter on active status, so the
  claim assertions still exercise the route without changing the gate.
- The second run passed all phases. The only Worker error in the logs is the
  expected `AmbiguousEmailError` for the 409 probe; it is the assertion target,
  not an incident.
- All claim accounts are synthetic (`@example.test`) and inactive. No real
  account, email or student identity is in the evidence.

## Evidence

Local evidence stays in `.tmp/cutover-drill/evidence.json` (gitignored). The
committed summary below contains counts and status only.

| Field | Value |
|---|---|
| Drill date | 2026-11-07 |
| Source rehearsal evidence SHA-256 | `66fed58eaa2ef369a81035c857d7fd2a4d703bfcf5216bf13846ca69437fc5d8` |
| Source evidence unchanged after drill | yes (same SHA-256) |
| Local drill status | **passed** |
| Health / claim disabled | 200 / 404 |
| Target integrity | green; 0 unreviewed; 663 current records |
| Staffing / FIRST TERM | 42 sections; 2026-09-14 → 2026-12-11 |
| Teacher roster / marks / report card | 5 roster rows; NURSERY grade present; review `reviewed`, checksum returned |
| Claim enabled | known 202 + ticket; unknown 202 no ticket; ambiguous 409 `AMBIGUOUS_EMAIL` |
| Rollback | claim 404; admin integrity 200 |
| Core-count check | unchanged: 900 students, 2,097 records, 36 classes, 10 sections, 113 class-sections, 829 assignments, 4 academic years |
| Production tabletop | `<PENDING>` |
| Production drill | `<PENDING>` |
| Gate satisfied | **No** |
