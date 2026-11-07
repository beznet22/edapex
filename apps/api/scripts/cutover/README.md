# Cutover scripts

Operational tooling for the Phase 8 cutover. Both scripts are local-only; the
commands they generate contain the only `--remote` calls and are never executed
by the scripts themselves.

Read the Phase 8 [decision record](../../../../docs/cloudflare-port/cutover/decisions.md)
before using these scripts: the POC D1 is not disposable, the POC moves to
`sms-api.llacademy.ng`, EdApex takes `api.llacademy.ng`, and the load needs a
paid plan or an approved multi-day free window.

## Preflight

```bash
pnpm run cutover:preflight -- \
  --source ../../edapexdb.sql \
  --out .tmp/cutover-plan \
  --digest <64-hex claim digest> \
  --fresh
```

The preflight runs the existing transform and a disposable local D1 load, then
writes to `--out` (must be a child of `apps/api/.tmp/`):

| File | Purpose |
|---|---|
| `cutover-plan.json` | Counts, gates, SQL checksums and the command plan |
| `sql/` | Tier-ordered SQL files with SHA-256 values in the plan |
| `d1-load.sh` | Remote D1 execution, reviewed and run only in the window |
| `d1-verify.sh` / `d1-verify.mjs` | Remote per-table count and FK verification |
| `photo-upload.sh` | Remote R2 uploads for the files present locally |
| `missing-photos.csv` | Referenced files absent from the local static tree |

The output is PII-bearing or account-specific; it stays under `.tmp/` and is
never committed. The preflight fails if any table/FK/reconciliation/sequence/
current-record/resolution gate fails, or if `--out` is not a child of `.tmp`.

## Drill

```bash
pnpm run cutover:drill -- \
  --persist .tmp/rehearsal-a \
  --out .tmp/cutover-drill
```

The drill copies the rehearsal D1 and verifies the source evidence hash before
and after. It writes `.tmp/cutover-drill/evidence.json` and per-phase Worker
logs. It never mutates `.tmp/rehearsal-a` and never calls `--remote`.

The procedure, assertions and production limitation are documented in
[`docs/cloudflare-port/cutover/rollback-drill.md`](../../../../docs/cloudflare-port/cutover/rollback-drill.md).
