# Reasoning UI Lifecycle: Bug Audit + Simplification Plan

## Context

The "AI is thinking…" shimmer stays active after page reload for every historical reasoning block. The current design wires **three layers of custom lifecycle** (server tracker → mid-stream `data-reasoning` parts → `buildReasoningStateMap`) on top of AI SDK's native `ReasoningUIPart.state`. That stack causes the reload bug **and** fails to reliably persist duration.

**Product requirement (confirmed):** each reasoning block must keep an accurate duration **after page reload**.

---

## Lifecycle map (today)

```
Mastra agent.stream
  └─ fullStream chunks (mostly reasoning-delta)
       │
       ├─ onChunk → createReasoningTracker
       │     ├─ emit data-reasoning {state:'streaming', duration}  transient:true
       │     ├─ setInterval every 3s re-emit duration              transient:true
       │     └─ closeCurrentBlock → {state:'done', duration}       transient:false  ← often fails to persist
       │
       └─ pipeTo(writer) → toAISdkStream → UIMessageStream
             └─ UI parts: { type:'reasoning', text, state? }

Client
  └─ buildReasoningStateMap(parts)  // pairs by runId + counter
  └─ <Reasoning isStreaming duration>
        └─ Trigger: shimmer if isStreaming || !duration  ← reload bug
```

---

## Root cause

### Bug 1 — Trigger treats missing duration as still streaming

`reasoning-trigger.svelte`:

```ts
if (isStreaming || !duration) return "AI is thinking..."; // duration=0 after reload
// "Thought for a few seconds" branch is dead code
```

```svelte
{#if isStreaming || !duration}  <!-- shimmer forever when duration missing -->
```

### Bug 2 — Done durations rarely survive reload

| Issue | Detail |
|-------|--------|
| Timing | `closeCurrentBlock` persists **during** stream; `writeDataPart` needs the assistant message already in memory |
| Contract | `writeDataPart` docs: call **after** `pipeTo` |
| Result | Done emit often skipped ("No assistant message found") |
| Mid-stream ticks | Correctly transient — never meant to persist |
| Over-coupling | UI streaming state also came from these fragile data parts |

### Over-engineering

- Server: block id tracking + `setInterval` + streaming/done dual emits  
- Client: runId extraction + positional id pairing + state map  
- AI SDK already owns `part.state` for streaming lifecycle  

---

## Recommended design: split concerns cleanly

| Concern | Source of truth | Survives reload? |
|---------|-----------------|------------------|
| **isStreaming** | AI SDK `part.state === 'streaming'` | N/A (historical = not streaming) |
| **duration (live)** | Client timer in `Reasoning` while streaming | Session only |
| **duration (durable)** | One post-stream `data-reasoningMeta` part | **Yes** |

No mid-stream data-part ticks. No `state: 'streaming'` on data parts. No `buildReasoningStateMap` pairing for stream state.

---

## Persistence strategy (per-block duration after reload)

### Why not patch the reasoning part itself?

AI SDK `ReasoningUIPart` is only `{ type, text, state?, providerMetadata? }`. There is no first-class `duration` field. Stashing duration in `providerMetadata` is non-standard and easy to strip on conversion. **Custom data parts** are the supported AI SDK extension path (already used for usage, runInfo, etc.).

### Why not keep mid-stream `data-reasoning` done emits?

They race memory persistence and are the main reason durations vanish. Keep measurement on the server if needed, but **write only after the stream has landed**.

### Shape: single durable meta part (recommended)

After `await stream.fullStream.pipeTo(writer)`, emit **one** non-transient part:

```ts
{
  type: 'data-reasoningMeta',
  id: `rm-${runId}`,           // stable; upsert-friendly if rewritten
  data: {
    durations: [2.4, 5.1]      // seconds, order = order of reasoning UI parts
  }
}
```

**Why one array, not N `data-reasoning` rows:**

- One `writeDataPart` after stream → one recall/save, correct timing  
- Pairing is trivial: *Nth* `reasoning` part ↔ `durations[N - 1]`  
- No `${runId}-reasoning-${i}` id parsing  
- Multi-step agent: blocks complete in the same order they appear in `message.parts`

Type in `xDataPart`:

```ts
reasoningMeta: {
  durations: number[]; // seconds per block, occurrence order
};
```

Drop the old `reasoning: { duration }` type (or keep briefly for back-compat with any already-persisted rows — optional).

### Slim server tracker (measure only, emit once)

Replace `createReasoningTracker` with a **measure-only** helper — no transient emits, no `setInterval`:

```ts
function createReasoningDurationTracker() {
  let currentBlockId: string | null = null;
  let currentBlockStart = 0;
  const durations: number[] = [];

  return {
    onChunk(chunk: ChunkType) {
      if (chunk.type === 'reasoning-delta') {
        const id = (chunk.payload as { id?: string } | undefined)?.id ?? null;
        if (id !== null && id !== currentBlockId) {
          if (currentBlockId !== null) {
            durations.push((Date.now() - currentBlockStart) / 1000);
          }
          currentBlockId = id;
          currentBlockStart = Date.now();
        }
      } else if (currentBlockId !== null) {
        durations.push((Date.now() - currentBlockStart) / 1000);
        currentBlockId = null;
        currentBlockStart = 0;
      }
    },
    close() {
      if (currentBlockId !== null) {
        durations.push((Date.now() - currentBlockStart) / 1000);
        currentBlockId = null;
      }
    },
    getDurations: () => durations.slice(),
  };
}
```

In `assistant-step` execute:

```ts
const tracker = createReasoningDurationTracker();
// ... agent.stream with onChunk / onStepFinish / onFinish calling tracker
await stream.fullStream.pipeTo(writer);

// Assistant message now exists in memory — safe to persist
if (runId && tracker.getDurations().length > 0) {
  await writeDataPart(writer, {
    data: {
      type: 'data-reasoningMeta',
      id: `rm-${runId}`,
      data: { durations: tracker.getDurations() },
    },
    memory: memCtx,
    // transient omitted / false → persisted
  });
}
```

Also keep existing `data-runInfo` / `data-usage` post-stream behavior as today.

### Client: resolve duration per block

Tiny helper (replaces `buildReasoningStateMap`):

```ts
/** Ordered durations from durable meta; empty if none (legacy messages). */
function getReasoningDurations(parts: xUIMessagePart[]): number[] {
  for (const p of parts) {
    if (p.type === 'data-reasoningMeta') {
      const d = (p as { data?: { durations?: number[] } }).data?.durations;
      if (Array.isArray(d)) return d;
    }
  }
  // Optional back-compat: scan legacy data-reasoning done parts by index
  return [];
}
```

In `chat.svelte`:

```svelte
{@const reasoningDurations = getReasoningDurations(message.parts)}
{#each message.parts as part, partIndex}
  {#if part.type === "reasoning"}
    {@const blockIndex = /* count of reasoning parts up to partIndex */}
    <Reasoning
      isStreaming={part.state === "streaming"}
      duration={reasoningDurations[blockIndex] /* may be undefined */}
    >
```

`blockIndex` can be computed in the each loop with a simple counter, or precomputed in the same helper that returns `Map<partIndex, number>`.

Prefer a small map for clean templates:

```ts
function buildReasoningDurationMap(parts: xUIMessagePart[]): Map<number, number> {
  const durations = getReasoningDurations(parts);
  const map = new Map<number, number>();
  let i = 0;
  parts.forEach((p, idx) => {
    if (p.type !== 'reasoning') return;
    const d = durations[i++];
    if (typeof d === 'number' && d >= 0) map.set(idx, d);
  });
  return map;
}
```

Still far smaller than today's state map (no runId, no isStreaming, no last-write-wins over streaming snapshots).

### Live session duration (while streaming)

`reasoning.svelte` still runs a **client timer** when `isStreaming` becomes true, so the trigger can show live seconds without server ticks. When streaming ends:

1. Client has a local duration immediately.  
2. Server soon appends `data-reasoningMeta` (and the part appears on the message via the stream writer).  
3. Prefer **prop duration from meta when present**; else client-measured; else fallback copy.

```ts
// reasoning.svelte priority
// external duration prop (from meta map) > local measured > undefined
```

---

## Trigger copy rules (fixed)

| State | UI |
|-------|-----|
| `isStreaming` | Shimmer + "AI is thinking…" (optional live `formatDuration` if local timer > 0) |
| `!isStreaming && duration > 0` | "Thought for N secs" |
| `!isStreaming && !duration` | "Thought for a few seconds" — **static**, no shimmer (legacy / failed persist only) |

```ts
if (isStreaming) return duration > 0 ? `Thinking (${formatDuration(duration)})…` : "AI is thinking...";
if (duration > 0) return `Thought for ${formatDuration(duration)}`;
return "Thought for a few seconds";
```

```svelte
{#if isStreaming}
  <Shimmer>…</Shimmer>
{:else}
  <p>{getThinkingMessage}</p>
{/if}
```

---

## What changes by file

| File | Action |
|------|--------|
| `assistant-step.ts` | Replace tracker with measure-only; **flush `data-reasoningMeta` after `pipeTo`**; drop interval + mid-stream emits |
| `chat-types.ts` | Add `reasoningMeta: { durations: number[] }`; remove or deprecate old `reasoning` data shape |
| `chat-context.svelte.ts` | Replace `buildReasoningStateMap` with `buildReasoningDurationMap` (durations only) |
| `chat.svelte` | `isStreaming={part.state === 'streaming'}`; `duration` from duration map |
| `reasoning.svelte` | Client timer for live duration; merge with external prop |
| `reasoning-trigger.svelte` | Fix shimmer / dead-code branches |

---

## Back-compat for existing threads

Messages saved under the old `data-reasoning` scheme may have:

- No meta at all → fallback "Thought for a few seconds"  
- Or rare successful `data-reasoning` done parts with `{ state:'done', duration }`

Optional one-liner in `getReasoningDurations`:

```ts
// If no reasoningMeta, collect legacy data-reasoning durations in id order
```

Not required for correctness of new turns; nice for any already-persisted done parts.

---

## Implementation order

1. Fix `reasoning-trigger.svelte` (stop shimmer when not streaming).  
2. Wire `part.state` + duration map in `chat.svelte` / `chat-context`.  
3. Client timer in `reasoning.svelte`.  
4. Slim tracker + **post-`pipeTo` `data-reasoningMeta`** in `assistant-step.ts`.  
5. Update types; delete old map/tracker pieces.  
6. Verify.

---

## Verification

1. **Live:** shimmer while `part.state === 'streaming'`; after block ends, "Thought for N secs" from client timer.  
2. **Multi-block:** each block gets its own duration in order.  
3. **Reload:** same thread shows exact persisted durations from `data-reasoningMeta` — no shimmer.  
4. **Abort / error mid-reasoning:** `tracker.close()` still records open block; meta flush still runs if any durations exist (or skip if empty).  
5. **Legacy messages without meta:** static "Thought for a few seconds", no shimmer.  
6. Typecheck/lint touched files; no remaining mid-stream `data-reasoning` streaming emits.

---

## Why this stays simple

| Old | New |
|-----|-----|
| Transient streaming data parts + interval | Client timer from `part.state` |
| Persist-during-stream done parts | One post-`pipeTo` meta write |
| runId + id parse + state map | Ordered `durations[]` |
| isStreaming via data parts | Native `part.state` |
| ~150 lines across 3 layers | Measure-only tracker + ~20-line client map + trigger fix |

Duration persistence is **one intentional durable write after the message exists** — not a parallel streaming protocol.

---

## Completion Verification Checklist

This checklist captures the 6 verification scenarios from the original plan plus the completion cleanup committed alongside it. Items marked **Agent** can be executed from the shell; items marked **Human** require a real browser session with a reasoning-capable model.

### Pre-completion cleanup (committed)

| # | Item | File | Result | Notes |
|---|------|------|--------|-------|
| C1 | Drop legacy `data-reasoning` reader from `getReasoningDurations` | `src/lib/context/chat-context.svelte.ts` | ☑ | Function now reads only `data-reasoningMeta`; old threads fall back to static copy |
| C2 | Mark `data-usage` `writeDataPart` as `transient: true` | `src/lib/server/mastra/workflows/chat/assistant-step.ts` | ☑ | Matches "conversation-scoped, not message-attached" comment; no longer persisted onto the assistant message |

### Verification scenarios

| # | Scenario | Executor | Result | Notes |
|---|----------|----------|--------|-------|
| V1 | **Live shimmer:** while `part.state === 'streaming'`, the trigger renders a shimmer with "AI is thinking…" (or "Thinking (N secs)…" once the client timer is > 0) | Human | ☐ | Open a chat, send a prompt, observe the block header |
| V2 | **Multi-block duration ordering:** each reasoning block in one assistant message gets its own duration, in occurrence order, paired by index into `data-reasoningMeta.durations` | Human | ☐ | Use a multi-step reasoning model; verify each block shows its own "Thought for N secs" |
| V3 | **Reload persistence:** after the stream ends, reload the page; the same thread shows exact persisted durations from `data-reasoningMeta` with no shimmer | Human | ☐ | Verify devtools shows a `data-reasoningMeta` part on the persisted message |
| V4 | **Abort / error mid-reasoning:** cancelling a stream mid-block still records the open block (`tracker.close()` runs via `onFinish`); meta write is skipped if `durations.length === 0` | Agent or Human | ☐ | Cancel a stream; verify no `data-reasoningMeta` part is written for an empty turn |
| V5 | **Legacy messages without meta:** historical messages lacking `data-reasoningMeta` render the trigger as static "Thought for a few seconds", with no shimmer | Human | ☐ | Open an older thread; confirm static copy |
| V6 | **Typecheck / lint cleanliness on touched files** | Agent | ☑ | Touched reasoning files have zero errors. Whole project still has 49 pre-existing errors / 22 warnings in unrelated test files and routes. Note: package.json has no `lint` script; used `pnpm run check` instead. |

### Files in scope for V6

- `src/lib/context/chat-context.svelte.ts`
- `src/lib/server/mastra/workflows/chat/assistant-step.ts`
- `src/lib/components/chat.svelte`
- `src/lib/components/ai-elements/reasoning/reasoning.svelte`
- `src/lib/components/ai-elements/reasoning/reasoning-trigger.svelte`
- `src/lib/types/chat-types.ts`

### Follow-up risk (not addressed in this completion)

`src/lib/server/mastra/workflows/chat.ts` still contains an inline `chatWorkflow` and inline `assistantStep` using the **old** reasoning pattern (writes `data-usage` directly, no `data-reasoningMeta`). This file is dead code — `src/lib/server/mastra/workflows/index.ts` composes the refactored `./chat/assistant-step.ts` instead — but it should be deleted in a follow-up commit to remove the risk of accidental import.
