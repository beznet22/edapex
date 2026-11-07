# Phase 7 migration scripts

Offline transform, tiered load and local rehearsal for `05-d1-migration.spec.md`.

## Source and output

- Source: the immutable `edapexdb.sql` Adminer dump at the repository root.
- Output: `apps/api/.tmp/migration/` (PII-bearing; gitignored).
- The transform never writes to MySQL and never reads a live database.

## Local rehearsal

From `apps/api/`:

```bash
node scripts/migration/rehearse.mjs \
  --source ../../edapexdb.sql \
  --persist .tmp/rehearsal-a \
  --run-id a \
  --photos full
```

The run applies every migration to a fresh local D1, transforms and loads all
62 legacy tables, starts `wrangler dev`, then performs:

1. source integrity report (identity gate)
2. bootstrap dry-run and real run (`activate: false`)
3. `accept-copied`, then the per-class-section staffing review for every
   remaining section (including the three new UPPER BASIC classes)
4. bootstrap rerun with `activate: true`
5. archive sessions 1, 2 and 4 with `purge: true`
6. promotion dry-run and real run, then the quarantine CSV/PDF
7. photo inventory/upload and timeline NDJSON export
8. per-table reconciliation and `evidence.json`

A second run with `--run-id b --persist .tmp/rehearsal-b` (photos may be
`sample`) is compared with:

```bash
node scripts/migration/verify.mjs \
  --a .tmp/rehearsal-a/evidence.json \
  --b .tmp/rehearsal-b/evidence.json
```

## Individual steps

```bash
node scripts/migration/transform-cli.mjs --source ../../edapexdb.sql \
  --out .tmp/migration/transform --digest <64-hex>
node scripts/migration/fk-preflight.mjs --source ../../edapexdb.sql
node scripts/migration/load-cli.mjs --source ../../edapexdb.sql \
  --persist .tmp/load-a --digest <64-hex> --fresh
node scripts/migration/o2-audit.mjs --persist .tmp/load-a
```

`fk-preflight.mjs` parses the target FK graph from the migrations and checks
every transformed row before any SQL runs. It nulls `0`/orphan nullable FK
values and drops a row only when a non-null FK cannot be satisfied.

## Production runbook (requires explicit approval)

The rehearsal is local-only. The production sequence is:

```bash
wrangler d1 migrations apply DB --remote
node scripts/migration/transform-cli.mjs --source edapexdb.sql \
  --out .tmp/migration/prod --digest <the 04a shared digest>
# execute the generated tier files with wrangler d1 execute DB --remote --file=...
# then, through the normal admin login (never the rehearsal minting path):
#   integrity -> bootstrap (activate:false) -> staffing review -> activation
#   -> archive 1..4 -> promotion -> quarantine -> readiness
```

Do not run the remote steps until the rehearsal evidence is reviewed and the
cutover owner approves the maintenance window. `main` is never pushed by this
phase.
