# Auth cutover (Phase 5) and target auth (Phase 9A)

The transitional claim flow from [`04a`](../../docs/cloudflare-port/04a-auth-cutover.spec.md) is time-boxed. Phase 9A removes password sign-in and adds magic link; the claim route is removed on **2026-12-03**. The target is [`04`](../../docs/cloudflare-port/04-auth-identity.spec.md).

## Flags and secrets

| Name | Type | Default | Effect |
|---|---|---|---|
| `CLAIM_ENABLED` | var/secret | unset | `"1"` enables `/claim` and the claim-purpose Google link. Requires a valid digest and cookie secret, otherwise the routes stay 404. |
| `CLAIM_PASSWORD_DIGEST` | secret | unset | SHA-256 hex of the shared claim password. Invalid values disable claim. |
| `AUTH_COOKIE_SECRET` | secret | unset | HMAC key for the claim ticket and the OAuth state cookie. Missing disables claim. |
| `GOOGLE_CLIENT_ID` | secret | unset | Google OAuth client id. |
| `GOOGLE_CLIENT_SECRET` | secret | unset | Google OAuth client secret. |
| `GOOGLE_REDIRECT_URI` | var/secret | unset | Registered callback, e.g. `https://api.example.com/api/v1/auth/google/callback`. |
| `POST_LOGIN_REDIRECT` | var | `/` | Where the callback sends the browser after a successful link or sign-in. |

Google routes are 404 until all three `GOOGLE_*` values are present. Set secrets with `wrangler secret put`; never commit them.

## Routes

| Method | Path | Notes |
|---|---|---|
| POST | `/api/v1/auth/claim` | Transitional; always 202 for unknown and valid addresses; removed 2026-12-03. |
| POST | `/api/v1/auth/magic-link` | Always 202 for known and unknown addresses; sends a 15-minute single-use link. |
| GET | `/api/v1/auth/magic-link/verify` | Consumes the link, sets `email_verified_at`, sets the session cookie and redirects. |
| GET | `/api/v1/auth/google/start` | 302 for `Accept: text/html`, JSON otherwise. Binds state + PKCE in an HttpOnly cookie. |
| GET | `/api/v1/auth/google/callback` | Verifies state, exchanges the code, links the identity, sets the session cookie. |
| POST | `/api/v1/auth/code` | Student code sign-in; sets the session cookie. |
| POST | `/api/v1/auth/mobile/code` | Student code sign-in; returns an opaque token. |
| POST | `/api/v1/admin/student-codes/issue` | Bulk issue; JSON or `Accept: text/csv`. Returns the only plaintext copy. |
| POST | `/api/v1/admin/student-codes/:studentId/reissue` | Revokes the old code and all student sessions. |
| DELETE | `/api/v1/admin/student-codes/:studentId` | Revokes the code and all student sessions. |
| GET | `/api/v1/admin/duplicate-emails` | Linkage-derived queue with personas, sessions, providers and last login. |
| GET | `/api/v1/admin/duplicate-emails/export` | CSV of the queue and its resolution state. |
| POST | `/api/v1/admin/duplicate-emails/reassign` | Moves the address, clears the others, mirrors the parent persona. |
| POST | `/api/v1/admin/duplicate-emails/merge` | Refuses a loser that still owns a persona record. |
| POST | `/api/v1/admin/duplicate-emails/flag` | Excludes the account from claim; sign-in returns 409 until an admin clears it. |
| POST | `/api/v1/admin/auth/claim-reset` | School-scoped, idempotent shared-digest reset; writes one `password_reset_bulk`. |

Admin routes require a session, `X-Academic-Id`, the tenant pair or neither, and `users.is_administrator = 'yes'`.

## Runbook (ordered)

1. Deploy with claim disabled (default).
2. Generate codes for the classes that need slips, print the CSV, hand them out at school.
3. Regenerate the MySQL statements and run them inside the maintenance window:
   `pnpm run auth:claim-reset-sql -- --password '<shared>'` (or `--digest <sha256>`).
4. Verify both counts match the expected population before switching traffic.
5. Switch traffic to the API.
6. Enable `/claim` and announce the removal date.
7. Work the duplicate queue: reassign, merge unlinked duplicates, flag the rest.
8. Monitor `auth_events` for `claim_*`, `google_signin`, `code_*`, `account_*`.
9. On 2026-12-03 delete the claim route and claim admin reset, NULL remaining password digests, and keep Google, magic link and student-code sign-in as the target. Password login routes are already removed.

## Local benchmark

```bash
pnpm exec wrangler dev
# seed one claimable local user, then:
pnpm run bench:claim -- --password '<shared>' --mode valid --email claim@example.test
```

The 10 ms gate is CPU: `pnpm exec vitest run tests/services/claim-cpu-budget.test.ts` prints the measured crypto path.
