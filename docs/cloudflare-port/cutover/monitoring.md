# Cutover monitoring

This is the 24 h watch for the Phase 8 switch. Panels are opened before the
first production request; thresholds are agreed with the rollback authority.

## Dashboard panels

| Panel | Source | What it shows |
|---|---|---|
| Worker availability | Cloudflare Workers metrics | Requests, 5xx/4xx ratio, CPU p50/p95, duration p95 |
| Worker errors | Cloudflare Workers logs / `wrangler tail` | Exception names, request ids, route, count |
| D1 health | Cloudflare D1 metrics | Queries, rows read/written, query duration, errors |
| R2 health | Cloudflare R2 metrics | Class A/B operations, 4xx/5xx, object count/bytes |
| Public photo route | Worker metrics filtered to `/uploads/students/*` | Hit rate, 200/404/5xx, cache behaviour |
| Claim funnel | D1 `auth_events` | `claim_attempt` → `claim_ticket_issued`; failures, ambiguity, flags |
| Auth sessions | D1 `auth_events` / `auth_sessions` | Google link, code login, session creation, revocations |
| Readiness probe | External `/health` check | 200 status and latency every 1 minute |

## POC regression during the staged move

The POC is live and must stay usable while `api.llacademy.ng` is handed over.
Before the EdApex switch, watch:

| Check | Expected | Action |
|---|---|---|
| `https://sms-api.llacademy.ng/health` | 200 | Stop the handover if it fails |
| POC portal login | success | Do not remove `api.llacademy.ng` until this passes |
| POC Gmail send | success | The Gmail callback remains on `portal.llacademy.ng` |
| POC `VITE_API_URL` | `https://sms-api.llacademy.ng/api` | Rebuild/redeploy `sms-portal` |
| EdApex `https://edapex-api.llacademy.ng/health` | 200 | Verify before taking `api.llacademy.ng` |
| EdApex `/claim` | 404 | Claim stays disabled until the switch checks pass |

Keep both custom domains attached during preparation. The only unavoidable
window is the `api.llacademy.ng` detach/attach step; do it in low traffic.

## Queries

Run from the private cutover shell with
`pnpm exec wrangler d1 execute DB --remote --json --command="<SQL>"`.

```sql
-- Hourly event mix (no email/user identifiers)
SELECT type, COUNT(*) AS count
FROM auth_events
WHERE created_at >= unixepoch() - 3600
GROUP BY type
ORDER BY count DESC;

-- Claim funnel in the last 15 minutes
SELECT type, COUNT(*) AS count
FROM auth_events
WHERE created_at >= unixepoch() - 900
  AND type IN ('claim_attempt', 'claim_ticket_issued', 'claim_failure',
               'claim_ambiguous', 'claim_flagged')
GROUP BY type;

-- Sessions created in the last 15 minutes
SELECT COUNT(*) AS count
FROM auth_sessions
WHERE created_at >= unixepoch() - 900;

-- Tables with the largest recent write volume
SELECT type, COUNT(*) AS count
FROM auth_events
WHERE created_at >= unixepoch() - 3600
GROUP BY type
ORDER BY count DESC
LIMIT 20;
```

`auth_events.type` is the event column; do not select `email`, `user_id` or
`metadata` into a shared dashboard. If an investigation needs a specific
account, use the private admin view and record only the account id in the
incident note.

## Live tail

```bash
pnpm exec wrangler tail edapex-api --format pretty
```

Use the request id from a failed response to find its log line. Do not paste
cookies, tokens, emails or request bodies into the incident channel.

## Alert thresholds

| Signal | Warning | Rollback trigger |
|---|---|---|
| 5xx rate | > 1% over 5 min or > 5 errors/min | Sustained > 5% for 5 min after a rollback attempt |
| p95 latency | > 500 ms for 5 min | > 2 s for 5 min with normal traffic |
| D1 query errors | Any | Persistent errors after reconnect |
| FK / integrity alarm | Any `foreign_key_check` row | Any FK violation |
| Count variance | > 0.1% unexplained | Any unexplained variance above 0.1% |
| Spot-check totals | One mismatch | Any result-total mismatch |
| Claim ticket rate | < 50% of attempts after first 100, excluding unknown emails | Complete claim failure with no code change |
| `claim_ambiguous` | Above the pre-window baseline | Sudden spike tied to a school-wide issue |
| Public photo 5xx | Any | Sustained 5xx after cache purge |
| `/health` | One failed probe | Two consecutive failed probes |

The first 15 minutes after the switch use a tighter watch: every 5 minutes for
5xx, latency and `/health`. Do not enable `/claim` until this window is clean.

## 24 h schedule

| Window | Cadence | Record |
|---|---|---|
| T+0–15 min | Every 5 min | 5xx, latency, `/health`, first requests |
| T+15–60 min | Every 15 min | Claim funnel, sessions, D1 errors |
| T+1–4 h | Hourly | Claim metrics, 5xx, D1 rows read/written |
| T+4–12 h | Every 2 h | Trends, ambiguous queue, photo errors |
| T+12–24 h | Every 4 h | Close-out metrics, incident review |
| T+24 h | Sign-off | Checklist + monitoring summary |

Each entry: timestamp, metric, value, threshold state, action. No PII.

## Expected behaviour

- Unknown claim emails return 202 and do not create a ticket; they still emit
  `claim_attempt`. A high unknown rate is normal during the announcement.
- Ambiguous emails return 409 and are worked through the duplicate queue; they
  are expected for the 24 known groups, not a rollback trigger by themselves.
- The public photo route serves only content-addressed image keys; a 404 for one
  of the 228 known-missing files is a data gap, not a Worker failure.
- Historical sessions read from the archive; live historical marks/results are
  zero by design.

## Close-out

- Summarise event counts, 5xx, latency, D1 budget and incidents.
- State whether any rollback trigger fired and the decision.
- Attach the signed checklist and the private evidence paths.
- Do not include names, emails, marks or tokens in the committed summary.
