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

## Offline archives and one-window load

```bash
# final local rehearsal -> archive objects/metadata
pnpm run cutover:archive-export -- \
  --persist .tmp/rehearsal-final \
  --out .tmp/cutover-plan/archive

# live-only plan from the full preflight SQL
pnpm run cutover:live-plan -- \
  --plan .tmp/cutover-plan/cutover-plan.json \
  --archive-metadata .tmp/cutover-plan/archive/archive-metadata.sql \
  --out .tmp/cutover-plan/live

# dry-run first; --execute is required for remote work
pnpm run cutover:load-window -- \
  --plan .tmp/cutover-plan/live/load-plan.json \
  --state .tmp/cutover-plan/load-state.json \
  --budget 95000
```

The loader stops at the last completed file and resumes after 00:00 UTC the next
day if the 100k cap is reached. It never switches to Paid.

## Production photos and reports

```bash
pnpm run cutover:photo-inventory -- \
  --photos-dir .tmp/photos-production/student \
  --photos-dir ../../static/uploads/students \
  --references .tmp/cutover-plan/transform/photos.json \
  --out .tmp/cutover-plan/photos-union

pnpm run cutover:missing-photo-students -- \
  --persist .tmp/rehearsal-a \
  --missing .tmp/cutover-plan/photos-union/missing-photos.csv \
  --out .tmp/cutover-plan/photos-union/missing-photo-students.csv

# after the R2 upload; full download/hash audit (read-only remote)
pnpm run cutover:photo-audit -- \
  --manifest .tmp/cutover-plan/photos-union/inventory.json \
  --out .tmp/cutover-plan/photos-union/audit.json \
  --execute
```

The photo and student reports are PII-bearing `.tmp` artifacts; never commit
them. The DB keeps the legacy relative `/uploads/students/...` key; R2 and the
public route use the same key contract.
