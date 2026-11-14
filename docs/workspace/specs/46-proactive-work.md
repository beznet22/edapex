# 46 — Proactive Work (design)

**Status:** design proposal for chunk 4. No code written yet.
**Depends on:** `41` §Routines are local-first, `42` §Tasks and questions / §Connections, routines, proactive work, `15` §v1 surface matrix, `17` chat state.

This document decides **what the agent does when nobody is watching**. That is a
trust question before it is a technical one, so the rules below are written to make
the honest failure visible rather than to make the feature look complete.

## The governing constraint

**Routines run on the device. The server holds state, dedupe keys and cursors. No
`scheduled` handler exists in any Worker.**

| Consequence | Treatment |
|---|---|
| A routine only fires while a device is open | The UI says so. It is never presented as a server guarantee. |
| A brief may arrive late | Accepted. A laptop opened at 11pm still gets today's brief. |
| Two tabs / two devices could both produce it | Dedupe is a server-held key, so exactly one brief exists per day. |
| A hundred tenants × per-routine cron would exceed ~100k D1 writes/day | No cron fan-out. One documented incident already hit 148,861 writes in a day. |

The trade is stated in the UI, not hidden in a doc: *"Routines run while EdApex is
open in a browser."*

## 1. The dedupe that must not lose a day

This is the one place where a naive design silently drops a day's work, so it gets
the most care.

A single `INSERT OR IGNORE` on `(workspace, user, date)` is wrong. If the winning
device claims the key and then crashes, the key stays claimed and **no device can
ever produce that day's brief**. The claim and the completion are different facts
and must be stored as such.

```
brief_claims (
  workspace_id, user_id, brief_date,   -- primary key
  claimed_by_device                    -- who holds the lease
  claimed_at,
  lease_until,                         -- short; re-claimable after this
  completed_at                         -- null until the brief actually exists
)
```

Three states, three meanings:

| State | Meaning | Next step |
|---|---|---|
| No row | Nobody has started | Any device may claim |
| Row with `lease_until` in the future | One device is working | Everyone else stays quiet |
| Row with `lease_until` past, `completed_at` null | The claimant died | Any device may take over |
| `completed_at` set | Done | Everyone stays quiet, forever for that date |

**Only `completed_at` is permanent.** A lease is a few minutes, because the
failure it protects against — a device disappearing mid-brief — is much more
common than a second device wanting to run the same brief at the same second.

The same shape applies to a routine run: `routine_runs` already has
`status = waiting`, so a `waiting` run older than its lease is re-claimable rather
than stuck.

## 2. Task state is derived, never stored

`42` forbids a cached task `status`, and for good reason: a stored status and the
underlying work drift apart, and the person then sees "done" over a failed run.
Every state is a projection of rows that already exist.

| Shown state | Derived from |
|---|---|
| **Needs you** | A `task_questions` row with `answer IS NULL` |
| **Blocked** | An `approval_requests` row with `status = pending`, or a `denied` one |
| **Running** | A `work_items` row claimed and not finished, or a `routine_runs` row with no `finished_at` |
| **Didn't work** | `work_items.last_error IS NOT NULL` after attempts exhausted |
| **Not completed** | A run finished without resolving the task |
| **Done** | `tasks.resolved_at IS NOT NULL` |

Precedence matters and is fixed: **needs you > blocked > didn't work > running >
not completed > done**. A task waiting on a person is never hidden behind a
spinner, because the person is the thing the task is waiting for.

Retry is shown, not hidden: `attempts` and `last_error` surface as *"Attempt 2 of
3 — the connector timed out"*. A silent retry teaches people to distrust the
result.

## 3. Triage

The Tasks surface is a **needs-input queue**, not a chronological list.

Ordered by: blocking a live turn, then blocking an approval, then age. A decision
that is stopping work right now outranks one that can wait until tomorrow.

The count appears in the shell as a badge, from the same derivation — one
projection, so the badge and the list can never disagree.

## 4. Morning brief

One per person per day, produced by whichever open device wins the claim.

- **Date is the person's local date**, sent by the device and validated as
  near-UTC (within 24h) so a device cannot claim tomorrow's key to get a second
  brief today.
- Content is assembled from licensed sources only: tasks needing input, approvals
  pending, routines that failed, and work items finished overnight.
- **If nothing happened, it is not produced.** An empty brief is noise, and noise
  is how people learn to dismiss the surface that matters.
- The brief is a chat turn, not a separate surface, so approvals and questions
  inside it use the same `ActionBar` as any other turn.

## 5. First-day greeting

Runs once per person, as a bot-started turn.

- **The person always wins the race.** If the composer has content, or a send has
  happened, or a thread already exists, the greeting is cancelled. A greeting that
  appears above someone's typed question is the worst version of this feature.
- Two variants, chosen by connector state: mail connected → a greeting that
  mentions their mail; no mail → a greeting that offers to connect it.
- It waits for the capability manifest, so it never offers a tool the role cannot
  use.

## 6. Reply chips

Attached to the turn they answer, and expired with it. Not a floating suggestion
bar.

- Chips are data from the turn's `surface` part, so they cannot outlive the answer
  that produced them.
- A chip is a shortcut for typing, never an auto-send. Selecting one fills the
  composer; it does not run anything. Sending is still the person's action.
- Max 4. A wall of chips is a menu, and a menu in a conversation is a failure of
  the conversation.

## 7. Setup checklist

Derived from real state, never a stored checkbox list:

| Step | Derived from |
|---|---|
| Answer your first task | Any `tasks.resolved_at` |
| Connect a calendar or mail | `connector_accounts` with `revoked_at IS NULL` |
| Create a routine | Any `routines` row |
| Run it once | Any `routine_runs` row |

Progress is computed so it cannot claim something is done that is not, and
disappears entirely once complete rather than lingering as a 100% bar.

## Data flow (no cron anywhere)

```
device opens
   │
   ├─ local store: any routine due?  ──no──▶ idle
   │        yes
   ├─ POST /api/v1/agent/routines/:id/claim   (lease, may lose)
   │        won
   ├─ run the turn locally, stream as usual
   └─ POST /api/v1/agent/routines/:id/complete  (clears lease, sets completed_at)
```

The server never initiates. It answers claims and keeps the record.

## Contracts to add

| File | Contents |
|---|---|
| `packages/contracts/src/tasks.ts` | `TaskState` union, `deriveTaskState` (pure), retry display |
| `packages/contracts/src/routines.ts` | `Routine`, `RoutineRun`, `ClaimResult`, schedule parsing |
| `packages/contracts/src/notifications.ts` | `NeedsInputCount`, brief identity |

`deriveTaskState` is pure and shared, so the badge, the list and the tests cannot
disagree about what "blocked" means.

## Acceptance (mapped to the chunk brief)

| Brief line | How it is proven |
|---|---|
| Routines fire on an open device | A test drives the claim → run → complete cycle with the server answering, and asserts nothing fires when no device asks |
| One brief per day across tabs/devices | Two claimers against one key: the first wins, the second is told `already_claimed`; after lease expiry a third may take over |
| Task states and retry visible | `deriveTaskState` table tests, including precedence, plus a rendered attempt count |
| No cron fan-out | A test asserts no `scheduled` export exists in any Worker entry |

## Open questions for review

1. **Brief scope.** Tasks and approvals only, or also a "what changed in your
   school yesterday" summary? The second needs school data this Worker cannot
   read, so it would have to come through `sms-api` — which expands chunk 4.
   **Recommendation: tasks and approvals only**, and let the reply chips offer the
   school question as a normal turn.
2. **Lease length.** I propose 5 minutes. Shorter risks a slow turn losing its own
   claim; longer delays a takeover after a crash.
3. **Whether a missed brief is recoverable.** If the person never opens a device
   all day, nothing is produced and the day is skipped. **Recommendation: skip,
   do not backfill.** A three-day backlog of briefs is not a brief.
