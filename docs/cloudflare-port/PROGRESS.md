# PROGRESS — Cloudflare port

Live status for the implementation phases defined in [ROADMAP.md](./ROADMAP.md). The roadmap says **what** each phase is; this file says **where we are**.

Port code lands in [`cloudflare/`](../../cloudflare/AGENTS.md).

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

**Phase 0 — Scaffolding and guards.** No phase has started. The migration cannot start until Phase 7; do not jump ahead.

## Phase status

| Phase | Name | Status | Owner | Started | Completed | Gate evidence |
|---|---|---|---|---|---|---|
| 0 | Scaffolding and guards | not started | — | — | — | — |
| 1 | D1 schema and migrations | not started | — | — | — | — |
| 2 | Repository layer | not started | — | — | — | — |
| 3 | Service layer | not started | — | — | — | — |
| 4 | HTTP layer | not started | — | — | — | — |
| 5 | Auth cutover flow | not started | — | — | — | — |
| 6 | Archive and retrieval | not started | — | — | — | — |
| 7 | Migration execution | not started | — | — | — | — |
| 8 | Cutover | not started | — | — | — | — |
| 9 | Post-cutover | not started | — | — | — | — |

## Gate checklists

### Phase 0 — Scaffolding
- [ ] `wrangler dev` serves `/health`
- [ ] D1 binding declared; local migration applies
- [ ] CI runs typecheck, tests, both verifiers
- [ ] Import-boundary test scaffolded

### Phase 1 — Schema
- [ ] 62 legacy tables + redesigned tables created
- [ ] Every table ≤100 columns
- [ ] 226 secondary indexes declared
- [ ] `PRAGMA foreign_key_check` returns zero rows

### Phase 2 — Repositories
- [ ] All `01b` destinations implemented
- [ ] Seven passthroughs deleted; retired auth methods removed
- [ ] Tenant-isolation test per public read
- [ ] No `db.transaction(`, no `any`, files within caps

### Phase 3 — Services
- [ ] 53 methods mapped per `02`
- [ ] `ServiceContext` built once per request
- [ ] No `getDatabase` / `fs` / service-to-service imports
- [ ] Report-settings imported from JSON and verified by count

### Phase 4 — HTTP
- [ ] 20 in-scope endpoints implemented; demo endpoints retired
- [ ] Flat envelope; 422 body byte-compatible
- [ ] `AppType` + `hc<AppType>` type test green
- [ ] CORS and public-router isolation tests green

### Phase 5 — Auth cutover
- [ ] `/claim` end-to-end on local D1
- [ ] Duplicate email returns `409 AMBIGUOUS_EMAIL`
- [ ] Student codes issue / reissue / revoke
- [ ] Claim flow under 10 ms CPU on `wrangler dev`

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
- [ ] Workspace package wiring verified (roadmap Part 5); `cloudflare/` remains the in-repo **EdApex API backend**

## Change log

| Date | Phase | Change | Agent |
|---|---|---|---|
| 2026-11-05 | — | Spec suite, roadmap, and progress tracker created; no implementation started | — |

## Blockers and decisions

| Item | Blocks | Status | Owner |
|---|---|---|---|
| Terms 2 and 3 calendars | Phase 7 (terms endpoint only) | waiting on school | — |
| Term-date confirmation for FIRST TERM | Phase 7 | fixed from `assets/calendar.jpeg` (2026-09-14 → 2026-12-11); confirm against official notice | — |
| Repository layout | Phase 9 completion | decided — `cloudflare/` stays in this repository and becomes a pnpm workspace package; no standalone extraction | — |

## Notes

- The measured baseline in [README.md](./README.md) is a snapshot of the remote dump. Refresh `docs/cloudflare-port/audit/db-inventory.json` before Phase 7 and update the numbers if they moved.
- Phase gates are cumulative: a later phase passing does not excuse an earlier gate that was skipped.
