# Phase 10G.2 — transitional retirement runbook

Status: **deferred until after 10F.** This was formerly the Phase 9A claim
removal runbook. Do not run steps 4–7 until 10G.1 population coverage passes.
The 2026-12-03 date is withdrawn.

## 0. Population gate

Run against the active D1 (`DB` = `edapex-recovery`):

```bash
pnpm --dir apps/api exec wrangler d1 execute DB --remote --json --command="
SELECT
  (SELECT COUNT(*) FROM users WHERE password IS NOT NULL) AS non_null_passwords,
  (SELECT COUNT(*) FROM auth_codes WHERE subject_type = 'student' AND revoked_at IS NULL) AS student_codes,
  (SELECT COUNT(*) FROM auth_identities) AS identities,
  (SELECT COUNT(*) FROM (SELECT lower(email) FROM users WHERE email IS NOT NULL GROUP BY lower(email) HAVING COUNT(*) > 1)) AS duplicate_email_groups
"
```

Required before step 4:

- `student_codes` = the full student population (900; reissues may change the
  exact count only if recorded).
- Duplicate-email groups = 0 unresolved; flagged accounts documented.
- A staff account and a parent account have signed in through magic link, and
  `users.email_verified_at` is non-null for both.
- The target sign-in page is deployed; `POST_LOGIN_REDIRECT` points at it.
- A tested backup of the `users.password` values exists outside git.
- A second operator has reviewed this plan.

## 1. Freeze the claim window

1. Announce the final date and support contact.
2. Stop issuing new claim tickets; leave existing sessions alone.
3. Confirm `/health` 200 and `/claim` 202 before the change.

## 2. Back up D1

Export the `users` password column (or full D1) to the private cutover store:

```bash
pnpm --dir apps/api exec wrangler d1 export DB --remote --output .tmp/phase9/pre-claim-removal.sql
```

Record the SHA-256 in the private cutover record. Do not commit it.

## 3. Remove the claim surface

Code change on `phase-9a-auth`:

- delete `apps/api/src/lib/server/http/routes/auth-claim.routes.ts`;
- remove `authClaim` from `app.ts`;
- delete `ClaimService`, `ClaimResetService`, `claim-link.ts`, `claim-policy.ts`,
  `admin-auth.routes.ts` and their exports/tests;
- remove `CLAIM_COOKIE` from `cookies.ts` and the claim fields from
  `AuthConfigPort`/`createAuthConfig`;
- remove `CLAIM_ENABLED` and `CLAIM_PASSWORD_DIGEST` from the Worker secrets.
- add an explicit public 404 for the retired path if the protected `/api/v1`
  mount would otherwise answer 401.

Deploy to the interim host first; verify `/api/v1/auth/claim` is 404 and
`/api/v1/auth/magic-link` is 202.

## 4. Null the password digests

Only after step 3 is live and the population gate is green:

```bash
pnpm --dir apps/api exec wrangler d1 execute DB --remote --command="
UPDATE users SET password = NULL WHERE password IS NOT NULL
"
```

Record the changed-row count. Verify:

```sql
SELECT COUNT(*) FROM users WHERE password IS NOT NULL; -- must be 0
```

Do not drop the column in this phase. A later migration drops it.

## 5. Verify target sign-in

- staff: magic-link request and verify → session → `/me` 200;
- parent: magic-link request and verify → session;
- student: code sign-in → session;
- Google: start/callback → session;
- `/claim` → 404;
- protected route without a cookie → 401;
- CORS preflight from `https://app.llacademy.ng` → 204.

## 6. Rollback

If sign-in fails broadly:

1. Re-deploy the previous Worker version (claim surface restored).
2. Restore the pre-null digest backup if the rollback requires claim login.
3. Keep the new magic-link/Google/student-code routes available.
4. Do not re-enable password login; it is removed by design.

The previous Worker version and the D1 backup are the rollback artifacts. A
rollback that restores claim without restoring digests is not sufficient.

## 7. Close the gate

Update `PROGRESS.md`, `phase9a-closeout.md` and the workspace roadmap only after
steps 3–5 pass. Phase 10 remains blocked until Phase 9B approval and 10A.
