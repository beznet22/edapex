# 04a — Auth Cutover (transitional)

The temporary flow that runs while accounts are claimed and linked. It ships **before** the target auth in [04](./04-auth-identity.spec.md), and it is removed when that lands. Everything here is deliberately disposable; the exit criteria in §8 are the point of the document.

## 1. Purpose and lifetime

| | |
|---|---|
| Why it exists | Existing accounts hold 1,566 password hashes and no Google identities. Someone has to move 1,610 users onto the target model. |
| Duration | Capped, not open-ended. The removal date is set before launch; the route is deleted on that date whether or not all accounts have linked. |
| What it grants | Exactly one thing: the ability to attach a Google identity to an already-provisioned account. Nothing else is authorised by this page. |

**Sequencing matters:** the password reset breaks the legacy login path. It must run immediately before traffic moves to the new backend, not days earlier.

## 2. One-time password reset

All 1,610 accounts are set to the same claim password. This is a migration step, never a feature.

### 2.1 Stored form

| | |
|---|---|
| Value | The shared claim password, identical for every account |
| Stored as | **One app-wide SHA-256 digest**, written to every row's existing password column |
| Verification | Constant-time comparison against that digest |
| Cost | **0.004 ms** measured; no KDF |
| Why not bcrypt/PBKDF2 | See §7. The value is public and universal, so a KDF adds CPU cost and zero security |

A per-user salt is unnecessary here: with an identical, public password on every row, there is no cross-account cracking problem to solve. The digest exists only so the database does not contain plaintext.

### 2.2 Operational constraints

- Run against the **source MySQL** in the same maintenance window as the cutover.
- Verify the row count afterwards: 1,610 rows, 1,610 matching digests.
- The reset invalidates the legacy app's login immediately. Announce the window.
- Record the operation in `auth_events` as a single `password_reset_bulk` entry with the actor and timestamp.

## 3. Transitional claim page

A separate route (`/claim`), visually and technically distinct from the target sign-in page.

```text
POST /claim  { email, password }
  → rate limit by IP and by email
  → resolve user by lower(email)
      none        → 202, identical body and timing to success
      ambiguous   → 409 AMBIGUOUS_EMAIL (duplicate address, see §5)
      one         → constant-time compare the shared digest
                      mismatch → 401
                      match    → mark claim-required, proceed

  → immediately start the Google link flow
  → on successful link: insert auth_identities, NULL the password column,
    revoke all sessions, issue a fresh session, redirect into the app
```

Rules:

- The claim page **does not** grant application access on its own. There is no "skip for now" that lands in the product — only a logout.
- No account-existence leakage: unknown, ambiguous, and wrong-password cases are distinguishable only in `auth_events`, except ambiguity which must be surfaced to the user (they need to know to contact an admin).
- Every attempt writes an `auth_events` row: `claim_attempt`, `claim_success`, `claim_failure`.
- The page is rate-limited to a small number of attempts per IP and per email per hour.

## 4. Student code issuance

Students have no email (measured: **0 of 900**), so magic link is impossible. They receive a school-issued code.

| Property | Value |
|---|---|
| Scope | One code per student — a leaked code exposes one account, not a class |
| Entropy | 12 characters of Crockford base32 (~60 bits), generated with `crypto.getRandomValues` |
| Storage | SHA-256 hash at rest; the plaintext exists only on the printed slip |
| Lifetime | Valid until revoked or reissued; reissued each academic year |
| Reuse | **Durable credential, not single-use** — consuming it per login would require 900 new codes per session |
| Rate limiting | Per IP and per code prefix; lockout after N failures, logged |

Issuance runbook:

1. Admin generates codes for all students in a class (or the whole school).
2. Export a printable sheet: student name, admission number, class/section, code.
3. Hand out at school; codes are never emailed or messaged in bulk.
4. Reissue revokes the old row, writes a new one, and revokes the student's active sessions.

## 5. Admin duplicate-resolution utility

Measured: 713 users hold an email but only 688 addresses are distinct — one address appears **three** times, the rest in pairs. Email + shared password cannot authenticate an ambiguous address, so these accounts are blocked until an admin resolves them.

### 5.1 What the page shows

For every duplicated address:

| Column | Source |
|---|---|
| Email | `users.email`, lowercased |
| Each account | `users.id`, `full_name`, `active_status` |
| Persona | **Derived by linkage**, not `usertype`: student (`sm_students.user_id`), staff (`sm_staffs.user_id`), parent (`sm_parents.user_id`), or unlinked |
| Sessions | count of active `auth_sessions` |
| Identities | providers already linked |
| Last login | `auth_events` max timestamp |

`users.usertype` is unusable for this: 1,575 of 1,610 rows are NULL, with only 21 'student' and 14 'parent' labelled.

### 5.2 Actions

| Action | Effect |
|---|---|
| **Reassign email** | Move the address to the correct account; clear it on the other; both flagged for claim |
| **Merge** | Move identities and sessions to the surviving account, delete the loser, revoke all sessions, write `auth_events` |
| **Flag** | Mark as unresolved and exclude from the claim flow |
| **Export** | CSV of duplicates and their resolution state, for offline tracking |

Merging runs as one `db.batch` ([01 §8](./01-repository-layer.spec.md)) so a half-merge cannot leave two accounts sharing an identity.

## 6. Risk controls

The shared password plus a known email is an account-takeover path for every account that has both. That is an accepted, time-boxed risk; these controls bound it.

| Risk | Control |
|---|---|
| Anyone who knows a parent's email can claim the account | Short window; forced Google link; password NULLed on link; `auth_events` records every attempt with IP and user agent |
| Mass enumeration of valid emails | Identical response and timing; per-IP rate limiting |
| Repeated guessing of the shared password | Attempt limits per IP and per email; alert on spikes |
| Stale claim route left reachable | Removal is an exit criterion (§8), with a date fixed at launch |
| Admin mis-merge | Merge requires an explicit confirmation showing both accounts; the audit row records before/after |
| Codes photographed and shared | Per-student codes, rate limiting, revocation on suspicion |

Monitoring during the window: claim attempts per hour, failure ratio, distinct IPs per email, and any account claimed from two IPs within minutes.

## 7. Hashing policy

Measured locally (V8 + OpenSSL; re-measure on `wrangler dev`):

| Operation | Cost |
|---|---|
| SHA-256 digest | **0.004 ms** |
| PBKDF2-SHA256 10k | 6.1 ms |
| PBKDF2-SHA256 100k | 51.9 ms |
| bcrypt | not installed; WASM bcrypt is slower and cannot fit the budget |

Rules:

1. **No KDF on the claim path.** The claim password is a published constant; a KDF protects low-entropy secrets from offline guessing, and there is nothing to guess.
2. **SHA-256 for every token** — magic links, student codes, session tokens. All are high-entropy random values.
3. **No bcrypt anywhere.** No native implementation on Workers, and no real passwords survive cutover.
4. **A KDF returns only if real passwords do**, with the iteration count chosen by benchmark against the CPU budget.
5. **CI gate:** the complete claim flow — hash, session insert, cookie sign — stays under **10 ms** locally, and the figure is re-measured on `wrangler dev` before launch.

## 8. Exit criteria

The transitional flow is finished when all of these hold, or when the removal date arrives — whichever comes first.

- [ ] `/claim` route deleted and its middleware removed
- [ ] Every staff account (87) has a linked identity
- [ ] Every parent account with a `users` row (489 of 567) is linked or explicitly flagged
- [ ] The 78 unlinked parent records are either provisioned or documented as out of scope
- [ ] All 900 student codes issued; distribution recorded
- [ ] Duplicate emails resolved: zero unresolved
- [ ] `users.password` contains no non-null values, then dropped in a later migration
- [ ] `auth_events` retained for audit per the school's retention policy

## 9. Runbook (ordered)

1. Deploy the new backend with the claim route disabled.
2. Prepare student codes and print slips.
3. Enter the maintenance window; run the bulk reset against source MySQL.
4. Verify 1,610 rows carry the shared digest.
5. Switch traffic to the Hono backend.
6. Enable `/claim`; announce the window and its end date.
7. Work the duplicate queue and the 78 unlinked parents.
8. Distribute student codes.
9. Monitor claim metrics daily.
10. On the removal date: delete the route, NULL any remaining credential values, publish the target sign-in page.

## 10. What this spec deliberately does not do

- It does not define the target sign-in UI — see [04](./04-auth-identity.spec.md).
- It does not cover validation of the Google integration beyond the link step.
- It does not migrate passwords: they are replaced, not converted.
