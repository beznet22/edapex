# Phase 9A closeout

Status: **code complete; production gate blocked.**

Phase 9A code is on `phase-9a-auth`. It adds magic-link sign-in, removes password
verification routes, adds retention/archive verification tools, and wires
`apps/api` into the root pnpm workspace. The cutover actions are **not** safe to
execute on 2026-12-03 without the population prerequisites below. See
[`phase9a-cutover.md`](./phase9a-cutover.md) for the exact sequence and rollback.

## Code evidence

| Item | Evidence |
|---|---|
| Magic link | `POST /api/v1/auth/magic-link` always 202; 15-minute single-use token; `GET /verify` consumes it, sets `email_verified_at`, issues a session, redirects |
| Password login | `/api/v1/auth/login` and `/api/v1/auth/mobile/login` removed; no password verification path remains |
| Auth tests | `tests/http/magic-link.test.ts`, `tests/http/auth.test.ts`, `tests/services/auth-session.test.ts` |
| Retention dry-run | `pnpm --dir apps/api run phase9:retention-dry-run`; 7-year window; read-only |
| Archive manifests | `pnpm --dir apps/api run phase9:archive-manifests`; `--repair` wrote the missing session 1/2/4 manifests to R2 |
| Workspace wiring | `pnpm-workspace.yaml`; root lockfile; `pnpm --filter edapex-api run typecheck`; deploy dry-run |

## Production population (2026-11-09)

| Measure | Count | Gate |
|---|---:|---|
| Non-null password digests | 1,611 | Must be 0 before the column is dropped |
| Linked auth identities | 0 | Staff/parents have not linked Google |
| Student codes issued | 0 | Students cannot sign in without codes |
| Duplicate-email groups | 24 | Ambiguous magic-link requests send nothing |
| Staff records | 87 | Every staff account needs a tested sign-in |
| Parent records | 494 | Every parent account needs a tested sign-in |

The shared `/claim` password is the only currently working population path for
most staff/parents. The target magic-link UI is not deployed. Students have no
password fallback because their codes have not been issued.

## Blockers before `/claim` removal

1. Issue and distribute all student codes; verify `auth_codes` coverage.
2. Resolve or explicitly flag all 24 duplicate-email groups.
3. Pilot magic link with at least one staff and one parent account, then verify
   `email_verified_at` and a successful session.
4. Deploy the target sign-in UI; `GET /magic-link/verify` redirects to
   `POST_LOGIN_REDIRECT`.
5. Keep `/claim` enabled until the above are complete. Null password digests
   only after the removal and a verified rollback path.

## Gate decision

- Do **not** deploy the password-login removal to production yet.
- Do **not** remove `/claim` on 2026-12-03 unless the owner explicitly accepts
  the lockout risk after reviewing the counts.
- Phase 9A remains blocked; Phase 10 remains blocked.

## Verification commands

```bash
pnpm --dir apps/api run typecheck
pnpm --dir apps/api run test
pnpm --dir apps/api run check:services
pnpm --dir apps/api run check:http
pnpm --dir apps/api run phase9:retention-dry-run
pnpm --dir apps/api run phase9:archive-manifests
pnpm --filter edapex-api exec wrangler deploy --dry-run
node scripts/verify-port-specs.mjs
node scripts/verify-schema-catalog.mjs
```
