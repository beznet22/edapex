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

**Phase 1 — D1 schema and migrations.** Local gate passed on `phase-1-schema`; CI pending push. Phase 2 (repository layer) is next.

## Phase status

| Phase | Name | Status | Owner | Started | Completed | Gate evidence |
|---|---|---|---|---|---|---|
| 0 | Scaffolding and guards | done | Kimchi | 2026-11-05 | 2026-11-05 | PR #1 check `port` green ([run 42083953037](https://github.com/beznet22/edapex/actions/runs/42083953037)): typecheck, boundary + self-test, Workers test, D1 apply, both verifiers. Local: `/health` 200. |
| 1 | D1 schema and migrations | in progress | Kimchi | 2026-11-06 | — | Local gate green on `phase-1-schema`: 74 tables (62 legacy + 12 registered), 226 recovered + 5 spec indexes, `PRAGMA foreign_key_check` zero rows; typecheck, boundaries, tests, drift, dry-run deploy, both verifiers pass. CI run pending push. |
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

## Blockers and decisions

| Item | Blocks | Status | Owner |
|---|---|---|---|
| Terms 2 and 3 calendars | Phase 7 (terms endpoint only) | waiting on school | — |
| Term-date confirmation for FIRST TERM | Phase 7 | fixed from `assets/calendar.jpeg` (2026-09-14 → 2026-12-11); confirm against official notice | — |
| Repository layout | Phase 9 completion | decided — `apps/api/` is the API service and becomes a pnpm workspace package; `apps/` is the deployable bucket; no standalone extraction | — |
| Phase 1 index arithmetic | Phase 2+ index work | decided — the 226 gate is 224 verbatim recovered (the two `session_id` indexes go with the dropped columns, `05 §4`) plus 01a O11's two new `chat_group_users` indexes; 05/04 add 5 more spec-mandated indexes, so legacy tables carry 231 secondary indexes total | — |
| `sm_general_settings.identity` | Phase 7 transform | decided — created as a new TEXT column per 01a §6 even though no legacy column exists; `extras` therefore holds 95 legacy fields, not 94. Phase 7 must read the schema, not the prose | — |
| `01a O2` school-id-leading composites | Phase 2 | deferred — recovered indexes keep the inventory's verbatim names and column order so the gate matches the artifact; tenant-leading composites are added query-driven in Phase 2 | — |

## Notes

- The measured baseline in [README.md](./README.md) is a snapshot of the remote dump. Refresh `docs/cloudflare-port/audit/db-inventory.json` before Phase 7 and update the numbers if they moved.
- Phase gates are cumulative: a later phase passing does not excuse an earlier gate that was skipped.
- Phase 0 landed on `phase-0-scaffolding` (PR #1). `main` was not pushed because Dokploy deploys on commit; the branch carries the preflight spec-suite commit `b83de20`. Do not push `main` until the Dokploy trigger is confirmed blocked.
