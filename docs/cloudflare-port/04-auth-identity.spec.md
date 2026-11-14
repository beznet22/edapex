# 04 — Auth & Identity (target state)

Passwordless authentication for the EdApex Hono API on Workers with D1. This document describes the **target** model. The temporary migration path that ships first is [04a](./04a-auth-cutover.spec.md).

## 1. Goals and non-goals

**Goals**

- Staff and parents sign in with Google, or with a magic link when Google is unavailable.
- Students sign in with a school-issued code; they have no email.
- No password is ever verified in the steady state.
- Every auth request stays inside the 10 ms CPU budget ([01a §7](./01a-d1-optimization.playbook.md)).

**Non-goals**

- Password authentication (retired after cutover), SAML, MFA, passkeys. Each is a separate decision.
- Cross-school account linking. Identities are scoped to a `users` row, and `users.school_id` decides the tenant.

## 2. Data model

Six tables are added. The legacy session store is **not ported**; `auth_sessions` replaces it, so the database ends at **68 tables**: 62 ported legacy + 6 auth.

| Table | Columns | Keys and constraints |
|---|---|---|
| `auth_identities` | `id` (uuid), `user_id`, `provider`, `provider_user_id`, `email_at_provider`, `email_verified`, `created_at`, `last_used_at` | PK `id`; **unique (`provider`, `provider_user_id`)**; index (`user_id`) |
| `auth_magic_links` | `id` (uuid), `user_id` (nullable), `email`, `token_hash`, `purpose`, `expires_at`, `consumed_at`, `requested_ip`, `created_at` | PK `id`; **unique (`token_hash`)**; index (`email`, `created_at`) |
| `auth_codes` | `id` (uuid), `subject_type`, `subject_id`, `code_hash`, `expires_at`, `revoked_at`, `last_used_at`, `issued_by`, `created_at` | PK `id`; **unique (`code_hash`)**; index (`subject_type`, `subject_id`) |
| `auth_sessions` | `id` (uuid), `user_id`, `token_hash`, `expires_at`, `device_fingerprint`, `created_at`, `last_seen_at`, `revoked_at` | PK `id`; **unique (`token_hash`)**; index (`user_id`, `expires_at`) |
| `auth_events` | `id`, `type`, `user_id`, `email`, `ip`, `user_agent`, `created_at` | PK `id`; index (`user_id`, `created_at`), index (`type`, `created_at`) |
| `auth_rate_limits` | `key`, `window_start`, `count` | PK (`key`, `window_start`) |

### 2.1 Changes to `users`

| Column | Change |
|---|---|
| `email` | Becomes canonical. Stored lowercased. Index added; **not unique** — 25 emails are currently shared (see §5). |
| `email_verified_at` | New. Set when Google asserts a verified email or a magic link is consumed. |
| `verified` | Existing boolean. Superseded by `email_verified_at`; retained read-only during transition. |
| `password` | Set to NULL on successful linking; dropped in a later migration. |
| `random_code` | Retired. Its role is taken by `auth_codes`. |
| `remember_token`, `device_token`, `notificationToken` | Out of scope here; reviewed separately. |

### 2.2 Why tokens are hashed with SHA-256, not a KDF

Magic-link tokens, student codes, and session tokens are 256-bit random values. A KDF protects low-entropy secrets from offline guessing; for a 256-bit random token there is nothing to guess. Measured cost of SHA-256 is **0.004 ms** versus **6.1 ms** for PBKDF2 at only 10k iterations ([01a §7](./01a-d1-optimization.playbook.md)). Using a KDF here would burn most of the CPU budget for no security gain.

## 3. Flows

### 3.1 Magic link

```text
POST /auth/magic-link  { email }
  → always 202 (identical body whether or not the account exists)
  → rate limit by IP and by email
  → if a user exists: issue 256-bit token, store SHA-256(token), TTL 15 min
  → send email with https://<host>/auth/magic-link/verify?token=<token>

GET  /auth/magic-link/verify?token=…
  → hash, look up unconsumed + unexpired
  → mark consumed, set users.email_verified_at
  → create session, set cookie, redirect
```

Failure never distinguishes "no such account" from "expired token" in the HTTP response; the distinction goes to `auth_events` only.

### 3.2 Google sign-in

```text
GET /auth/google/start
  → generate state + PKCE verifier, store in a short-lived signed cookie
  → redirect to Google

GET /auth/google/callback?code=…&state=…
  → verify state, exchange code (one subrequest)
  → fetch userinfo (one subrequest)
  → lookup auth_identities by (provider, provider_user_id)
      found     → load user, create session
      not found → match users by verified email
                    exactly one   → insert identity, create session
                    none          → reject: accounts are provisioned by the school, not self-registered
                    more than one → 409 AMBIGUOUS_EMAIL, route to admin
```

Two subrequests per sign-in sits well inside the Workers limit, and no D1 query is needed until after the exchange.

### 3.3 Student code

A student code is a **durable credential**, not a one-time token. It behaves like a password the school issues, except it is high-entropy, stored hashed, rate-limited, and revocable.

```text
POST /auth/code  { code }
  → rate limit by IP and by code prefix
  → hash, find a non-revoked, non-expired auth_codes row
  → resolve subject_type=student → subject_id → sm_students.user_id
  → update last_used_at, create session
```

Why not single-use: consuming the code on every login would require 900 students to obtain a new code each time. A reusable credential with rate limiting is the only workable model at this population; revocation is how a leaked code is neutralised.

Reissue replaces the row (old code revoked, new code issued) and revokes the student's active sessions.

### 3.4 Session lifecycle

- Issue on any successful flow; `__Host-` cookie, `HttpOnly`, `Secure`, `SameSite=Lax`.
- Sliding expiry: `last_seen_at` updated at most once per hour to avoid a write per request.
- Logout deletes the row. Linking a Google identity revokes all other sessions for that user.
- Admin merge revokes every session for both accounts before reassigning identities.

## 4. Per-persona policy

Measured from the live database.

| Persona | Population | Identity source | Flow | Notes |
|---|---|---|---|---|
| Staff | 87, all with email, all linked | `users.email` = `sm_staffs.email` | Google first, magic link fallback | Cleanest population |
| Parents | 567 records; 566 with `guardians_email`; **489 linked to a user** | `sm_parents.guardians_email` | Google first, magic link fallback | 78 have no account and must be provisioned |
| Students | 900, all linked, **0 with email** | School-issued code | Code only | Magic link is impossible without addresses |
| Unclassified | 25 duplicate emails across accounts | Resolved by admin | — | See §5 |

`users.usertype` cannot drive this: 1,575 of 1,610 rows are NULL. Personas are derived by joining `sm_students`, `sm_staffs`, and `sm_parents` on `user_id`.

## 5. Account linking and duplicate emails

Measured: 713 users have an email; there are 688 distinct addresses. One address appears three times, the rest twice.

Rules:

1. **Never auto-link on an unverified email.** Auto-linking is how account takeover happens: an attacker who controls an unverified address inherits the account.
2. **Google asserts `email_verified`**; only then may an identity be attached to an existing `users` row with a matching address.
3. **Ambiguity is a hard stop.** If a verified email matches more than one user, return `409 AMBIGUOUS_EMAIL` and log it. No heuristic picks a winner.
4. **Resolution is manual** and lives in the admin utility described in [04a §4](./04a-auth-cutover.spec.md). A merge moves identities and sessions, then deletes the losing row, all in one batch, with an `auth_events` record.

## 6. Sessions over JWT

| Option | Verdict |
|---|---|
| **Opaque token in D1** (chosen) | Revocation is immediate, device listing is trivial, and storage is tiny — 953 rows across 42 users today. Costs one indexed read per request. |
| JWT | Stateless, but revocation requires a denylist, which reintroduces the read it was meant to avoid. Rejected. |

The session read is folded into the tenant-resolution middleware so it costs one query per request, not two.

## 7. Email delivery

| Fact | Consequence |
|---|---|
| Cloudflare Email Service supports Workers binding, REST, and SMTP on port 465 | Bindings are the lowest-latency path inside Workers |
| **Cloudflare Email Routing arbitrary-recipient sending requires Workers Paid** | EdApex does not use that path. Gmail OAuth2 is the delivery adapter; Workers stay on Free and there is no Paid fallback. |
| Port 25 is inbound-only; plaintext SMTP and STARTTLS on 587 are not supported | The existing `SMTP_*` variables in `.env` cannot be used from Workers |
| Cloudflare requires the sending domain on Cloudflare DNS | Domain setup is a prerequisite, not a runtime concern |

Choose the Workers binding when the sending domain is on Cloudflare; otherwise an HTTP provider (Resend, SendGrid) behind a thin `EmailSender` interface. Either way the interface is one method: `send(template, to, data)`.

## 8. Security controls

| Control | Requirement |
|---|---|
| Token entropy | 256-bit from `crypto.getRandomValues` |
| Token storage | SHA-256 at rest; plaintext exists only in the email or the printed code |
| Single use | Magic links set `consumed_at` atomically; a second use fails. Student codes are durable credentials, not single-use — see §3.3. |
| TTL | Magic link 15 min; session 30 days sliding; student code long-lived until revoked or reissued |
| Enumeration | Identical response and timing for known and unknown emails |
| Rate limiting | Per IP and per email; `auth_rate_limits` or KV |
| OAuth | `state`, PKCE, redirect allowlist, no implicit flow |
| CSRF | Required on cookie-authenticated state-changing routes |
| Session fixation | New session id on any privilege change |
| Audit | Every issue, consume, failure, link, merge, revoke writes `auth_events` |

## 9. Runtime considerations

- **Query budget:** a magic-link request costs 1 read + 1 insert; verification costs 1 read + 1 update + 1 insert. All within the ≤10 per endpoint budget ([01a O15](./01a-d1-optimization.playbook.md)).
- **Indexes required** (create in the same migration): `users(email)`, `auth_identities(provider, provider_user_id)`, `auth_identities(user_id)`, `auth_magic_links(token_hash)`, `auth_codes(code_hash)`, `auth_sessions(token_hash)`, `auth_sessions(user_id, expires_at)`.
- **No KDF** on any auth path (§2.2).
- **Clock:** expiry comparisons use integer unix seconds, matching the schema-wide date decision ([01a O20](./01a-d1-optimization.playbook.md)).

## 10. Acceptance criteria

- [ ] Six auth tables exist with the keys and indexes in §2
- [ ] `users.email` indexed; `email_verified_at` populated for every Google-linked account
- [ ] Magic-link, Google, and student-code flows each pass an end-to-end test on local D1
- [ ] Duplicate email returns `409 AMBIGUOUS_EMAIL` and never picks an account
- [ ] No password verification exists in any auth path
- [ ] Every auth request measured under 10 ms CPU on `wrangler dev`
- [ ] `auth_events` records issue, consume, failure, link, merge, and revoke
- [ ] Session revocation takes effect on the next request

## 11. Decisions taken

| Decision | Choice | Rationale |
|---|---|---|
| Student code lifetime | Valid until revoked or reissued; reissued at each academic year | Population is 900 students, so annual reissue is 900 printed slips per year — operationally acceptable. Codes are not consumed on use, so there is no per-login support load. |
| Self-provisioning for unlinked parents | **Not allowed** | Accounts are school-provisioned, consistent with students. The 78 unlinked parent records are provisioned by an admin before cutover ([04a §4](./04a-auth-cutover.spec.md)). Self-registration would bypass tenant scoping at the one point where no tenant is known. |
| Session transport | Opaque token in D1, not JWT | Revocation matters more than statelessness at this scale (§6). |
