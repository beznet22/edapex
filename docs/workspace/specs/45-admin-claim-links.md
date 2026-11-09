# 45 — Admin Claim Links and Directory

**Status:** v1 implementation in `apps/web` and `apps/api`. It is the first
workspace surface and must ship before the general cowork workspace.

## Purpose

Provision and claim staff and parent accounts without the shared claim
password, email delivery as the first step, or a prior Google identity.

Students are out of scope here; they use school-issued codes.

## Surface

- **`app.llacademy.ng/admin/claim-links`** — tenant-scoped admin directory.
- **`app.llacademy.ng/claim#token=…`** — public claim landing page.

The page is the first `apps/web` React/Tailwind v4/shadcn slice. It uses the
Worker API at `api.llacademy.ng`; no Pages Functions or SSR.

## Directory

Rows are staff and parent records, including records with no `users` row.

| Column | Source |
|---|---|
| persona | `staff` or `parent` |
| name | staff `full_name` / parent guardian name |
| email | canonical `users.email`, falling back to the staff/parent record |
| phone | staff mobile / parent guardian mobile |
| claim | `pending`, `claimed`, `flagged`, or `no_user` |
| Google | linked `auth_identities` |
| duplicate | another user in the school has the same normalized email |
| email type | **Non-Gmail** badge for non-Gmail addresses |
| link | active, expired, used, revoked, or none |

Filters: persona, unclaimed, claimed, flagged, no user, no email, non-Gmail,
duplicate, link active, link revoked. Search is server-side across name, email
and phone. Pagination defaults to 50, max 100.

## Claim link

Admin action:

```http
POST /api/v1/admin/claim-links
{ "subjectType": "staff" | "parent", "subjectId": 123, "ttlHours": 72 }
```

Response returns the raw URL once:

```text
https://app.llacademy.ng/claim#token=<256-bit-token>
```

Rules:

- stored as SHA-256 only;
- one-time; default 72h; maximum 7 days;
- revocable;
- tenant-scoped, admin-only;
- audit `claim_link_issued`, `claim_link_revoked`, `claim_link_exchanged`,
  `claim_link_completed`;
- raw token never appears in logs, the database, or the directory list.

## Claim flow

1. Admin opens the directory and selects a staff or parent.
2. If the record has no user, the backend creates a pending `users` row from the
   record and links `sm_staffs.user_id` / `sm_parents.user_id`.
3. Admin copies the link and sends it through the school's trusted channel.
4. User opens the link; `POST /api/v1/auth/claim-link/exchange` validates the
   hash and one-time token, marks it used, and sets the short-lived signed claim
   cookie.
5. User continues to Google.
6. Google verifies the email; the claim completes:
   - account email becomes the verified Google email if it differs;
   - duplicate email check is mandatory;
   - `auth_identities` is inserted;
   - password is nulled;
   - sessions are revoked;
   - a fresh session is issued;
   - old/new email is audited.
7. The user can subsequently sign in with Google or a magic link.

## Non-Gmail fallback

- The directory marks non-Gmail addresses.
- Admins can filter Non-Gmail and help the parent/staff open a Gmail account.
- The account email can change during the admin-authorized claim.
- Before a Google identity exists, the provisioned account can sign in through
  the standard `/api/v1/auth/magic-link` flow using its current email. The magic
  link is a login path; it does not attach a Google identity.
- Claim completion still requires a Google identity in v1. If the account has
  no Google identity, the admin can change the email and re-issue the link.

## Security

- The claim link is a bearer credential. Use the fragment, `Referrer-Policy:
  no-referrer`, short TTL, one-time consumption and admin revocation.
- A forwarded link can be claimed by the first holder. This is accepted only
  for admin-issued, per-user links; add a second factor for high-risk schools.
- Never allow public self-provisioning.
- Never create a user from a claim link without admin issuance.
- Do not allow arbitrary email changes outside claim or authenticated profile
  verification.
- Do not expose the raw token in the directory, logs, analytics or referrers.
- Do not let the shared `/claim` password update an email.

## Acceptance

- Directory lists staff and parents, including no-user records.
- Non-Gmail is visible and filterable.
- A staff and a parent without a user can be provisioned and claimed.
- A Yahoo school email can become a verified Gmail account during claim.
- Duplicate destination emails return 409.
- Link is single-use, expires, and can be revoked.
- No raw token is stored or listed.
- `/claim` can be retired after coverage; this flow remains.
