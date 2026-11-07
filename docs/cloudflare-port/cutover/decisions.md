# Phase 8 decision record

Status: **decisions taken during preparation.** No production resource, domain,
secret, D1/R2 write or traffic switch has been performed. This file is the
single summary the next agent should read before touching Cloudflare.

## D1 — Account and resource topology

| Decision | Detail |
|---|---|
| Cloudflare account | Reuse the existing account (`76846cbc…`), not a new account |
| POC Worker | `sms-api` stays live; do not replace or delete it |
| POC D1 | `sms` (production) is **not disposable**; it has a different UUID schema and already contains migrated EdApex data. Never clear or reuse it for EdApex |
| POC R2 | `sms-study-materials` stays POC-only |
| POC frontend | Pages project `sms-portal` at `portal.llacademy.ng` |
| POC API host | Moves to `sms-api.llacademy.ng` as part of the staged cutover |
| EdApex Worker | New `edapex-api` |
| EdApex D1 | New `edapex` database |
| EdApex R2 | New `edapex-media` bucket |
| EdApex host | `api.llacademy.ng` after the POC has moved and verified |

Creating a second Worker/D1 does **not** add free quota. Cloudflare free limits
are account-wide and are shared with the live POC.

## D2 — Billing and the initial load

| Decision | Detail |
|---|---|
| Recommendation | Use **Workers Paid ($5/month)** for the cutover and first month |
| Why | Free D1 allows **100,000 rows written/day**. EdApex loads 196,801 table rows plus index writes, then bootstrap/staffing/archive/promotion writes |
| Free alternative | Split the load and API migration across at least two days, with the legacy system read-only and the API unavailable. Not recommended for a single maintenance window |
| POC precedent | The POC’s own PROGRESS says the free-tier row-write limit will bind its API replay and recommends a paid plan or multi-window replay |
| Open input | Confirm the account’s current Workers plan in the dashboard; Wrangler does not show plan/usage |

Storage is not the blocker: the local D1 is about 36 MB (free limit 500 MB per
database / 5 GB per account), and the photo set is about 123 MB (R2 free 10 GB).

## D3 — Gmail reuse

| Decision | Detail |
|---|---|
| Sender | The POC’s active Gmail account; the address is in the private cutover record and `GMAIL_SENDER_EMAIL`, not git |
| POC storage | Refresh token is AES-GCM ciphertext in production D1 `gmail_accounts`, encrypted with `MASTER_ENCRYPTION_KEY` |
| POC secrets | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `MASTER_ENCRYPTION_KEY` exist on the production `sms-api` environment; secret values are write-only |
| EdApex variables | `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`, `GMAIL_SENDER_EMAIL`, `GMAIL_SENDER_NAME` |
| Reuse path chosen | Reuse the same Google OAuth client and Gmail account; one fresh consent with `gmail.send` produced a new refresh token |
| Verification | Token exchange returned HTTP 200, `gmail.send` scope, access token received; sender matches the POC account |
| Local configuration | Root `.env` is **not** read by `apps/api`; the five Gmail values were copied to gitignored `apps/api/.dev.vars` |
| Production configuration | Not set yet: the `edapex-api` Worker does not exist. Set with `wrangler secret put` after the first deploy |
| POC Gmail callback | `https://portal.llacademy.ng/integrations/gmail/callback` — remains on the portal and is unaffected by the API host move |
| EdApex auth callback | `https://api.llacademy.ng/api/v1/auth/google/callback` — registered on the Google client |
| OAuth testing risk | If the consent screen is in Testing, refresh tokens expire after 7 days; publish or use an internal/Workspace setup |
| Sending limit | Consumer Gmail is roughly 400–500 recipients/day; keep a cap for report-card mail |

The POC’s encrypted token was not decrypted and no POC secret was read or
changed. The one-time consent is independent of the POC’s stored token.

## D4 — Domain move

| Decision | Detail |
|---|---|
| POC API | Move to `sms-api.llacademy.ng` |
| EdApex API | Take `api.llacademy.ng` |
| Mode | Staged, not a hard swap |
| POC `CLIENT_URL` | Must stay `https://portal.llacademy.ng`; changing it would move the Gmail callback and break the registered redirect |
| POC frontend | Change only `sms-frontend/.env.production` to `https://sms-api.llacademy.ng/api`; rebuild and redeploy `sms-portal` |
| POC scripts | Update hardcoded `api.llacademy.ng` in `scripts/verify-replay-api.mjs` and `scripts/replay-edapex-api.mjs` |
| Keep old host until verified | Keep `api.llacademy.ng` attached to the POC while `sms-api.llacademy.ng` and the rebuilt portal are verified |
| EdApex interim host | Deploy and verify EdApex on `edapex-api.llacademy.ng` before taking `api.llacademy.ng` |
| Short detach window | Removing `api` from the POC and attaching it to EdApex is a brief hostname handover; do it in a low-traffic window |
| Google callbacks | Keep the portal callbacks; add EdApex’s API callback; multiple redirect URIs are allowed |
| Rollback | If EdApex fails after taking `api`, keep the portal on `sms-api`; EdApex can return to its interim host. If the POC move fails, revert the frontend API base and route |

## D5 — Local env versus production secrets

- The repository-root `.env` belongs to the legacy app; `apps/api` does not read it.
- Local API development uses `apps/api/.dev.vars` (gitignored). It now contains the five Gmail variables only.
- Production values are set with `wrangler secret put` after the Worker exists. `.env` files are not deployed.
- The local `.dev.vars` file is mode `600` and ignored; never commit it.
- No secret value, token, ciphertext or PII belongs in this repository or in the
  cutover evidence.

## D6 — Open inputs before production

| Input | Why it blocks |
|---|---|
| Current Workers plan (Free/Paid) | Determines whether the 196,801-row load can be one window |
| POC Pages deploy method | `sms-portal` must be rebuilt with the new `VITE_API_URL`; the frontend package has no deploy script, so Git integration vs `wrangler pages deploy` must be confirmed |
| EdApex production frontend origin(s) | Required for `CORS_ORIGINS` and the Google post-login redirect |
| PR #8 merge + Phase 8 branch publication | The next agent needs the Phase 7 code and this pack in the base branch |
| Google OAuth publishing status | Testing-mode refresh tokens expire after 7 days |

## D7 — Guardrails

1. Do not clear, overwrite or repurpose the POC D1.
2. Do not attempt the EdApex load on the Free plan without a multi-day window.
3. Do not remove `api.llacademy.ng` from the POC before the new host and portal
   are verified.
4. Do not change the POC `CLIENT_URL`; the Gmail callback is the portal.
5. Do not copy `.dev.vars`, `.env`, tokens or PII into git.
6. Do not treat the local drill as the production rollback drill.
7. Do not start Phase 9 until Phase 8’s production load, switch, 24 h watch and
   rollback gate are complete.

## Linked records

- [Runbook](./runbook.md)
- [Checklist](./checklist.md)
- [Monitoring](./monitoring.md)
- [On-call brief](./oncall-brief.md)
- [Rollback drill](./rollback-drill.md)
- [Phase 7 rehearsal report](../audit/phase-7-rehearsal.md)
