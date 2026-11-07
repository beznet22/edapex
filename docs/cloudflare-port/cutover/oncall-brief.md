# Cutover on-call brief

One page for the person carrying the pager during the Phase 8 switch. Fill the
names and contacts in the private copy; do not commit real names or numbers.

## Roles

| Role | Responsibility | Contact |
|---|---|---|
| Cutover lead | Runs the runbook, calls go/no-go | `<CUTOVER_INPUT>` |
| Rollback authority | Decides to revert routing; owns the incident | `<CUTOVER_INPUT>` |
| API on-call | Watches 5xx, latency, claim funnel, Worker logs | `<CUTOVER_INPUT>` |
| Source owner / DBA | Owns MySQL freeze, reset backup, read-only state, restore | `<CUTOVER_INPUT>` |
| School admin | Owns the maintenance notice and claim communication | `<CUTOVER_INPUT>` |
| Communications | Announces the window and claim removal date | `<CUTOVER_INPUT>` |

The cutover lead and rollback authority must be different people. The source
owner confirms every MySQL state change out loud before it happens.

## First checks

**T+0 to T+15 minutes**

- `/health` returns 200 on the production host.
- 5xx rate is below 1%; p95 is below 500 ms.
- DNS resolves to the Worker; the legacy host is still reachable.
- `/claim` returns 404 until the lead explicitly enables it.
- Public photo sample returns 200 with immutable caching.
- D1 shows no FK or query errors.

**T+15 to T+60 minutes**

- Claim probe returns 202 after enablement; no ticket is issued to unknown
  emails.
- `auth_events` shows `claim_attempt` and `claim_ticket_issued`; no unexplained
  `claim_failure` spike.
- Sessions are being created for linked accounts.
- D1 rows read/written are within the pre-window estimate.
- Duplicate queue is being worked; 409 responses are expected for known groups.

**T+1 to T+24 hours**

- Hourly claim funnel, 5xx and D1 budget review.
- Photo 404s are checked against `missing-photos.csv`; anything else is an
  incident.
- No writes reach source MySQL; it stays read-only.
- Any count variance or spot-check difference is escalated immediately.

## Escalation

| Symptom | First action | Escalate to |
|---|---|---|
| Two `/health` failures | Check Worker status, recent deploy, DNS | API on-call + rollback authority |
| 5xx > 5% for 5 min | Capture request ids, roll back routing if not explained | Rollback authority |
| FK violation | Stop the migration path; do not retry blindly | Cutover lead + source owner |
| Count variance > 0.1% | Freeze further mutations, compare the final dump | Cutover lead |
| Claim failure with no code change | Disable claim, keep routing, inspect `auth_events` | API on-call |
| Photo 5xx after sample passed | Check R2 binding and cache; revert route only if broad | API on-call |
| D1 budget/error alarm | Reduce polling, inspect hot queries, consider rollback | API on-call + lead |

## Known gaps to expect

- **228 referenced photos are absent locally.** They must be supplied or
  accepted before the window; a 404 for one of those keys is a known data gap.
- **3 students are unplaced** and **234 have no 2026/27 current record**; they
  are in the quarantine report, not silently promoted.
- **15 non-default year-4 records** are historical duplicates; they are not
  promoted.
- **Terms 2 and 3** are not created yet; only FIRST TERM is dated.
- **Archive gaps:** 74 students in session 1 and 16 in session 4 lack a complete
  transcript; existing objects still verify by checksum.
- **Rollback after the auth reset** needs the pre-reset password backup; legacy
  login is not usable with the shared digest.

## Rules

- No direct D1 writes to fix a symptom during the watch; use the documented API
  or roll back.
- No secret, cookie, token, email, phone or student name in the incident
  channel.
- Record time, request id, route, status and action for every incident.
- The rollback authority can order a routing revert without a second vote. The
  cutover lead cannot overrule it.
- Keep the source backup, D1 and R2 objects until the rollback window closes and
  the post-mortem is complete.

## Close

At T+24 h, sign the checklist and hand the summary to the cutover lead. State:
traffic state, claim state, 5xx/latency trend, D1 budget, incidents, open gaps
and whether the rollback window is closed.
