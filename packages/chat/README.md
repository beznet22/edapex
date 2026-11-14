# `@edapex/chat`

Chat state primitives shared by every surface. Pure reducers and small presentational
components — no transport, no network, no knowledge of which runtime is connected.

| | |
|---|---|
| Package | `@edapex/chat` (library, never deployed) |
| Runtime deps | `@edapex/contracts`, `clsx`, `tailwind-merge` |
| Peer dep | `react` 19 |
| Consumed by | `apps/web` |

## What it owns

| Module | Responsibility |
|---|---|
| `queue.ts` | Pending-message queue: submit, remove, settle, drain |
| `turn.ts` | Turn state machine: `idle → thinking → following → tool_running → waiting_for_person → completed/stopped/error` |
| `runtime-state.ts` | Combines queue and turn into one `WorkspaceRuntimeState` |
| `runtime.ts` | `WorkspaceRuntimeAdapter` — the interface a host implements |
| `components/` | Presentational pieces shared across surfaces |

## The rule that matters

**This package does not perform I/O.** It defines state transitions and the
adapter interface; the host supplies the implementation. `apps/web` feeds it from
`NativeAgentAdapter`, which drives the Rust core in WASM. A second surface (Tauri
desktop) can feed the same reducers from `Channel<AgentEvent>` without touching
anything here.

That separation is why the streaming fix lives in the adapter rather than in the
reducer: coalescing token deltas is a transport concern, not a state-shape
concern.

## Settings that change behaviour

- `restore_complete` / `restore_unavailable` are distinct events. A failed history
  restore must be visible, not indistinguishable from an empty thread.
- A turn is `stoppable` only while it is running; the reducer refuses a stop
  otherwise, so a stale Stop button cannot cancel the next turn.

## Working on it

```bash
pnpm --dir packages/chat exec tsc --noEmit
pnpm --dir packages/chat exec vitest run
```

Every reducer change needs a test beside it — `queue.test.ts`, `turn.test.ts` and
`runtime-state.test.ts` are the specification for the state machine.
