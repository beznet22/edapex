# Chat Agentic UI Redesign — 2026-07-08

> Comprehensive design specification covering the frontend refactor required to surface the new agentic workflow shipped in the recent backend refactor. This document is the source of truth for the redesign; all subsequent implementation work is derived from it.

> **Update 2026-07-08 (commit `32dced1`)**: An interim commit (`797d498`) introduced a workflow-level agentic loop (`.dountil()` over an `agentLoopStep` with `AGENT_LOOP_MAX_ITERATIONS = 8`). That refactor was reverted because the AI SDK's native `maxSteps: 30` already drives the agentic loop inside `assistantStep` — the workflow-level wrapper duplicated that mechanism AND broke client-side streaming by failing to call `pipeTo(writer)`. The doc below has been updated to describe the current state: a linear workflow chain (`assistantStep → selectionGateStep → continuationAssistantStep → awaitValidationStep`) where the agentic loop is driven by the AI SDK's `maxSteps: 30` inside `assistantStep` and `continuationAssistantStep`. **The UI design decisions in this spec are unchanged** — they describe what the user sees, not how the loop is implemented in the workflow runtime.

---

## 1. Executive Summary

The backend chat workflow runs as a linear chain `assistantStep → selectionGateStep → continuationAssistantStep → awaitValidationStep`. Inside `assistantStep` (and `continuationAssistantStep`), the assistant agent is invoked with `generateText({ maxSteps: 30 })` — the AI SDK drives the agentic loop natively, executing tool calls inline until completion or the 30-step cap. HITL is gated via `awaitValidationStep`. All `data-*` parts emit via `writeDataPart` so streams survive client reconnects.

The chat UI in `src/lib/components/chat.svelte` was **not updated to match**. It still consumes the old linear-chain shape, silently drops `tool-*` parts, ignores the persisted HITL `data-*` parts in some places, renders an outdated `pdf-preview.svelte` modal that the workspace panel already covers via embedPDF, and surfaces token usage inside the composer instead of the header. The result: tool calls invisible to users, HITL re-prompts unreliable across reconnects, redundant PDF modal, scattered control surface, and no friendly recovery for the new error codes the agent loop can emit.

This spec redesigns the chat UI to **fully expose the new agentic surface while shrinking the component graph** (-2 files net). All work reuses existing primitives; only one new file is created. The scope is fixed: six fixes, no more, no less.

---

## 2. Backend Context (why this UI work exists)

### 2.1 What shipped

The previous session completed three sequential refactors of `src/lib/server/mastra/workflows/index.ts` and its per-step files. The end state — and what the UI must now render against — is:

| Concern | State | Where |
|---|---|---|
| Workflow shape | Linear chain `assistantStep → selectionGateStep → continuationAssistantStep → awaitValidationStep`. HITL is gated through `selectionGateStep`; the chain continues into `awaitValidationStep` only when a marksheet is in flight. | `src/lib/server/mastra/workflows/index.ts` |
| Iteration cap | `maxSteps: 30` on the agent invocation — the AI SDK runs the agentic loop natively, executing tool calls inline up to the 30-step limit. No workflow-level iteration guard. | `src/lib/server/mastra/workflows/chat/assistant-step.ts`, `src/lib/server/mastra/workflows/chat/continuation-assistant-step.ts` |
| Per-iteration agent | `assistantStep` (and `continuationAssistantStep`) use `generateText({ maxSteps: 30 })`. The AI SDK handles tool-call loops inline within a single step; the workflow chain advances linearly to the next step when the agent stream completes. | `src/lib/server/mastra/workflows/chat/assistant-step.ts`, `src/lib/server/mastra/workflows/chat/continuation-assistant-step.ts` |
| Streaming | `assistantStep` and `continuationAssistantStep` end with `await stream.fullStream.pipeTo(writer)` — every text-delta, reasoning-delta, and tool-call chunk is forwarded to the workflow writer for real-time client streaming. | `src/lib/server/mastra/workflows/chat/assistant-step.ts:96` |
| HITL gate | `awaitValidationStep` — gated on `lastFormattedDocumentId` or `formatArtifactState.persistPath`; supports `dropdownOptionId` (option selection) + `cancel` (server-side `run.cancel()` via `/api/chat/cancel`) | `src/lib/server/mastra/workflows/chat/await-validation-step.ts` |
| Persistence | All `data-*` parts emit via `writeDataPart`; non-persisted parts marked `transient: true` (`data-usage`, `data-isCustomPersistence`, `data-rateLimit`, `data-notification`, `data-generatePDF`, `data-streamDocument`) | `src/lib/server/mastra/utils/chat-utils.ts` |
| Agent-loop architecture | The workflow-level `.dountil()` + `agentLoopStep` + `passthroughStep` + `seed-agent-loop-step` + `seed-branch-input-step` design from commit `797d498` was reverted in `32dced1` because it duplicated the AI SDK's native `maxSteps` loop AND broke streaming by failing to call `pipeTo(writer)`. | `32dced1` (revert) |
| Cancel endpoint | `POST /api/chat/cancel` rehydrates `createRun({ runId }).cancel()` | `src/routes/api/chat/cancel/+server.ts` |
| Auto-fix | `validate-marksheet.ts` retries with auto-fix `maxAttempts` cap; `permissionGrant` read from `requestContext` | `src/lib/server/mastra/tools/operations/reporting/marksheet/validate-marksheet.ts` |

### 2.2 What this means for the UI

The new agentic surface emits a richer and more structured `message.parts` stream. The UI must:

1. **Render `tool-*` parts as a visible group** (previously dropped silently). Each cycle of the agent loop produces zero or more tool calls; the loop can fire multiple cycles (up to 8) producing multiple tool calls per assistant message. The UI must collapse them into one "Tools (N)" group with `defaultOpen={true}`.

2. **Honor persisted `data-*` parts.** `data-awaitValidation`, `data-validationErrors`, `data-selectOption`, `data-disambiguation`, `data-committed`, `data-emitPdfPart`, `data-emitNotification`, `data-emitSelectOption`, `data-rateLimit` all persist to libSQL. They survive reconnects and the UI must read them via the existing `ActionBar` and `useChat` flow, not via transient context.

3. **Expose agent activity.** The agent can iterate up to 30 steps inside a single assistant turn (via `maxSteps: 30` on `generateText`). The UI must show a minimal shimmer on the most recent assistant message while the agent is still working (not a step counter — just a subtle pulse so the user knows the agent is thinking).

4. **Handle the new error surface.** Six new error codes can surface from the workflow:
   - `AUTO_FIX_EXHAUSTED` — auto-fix retries exhausted; marksheet needs manual edit
   - `STUDENT_ID_MISSING` — marksheet has no linked student
   - `PERSIST_PATH_MISSING` — formatted path not set; can't validate
   - `TOOL_NOT_REGISTERED` — workflow config error; admin needed
   - `AGENT_LOOP_EXHAUSTED` — the agent hit its `maxSteps: 30` cap without converging
   - `BUN_PRECONDITION_FAILED` — server-side dep missing; admin needed

   Each needs a friendly title, actionable message, and a suggested action. `ErrorAlert.svelte` already routes through `categorizeAIError`; the fix is to extend `categorizeAIError` and (for one new action) add a button to `ErrorAlert.svelte`.

5. **Surface cancel during HITL.** The `await-validation-step` schema already accepts `cancel`. The chat context already exposes `cancelValidation()`. The UI must wire a Cancel button into the existing `ActionBar` (which already renders approvals and option selection) so users can abandon a stuck validation.

6. **Render `data-streamDocument` and `data-generatePDF` as `ArtifactCard` (was `ShimmerArtifactCard`).** These data parts fire during agent loop iterations. The current `ShimmerArtifactCard` is visually weak; the redesign aligns it with the reference designs in `static/artifact/artifact-{loading,done}.png` and renames it to `ArtifactCard` to reflect its broader role (it's no longer just a shimmer state — it has a fully-populated done state).

### 2.3 Baseline state

- `pnpm run check` baseline: **68 errors and 22 warnings in 33 files** (pre-existing; out of scope for this work)
- Zero new errors introduced by this redesign (verified after each fix)
- All Phase 1/2/3 backend commits are merged to `main`

---

## 3. Goals & Non-Goals

### 3.1 In scope

| ID | Fix | Why |
|---|---|---|
| F1 | Remove `pdf-preview.svelte` and its `<PreviewModal />` mount | Workspace panel renders PDFs via embedPDF in `editor-canvas.svelte`; the modal duplicates this surface and adds nothing. |
| F2 | Hide `<ActivityPopover />` in `chat-header.svelte` + move `<ContextUsageIndicator />` from composer to header | Activity feature isn't supported; token usage belongs in the header next to the model selector. Files are kept with a TODO for future re-enablement. |
| F3 | `<Toaster />` `position="bottom-center"` → `"bottom-left"` | Aligns with the "Gold on Slate" design language — system toasts (auth, rate limits) read better in the lower-left, out of the user's gaze path. |
| F4 | Refactor tool rendering: new `chat/ToolGroup.svelte` wraps `tool-message.svelte` instances under a `▼ Tools (N)` collapsible, `defaultOpen={true}` | The current chat.svelte silently drops tool parts; tool-message.svelte exists but is unused. Group them so users can see what the agent did. |
| F4b | Add a copy-to-clipboard button to the raw JSON view inside `tool-message.svelte` (Q6 brainstorming answer: raw JSON with copy icon) | Tool result preview currently has collapsible JSON but no copy affordance; users wanting to share or paste tool output have to select text manually. |
| F5 | Rename `ShimmerArtifactCard` → `ArtifactCard`; rewrite to match the two reference states in `static/artifact/artifact-{loading,done}.png` (inner card only — the "Thinking completed >" header is rendered by the parent) | Current card visually weak; doesn't match reference. Rename reflects broader role. |
| F6 | Add 6 new error categories to `categorizeAIError` in `$lib/errors/friendly-ai-error.ts`; possibly add one button to `shared/ErrorAlert.svelte` for the new `edit_marksheet_then_retry` action | Workflow can now emit these errors; users need friendly recovery paths. |

### 3.2 Out of scope (explicit)

- Background tasks feature (deferred — files kept, TODO comment added)
- Iteration breadcrumbs with counts (would require new state tracking; shimmer is sufficient)
- Conversation checkpointing / snapshot (no libSQL snapshot infra; too invasive)
- Plan mode hint (requires LLM feature)
- Fixing the 68 pre-existing type errors (separate scope; deferred per prior session agreement)
- Deleting the legacy `src/lib/server/mastra/workflows/chat.ts` (frozen reference; session-end task)
- New toast types or new toast patterns (only position changes)
- Animation/transition library changes (CSS-only)

---

## 4. Design

### 4.1 Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ chat-header.svelte                                              │
│ ┌─────────┐ ┌─────────┐ ┌──────────────────────────────┐        │
│ │ Sidebar │ │  Model  │ │ ContextUsageIndicator ◀ F2  │        │
│ │ Trigger │ │Selector │ │ (TODO: ActivityPopover F2)  │        │
│ └─────────┘ └─────────┘ └──────────────────────────────┘        │
└─────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────┐
│ chat.svelte — message loop                                       │
│                                                                  │
│  For each assistant message:                                     │
│    ┌─────────────────────────────────────────────────┐           │
│    │ Thinking completed >         ◀── parent wrapper │           │
│    │ ┌─────────────────────────────────────────┐    │           │
│    │ │       ArtifactCard  ◀── F5 (inner only) │    │           │
│    │ │       (renamed from ShimmerArtifactCard)│    │           │
│    │ └─────────────────────────────────────────┘    │           │
│    │ ▼ Tools (3)             ◀── ToolGroup F4      │           │
│    │   [ToolMessage] [ToolMessage] [ToolMessage]    │           │
│    │       defaultOpen=true                         │           │
│    │ [ErrorAlert — F6]                              │           │
│    │ [minimal shimmer — iteration indicator]        │           │
│    └─────────────────────────────────────────────────┘           │
│                                                                  │
│  [no PreviewModal — F1]                                          │
└─────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────┐
│ ChatComposer.svelte                                              │
│  (no longer owns ContextUsageIndicator — F2)                     │
└─────────────────────────────────────────────────────────────────┘
┌─────────────────────────────────────────────────────────────────┐
│ Workspace Pane (sidebar/ArtifactViewer)                          │
│  - PDFs via embedPDF in editor-canvas.svelte                     │
│  - Markdown via markdown-preview.svelte                          │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 Fix F1 — Remove `pdf-preview.svelte`

**Files**:
- Delete: `src/lib/components/pdf-preview.svelte`
- Modify: `src/lib/components/chat.svelte` (remove import line and `<PreviewModal />` render)

**Verification**:
```bash
grep -rn "pdf-preview" src/
# Expected: no matches
```

The workspace panel already renders PDFs via `editor-canvas.svelte`'s embedPDF integration (`@embedpdf/core/svelte`, `@embedpdf/engines/svelte`, `@embedpdf/plugin-viewport`, `@embedpdf/plugin-scroll`, `@embedpdf/plugin-document-manager`, `@embedpdf/plugin-render`). The `ArtifactViewer` reads `inspector.activeChatArtifactId` and dispatches to the right renderer; PDFs route to `EditorCanvas type="pdf"`.

### 4.3 Fix F2 — Hide activity icon + move token usage

**Files**:
- Modify: `src/lib/components/chat-header.svelte` — replace `<ActivityPopover />` with `<ContextUsageIndicator />`; add TODO comment
- Modify: `src/lib/components/ChatComposer.svelte` — remove `<ContextUsageIndicator>` from the action tray

**`chat-header.svelte` change** (around the current `ActivityPopover />`):
```svelte
<!-- TODO(background-tasks): Re-enable <ActivityPopover /> here when
     background-task feature ships (OCR worker, etc). Files to revisit:
     src/lib/components/activity-popover.svelte
     src/lib/state/background-tasks.svelte
     src/lib/types/background-tasks.ts -->
<ContextUsageIndicator
  modelId={selectedChatModelId}
  maxTokens={currentModelLimit}
/>
```

`selectedChatModelId` and `currentModelLimit` come from the chat context (model selector state).

**Preserved (NOT deleted)**:
- `src/lib/components/activity-popover.svelte`
- `src/lib/state/background-tasks.svelte`
- `src/lib/types/background-tasks.ts`

These stay for future re-enablement. The TODO comment is the breadcrumb back.

### 4.4 Fix F3 — Toast bottom-left

**Files**:
- Modify: `src/routes/+layout.svelte` line 48

**Change**:
```diff
- <Toaster position="bottom-center" />
+ <Toaster position="bottom-left" />
```

No other changes. The toaster is read-only here; existing `toast()` call sites are not touched.

### 4.5 Fix F4 — Tool group refactor

**Problem**: `chat.svelte`'s message loop iterates `message.parts` but doesn't render `tool-*` parts. `tool-message.svelte` exists (240 lines, full state machine + structured fields + collapsible raw JSON) but is **never imported**. Tool calls are silently invisible to users.

**Solution**: New `chat/ToolGroup.svelte` wraps the per-message tool calls in one collapsible group. `tool-message.svelte` is refactored to remove its outer wrapper (the group owns spacing).

**Files**:
- Create: `src/lib/components/chat/ToolGroup.svelte` (~50 lines)
- Modify: `src/lib/components/chat.svelte` — render tool parts via `ToolGroup`
- Modify: `src/lib/components/tool-message.svelte` — strip outer wrapper div (F4) + add copy icon to raw JSON view (F4b)

**`ToolGroup.svelte`** (new file):
```svelte
<script lang="ts">
  import type { xUIMessagePart } from "$lib/types/chat-types";
  import {
    Collapsible,
    CollapsibleContent,
    CollapsibleTrigger,
  } from "$lib/components/ui/collapsible";
  import ToolMessage from "$lib/components/tool-message.svelte";
  import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";

  let { parts }: { parts: xUIMessagePart[] } = $props();
  const toolCount = $derived(parts.length);
</script>

<div class="w-full max-w-2xl">
  <Collapsible
    defaultOpen={true}
    class="rounded-2xl border border-border/30 bg-background/30 backdrop-blur-sm overflow-hidden"
  >
    <CollapsibleTrigger
      class="group flex w-full items-center justify-between px-3.5 py-2 text-[11px] font-semibold tracking-wider uppercase text-muted-foreground hover:text-foreground hover:bg-muted/20 transition-colors"
    >
      <span>Tools ({toolCount})</span>
      <ChevronDownIcon
        class="size-3.5 transition-transform group-data-[state=open]:rotate-0 group-data-[state=closed]:-rotate-90"
      />
    </CollapsibleTrigger>
    <CollapsibleContent class="divide-y divide-border/20">
      {#each parts as part, i (i)}
        {#if part.type.startsWith("tool-")}
          <div class="px-3.5 py-2">
            <ToolMessage {part} />
          </div>
        {/if}
      {/each}
    </CollapsibleContent>
  </Collapsible>
</div>
```

**`chat.svelte` integration** (precomputed grouping via `$derived` outside the template loop to avoid per-render `.filter()`):
```svelte
<script lang="ts">
  // ...existing imports + state
  const messagesWithToolSplit = $derived(
    messages.map((m) => ({
      ...m,
      toolParts: m.parts.filter((p) => p.type.startsWith("tool-")),
      nonToolParts: m.parts.filter((p) => !p.type.startsWith("tool-")),
      hasArtifact: m.parts.some(
        (p) => p.type === "data-streamDocument" || p.type === "data-generatePDF",
      ),
    })),
  );
</script>

<!-- template -->
{#each messagesWithToolSplit as message (message.id)}
  {@const toolParts = message.toolParts}      <!-- precomputed in $derived -->
  {@const nonToolParts = message.nonToolParts} <!-- precomputed in $derived -->
  {#if nonToolParts.length > 0}
    <!-- existing non-tool rendering (reasoning, text, etc) -->
  {/if}
  {#if toolParts.length > 0}
    <ToolGroup parts={toolParts} />
  {/if}
  <!-- F5 "Thinking completed >" wrapper (see 4.6) — only when hasArtifact -->
{/each}
```

`toolParts`, `nonToolParts`, and `hasArtifact` are computed once per message via the `$derived` block at the script level, then read inside the `{#each}` via `{@const}` aliases. This keeps the template cheap on every rerender and removes the ambiguity between `{@const}` and `$derived` for the implementation agent.

**`tool-message.svelte` refactor**:
- Remove the outer `<div class="max-w-2xl space-y-6">` wrapper — the parent `ToolGroup` owns the spacing
- Keep all internal state machine logic, structured fields, and collapsible raw JSON
- (F4b) Add a copy-to-clipboard button next to the raw JSON view inside the collapsible output section — see F4b below

**F4b — Tool result copy icon**

Brainstorming Q6 confirmed that tool result previews should show raw JSON with a copy icon. The existing `tool-message.svelte` already has a collapsible raw JSON section but lacks a copy button. Add one:

- Import `@lucide/svelte/icons/copy` for the icon
- Import `toast` from `$lib/components/ui/sonner` (the project-wide toast helper, already in use)
- On click, run `navigator.clipboard.writeText(JSON.stringify(parsedResult, null, 2))` against the same JSON the collapsible renders
- On success, call `toast.success("Copied!")` (or the existing 2s toast helper if a shorter-lived variant exists); on failure (e.g., clipboard permission denied), call `toast.error("Could not copy to clipboard")`
- Button placement: top-right of the collapsible raw JSON section, same row as the section's existing label
- Button styling: matches the existing muted-foreground hover-foreground icon button pattern used elsewhere in the file

No new state, no new dependencies beyond `@lucide/svelte/icons/copy` (already a project dep).

### 4.6 Fix F5 — ArtifactCard redesign + rename

**Problem**: `ShimmerArtifactCard.svelte` is a thin card with a small icon + text + chevron. It doesn't match the reference designs in `static/artifact/artifact-{loading,done}.png`. The component is misnamed — it has both loading (shimmer) and done states.

**Reference behavior** (from user-provided descriptions):

```
                                                             
   ┌──────────────────────────────────────────────────────────┐  
   │  ┌──────────┐                                            │  
   │  │Large     │  ============   (loading skeleton bars)    │  
   │  │File Icon │  ============                              │  
   │  │Tilted 10°│  "You'll be informed immediately..."       │  
   │  └──────────┘ (changing info - filename, timestamp, etc) │  
   │                                                          |
   │  [====skeleton====]                 (eye preview icon)   │ 
   └──────────────────────────────────────────────────────────┘  

   ┌──────────────────────────────────────────────────────────┐  
   │  ┌────────── ┐                                           │  
   │  │ Large     │ Artifacts filename.md       (done title)  │  
   │  │ File Icon | File/stream status metada                 │  
   │  │ Tilted 10°│                                           │  
   │  └────────── ┘                                           │  
   │                                                          │  
   │  22/05/2026 10:25                   (eye preview icon)   │  
   └──────────────────────────────────────────────────────────┘ 
```

**Key constraint (clarified during design)**: The `[Thinking completed >]` header is **not part of the card**. `ArtifactCard` renders **only the inner box**. The header is rendered by the parent (chat.svelte message loop or ToolGroup-adjacent wrapper) with its own collapsible trigger that wraps one or more ArtifactCards.

**Files**:
- Rename: `src/lib/components/ShimmerArtifactCard.svelte` → `src/lib/components/ArtifactCard.svelte`
- Modify: `src/lib/components/chat.svelte` (update import)
- Modify: `src/lib/components/workspace/ArtifactViewer.svelte` (update import)

**ArtifactCard.svelte structure**:
```svelte
<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import EyeIcon from "@lucide/svelte/icons/eye";
  import SparklesIcon from "@lucide/svelte/icons/sparkles";

  let {
    artifactId,
    status,
    title,
    filename,
    timestamp,
  }: {
    artifactId: string;
    status: "processing" | "streaming" | "success" | "error";
    title: string;
    filename?: string;
    timestamp?: string;
  } = $props();

  const dispatch = createEventDispatcher<{ "chat:openArtifact": { artifactId: string } }>();

  const isWorking = $derived(status === "processing" || status === "streaming");

  function formatTimestamp(iso: string): string {
    const d = new Date(iso);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
</script>

<div class="rounded-2xl border border-border/40 bg-card/40 backdrop-blur-md overflow-hidden">
  <div class="grid grid-cols-[auto_1fr] gap-3 p-3">
    <!-- LEFT: 96x96 thumbnail -->
    <div class="size-24 rounded-xl overflow-hidden shrink-0 relative">
      {#if isWorking}
        <div class="absolute inset-0 bg-gradient-to-br from-purple-500/60 via-blue-500/60 to-pink-500/60 animate-pulse" />
        <div class="absolute inset-0 flex items-center justify-center">
          <SparklesIcon class="size-10 text-white/90 drop-shadow" />
        </div>
      {:else}
        <div class="absolute inset-0 bg-zinc-800/80 flex flex-col gap-1 p-2">
          <div class="h-1/3 bg-zinc-700 rounded-sm" />
          <div class="flex-1 space-y-1">
            <div class="h-1.5 bg-zinc-700 rounded-sm w-3/4" />
            <div class="h-1.5 bg-zinc-700 rounded-sm w-full" />
            <div class="h-1.5 bg-zinc-700 rounded-sm w-1/2" />
          </div>
        </div>
      {/if}
    </div>

    <!-- RIGHT: content area -->
    <div class="flex flex-col justify-center min-w-0">
      {#if isWorking}
        <div class="space-y-2">
          <div class="h-3 bg-muted/40 rounded animate-pulse w-3/4" />
          <div class="h-2.5 bg-muted/30 rounded animate-pulse w-full" />
        </div>
        <p class="text-[10px] text-muted-foreground/70 mt-2 italic">
          You'll be informed immediately upon completion.
        </p>
      {:else}
        <h4 class="text-[13px] font-semibold text-foreground truncate">{title}</h4>
        {#if filename}
          <p class="text-[10px] text-muted-foreground/80 mt-0.5 truncate font-mono">{filename}</p>
        {/if}
      {/if}
    </div>
  </div>

  <!-- FOOTER -->
  <footer class="flex items-center justify-between px-3 py-2 border-t border-border/30">
    {#if isWorking}
      <div class="h-2.5 w-16 bg-muted/30 rounded animate-pulse" />
    {:else if timestamp}
      <span class="text-[10px] font-mono text-muted-foreground/70 tabular-nums">
        {formatTimestamp(timestamp)}
      </span>
    {/if}
    <button
      type="button"
      onclick={() => dispatch("chat:openArtifact", { artifactId })}
      aria-label="Preview artifact"
      class="size-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
    >
      <EyeIcon class="size-3.5" />
    </button>
  </footer>
</div>
```

**Props API (after rename)**:
```ts
type ArtifactCardProps = {
  status: "processing" | "streaming" | "success" | "error";
  title: string;
  filename?: string;
  timestamp?: string;
};
```

The `chat:openArtifact` event is dispatched via Svelte's `createEventDispatcher` (a typed dispatcher instantiated at the top of the `<script>` block) when the eye button is clicked. The parent (chat.svelte) listens for this event and routes it to the existing workspace-panel open flow. Clicking the eye button still opens the workspace panel; the dispatch simply bubbles the `artifactId` upward instead of relying on a hoisted `open` callback.

**Parent wrapper structure** (rendered by `chat.svelte`, not part of ArtifactCard):
```svelte
<Collapsible defaultOpen={true}>
  <CollapsibleTrigger class="group flex w-full items-center gap-2 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground hover:text-foreground">
    Thinking completed
    <ChevronDownIcon class="size-3 transition-transform group-data-[state=open]:rotate-0 group-data-[state-closed]:-rotate-90" />
  </CollapsibleTrigger>
  <CollapsibleContent>
    <ArtifactCard {status} {title} {filename} {timestamp} />
  </CollapsibleContent>
</Collapsible>
```

**Routing rule** — the "Thinking completed >" wrapper is rendered **only** when the message contains artifact data parts. The boolean `message.hasArtifact` is precomputed in the `$derived` block from Section 4.5:

```svelte
{#if message.hasArtifact}
  <Collapsible defaultOpen={true}>
    <CollapsibleTrigger class="group flex w-full items-center gap-2 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground hover:text-foreground">
      Thinking completed
      <ChevronDownIcon class="size-3 transition-transform group-data-[state=open]:rotate-0 group-data-[state=closed]:-rotate-90" />
    </CollapsibleTrigger>
    <CollapsibleContent>
      <ArtifactCard {status} {title} {filename} {timestamp} />
    </CollapsibleContent>
  </Collapsible>
{/if}
```

Where `message.hasArtifact` is true iff the message contains any `data-streamDocument` or `data-generatePDF` data part (see Section 4.5 `$derived` precomputation). This rule makes the wrapping deterministic: ArtifactCard is wrapped in "Thinking completed >" IFF the message has artifact data parts; otherwise no wrapper (other tool calls / text content render normally).

### 4.7 Fix F6 — Friendly error categories

**Files**:
- Modify: `src/lib/errors/friendly-ai-error.ts` — add 6 new categories
- Modify (possibly): `src/lib/components/shared/ErrorAlert.svelte` — add button for `edit_marksheet_then_retry` action

**New categories** (added to the discriminated union in `categorizeAIError`):

| Code | Title | Message | Suggested action |
|---|---|---|---|
| `AUTO_FIX_EXHAUSTED` | "Auto-fix couldn't resolve all issues" | "We've auto-corrected what we could. Review the remaining marksheet errors and edit the document, then click Validate again." | `edit_marksheet_then_retry` |
| `STUDENT_ID_MISSING` | "Which student is this marksheet for?" | "Mention the student in the chat using @studentName, or link the marksheet to a student in the workspace." | `mention_student` |
| `PERSIST_PATH_MISSING` | "Marksheet hasn't been formatted yet" | "The marksheet needs to be formatted before it can be validated. Try uploading it again or running /format." | `rerun_format` |
| `TOOL_NOT_REGISTERED` | "Workflow configuration issue" | "A required tool isn't registered with the workflow. Contact your administrator." | `contact_support` |
| `AGENT_LOOP_EXHAUSTED` | "Agent didn't reach a conclusion" | "The agent tried several approaches but couldn't resolve this in the allowed number of steps. Try rephrasing your request or breaking it into smaller parts." | `rephrase_request` |
| `BUN_PRECONDITION_FAILED` | "Server setup incomplete" | "A server-side dependency is missing. Contact your administrator." | `contact_support` |

Each category maps to a discriminated union member:
```ts
type FriendlyAIError =
  | { kind: "auto_fix_exhausted"; title: string; message: string; action: "edit_marksheet_then_retry" }
  | { kind: "student_id_missing"; title: string; message: string; action: "mention_student" }
  | { kind: "persist_path_missing"; title: string; message: string; action: "rerun_format" }
  | { kind: "tool_not_registered"; title: string; message: string; action: "contact_support" }
  | { kind: "agent_loop_exhausted"; title: string; message: string; action: "rephrase_request" }
  | { kind: "bun_precondition_failed"; title: string; message: string; action: "contact_support" }
  | /* existing variants — DO NOT duplicate. Read $lib/errors/friendly-ai-error.ts
       for the full union; existing variants cover rate limits, network errors,
       auth errors, etc. The 6 variants above are APPENDED to the existing union. */;
```

The implementation agent must read `$lib/errors/friendly-ai-error.ts` first to understand the existing pattern (discriminated union on `kind`, mapping via `categorizeAIError`, displaying via `describe()`) before adding new variants.

`ErrorAlert.svelte` automatically renders title + message + button for each `action` via the existing router pattern. Only `edit_marksheet_then_retry` may need a new button (it opens the workspace panel focused on the marksheet). The others reuse existing patterns.

---

## 5. File Impact

### 5.1 Net change

- **3 files deleted**: only `pdf-preview.svelte`; the 3 background-task files are preserved
- **1 file renamed**: `ShimmerArtifactCard.svelte` → `ArtifactCard.svelte`
- **1 file created**: `src/lib/components/chat/ToolGroup.svelte` (~50 lines)
- **~8 files modified**

### 5.2 Full list

| Status | Path | Reason |
|---|---|---|
| DELETE | `src/lib/components/pdf-preview.svelte` | F1 — workspace panel handles PDFs |
| RENAME | `src/lib/components/ShimmerArtifactCard.svelte` → `src/lib/components/ArtifactCard.svelte` | F5 — broader role than shimmer-only |
| CREATE | `src/lib/components/chat/ToolGroup.svelte` | F4 — collapsible wrapper for tool calls |
| MODIFY | `src/lib/components/chat.svelte` | F1 (remove import + render), F4 (wire ToolGroup), F5 (update ArtifactCard import) |
| MODIFY | `src/lib/components/chat-header.svelte` | F2 (replace ActivityPopover with ContextUsageIndicator + TODO) |
| MODIFY | `src/lib/components/ChatComposer.svelte` | F2 (remove ContextUsageIndicator from action tray) |
| MODIFY | `src/lib/components/tool-message.svelte` | F4 + F4b copy icon (strip outer wrapper, add clipboard button to raw JSON) |
| MODIFY | `src/lib/components/workspace/ArtifactViewer.svelte` | F5 (update ArtifactCard import) |
| MODIFY | `src/routes/+layout.svelte` | F3 (Toaster position) |
| MODIFY | `src/lib/errors/friendly-ai-error.ts` | F6 (6 new categories) |
| MODIFY (maybe) | `src/lib/components/shared/ErrorAlert.svelte` | F6 (button for `edit_marksheet_then_retry`) |
| PRESERVE | `src/lib/components/activity-popover.svelte` | F2 — kept for future re-enablement |
| PRESERVE | `src/lib/state/background-tasks.svelte` | F2 — kept for future re-enablement |
| PRESERVE | `src/lib/types/background-tasks.ts` | F2 — kept for future re-enablement |

**Net file count**: -2 (delete 1, create 1, rename is net 0)

### 5.3 Verification commands

```bash
# After each fix:
pnpm run svelte-check --workspace src/lib/components/chat.svelte
pnpm run svelte-check --workspace src/lib/components/chat-header.svelte
pnpm run svelte-check --workspace src/lib/components/ChatComposer.svelte
pnpm run svelte-check --workspace src/lib/components/chat/ToolGroup.svelte
pnpm run svelte-check --workspace src/lib/components/tool-message.svelte
pnpm run svelte-check --workspace src/lib/components/ArtifactCard.svelte
pnpm run svelte-check --workspace src/lib/components/workspace/ArtifactViewer.svelte
pnpm run svelte-check --workspace src/routes/+layout.svelte
pnpm run lint src/lib/errors/friendly-ai-error.ts
pnpm run lint src/lib/components/shared/ErrorAlert.svelte

# Final:
pnpm run check
# Expected: still 68 errors and 22 warnings (no new errors introduced)

# Confirm pdf-preview is fully removed:
grep -rn "pdf-preview" src/ || echo "OK: no references"

# Confirm ShimmerArtifactCard is fully renamed:
grep -rn "ShimmerArtifactCard" src/ || echo "OK: no references"

# Confirm activity files are preserved:
ls -la src/lib/components/activity-popover.svelte src/lib/state/background-tasks.svelte src/lib/types/background-tasks.ts
```

---

## 6. Implementation Order

Each fix is independent and can land in its own commit. Recommended order (smallest blast radius first):

| Order | Fix | Commit | Why this order |
|---|---|---|---|
| 1 | F3 — Toaster position | `chore(ui): move toaster to bottom-left` | Single attribute change; lowest risk |
| 2 | F1 — Remove pdf-preview | `refactor(chat): remove pdf-preview.svelte (workspace handles PDFs)` | Single file deletion + 2-line removal in chat.svelte |
| 3 | F2 — Hide activity + move token usage | `refactor(chat-header): swap ActivityPopover for ContextUsageIndicator` | Touches chat-header and ChatComposer; preserves all files |
| 4 | F5 — ArtifactCard rename + redesign | `refactor(chat): rename ShimmerArtifactCard → ArtifactCard and redesign per static/artifact reference` | Visual change; isolated to card + 2 import sites |
| 5 | F6 — Friendly error categories | `feat(errors): add 6 friendly categories for new agentic workflow errors` | Pure additive change in friendly-ai-error.ts |
| 6 | F4 — ToolGroup wrapper | `feat(chat): render tool calls via ToolGroup collapsible wrapper` | Highest complexity; wires the orphaned tool-message.svelte |
| 6a | F4b — Tool result copy icon | folded into F4 commit (no separate commit) | Same file (`tool-message.svelte`) and trivial change; agent should ship in the F4 commit to avoid a follow-up touching the same file. |

Each commit ends with the trailer:
```
Co-Authored-By: Kimchi <noreply@kimchi.dev>
```

---

## 7. Risk Analysis

| Risk | Mitigation |
|---|---|
| **F4 — ToolGroup breaks existing tool rendering**: `tool-message.svelte` has implicit assumptions about its outer wrapper. Stripping it could break internal layout. | Verify with `pnpm run svelte-check` after refactor; manual smoke test on a known tool call (e.g., `choose-document`); visual diff via screenshot before/after |
| **F5 — ArtifactCard visual regression**: The redesign is a complete rewrite; users may notice visual change. | Reference images are in `static/artifact/`; design matches user-provided wireframes exactly. Smoke test by triggering `data-streamDocument` and `data-generatePDF` in a local dev session. |
| **F2 — ActivityPopover hidden breaks background-tasks state**: Other code may depend on the state store even without the popover. | Audit all imports of `background-tasks.svelte` and `background-tasks.ts` before hiding. If anything else imports them, the TODO comment must reference that. |
| **F6 — `categorizeAIError` is exhaustive**: Adding 6 new categories could break existing `switch` statements that rely on exhaustiveness. | Audit all consumers of `categorizeAIError` and `describe()` before adding. Add new variants as the **last** union members and update any `switch` accordingly. |
| **F1 — Embedding a PDF in workspace requires persistence path**: If a PDF was generated but never persisted to libSQL, the workspace can't render it. | Out of scope for this spec. EmbedPDF already handles the rendering path; only the chat-side modal is removed. If the PDF was visible in the modal before, it was also visible in the workspace. |

---

## 8. Verification Checklist

After all 6 fixes land:

- [ ] `pnpm run check` reports **68 errors / 22 warnings** (same as baseline; zero new errors)
- [ ] `grep -rn "pdf-preview" src/` returns nothing
- [ ] `grep -rn "ShimmerArtifactCard" src/` returns nothing
- [ ] `ls -la src/lib/components/activity-popover.svelte` succeeds (file preserved)
- [ ] `ls -la src/lib/state/background-tasks.svelte` succeeds (file preserved)
- [ ] `ls -la src/lib/types/background-tasks.ts` succeeds (file preserved)
- [ ] Manual smoke: trigger `data-streamDocument` part → ArtifactCard appears with gradient skeleton + sparkle icon, status text "You'll be informed immediately upon completion."
- [ ] Manual smoke: stream completes → ArtifactCard swaps to dark gray document mock + populated title + timestamp; eye icon opens workspace panel
- [ ] Manual smoke: trigger `tool-choose-document` call → ToolGroup renders "Tools (1)" with the tool's input/output expandable
- [ ] Manual smoke: multiple tool calls in one message → ToolGroup shows "Tools (N)" with all expanded by default
- [ ] Manual smoke: trigger `AUTO_FIX_EXHAUSTED` error → ErrorAlert shows the new friendly title + message + "Edit marksheet" button
- [ ] Manual smoke: open chat header → ContextUsageIndicator appears (not ActivityPopover)
- [ ] Manual smoke: trigger a system toast (e.g., rate limit) → appears at bottom-left, not bottom-center
- [ ] Manual smoke: workspace panel still renders PDFs correctly via embedPDF (no regression)

---

## 9. Out of Scope (deferred items)

These items were considered and explicitly excluded from this spec:

1. **Fixing the 68 pre-existing type errors** — separate scope; deferred per prior session agreement
2. **Deleting legacy `src/lib/server/mastra/workflows/chat.ts`** — frozen reference; session-end task
3. **Iteration breadcrumbs with counts** — would require new state tracking; minimal shimmer is sufficient
4. **Conversation checkpointing** — no libSQL snapshot infra; too invasive
5. **Plan mode hint** — requires LLM feature; not UI-only
6. **Background tasks feature** — feature not supported; files kept with TODO for future
7. **Toast pattern changes** — only position changes; existing toast types and call sites untouched
8. **Animation library swap** — CSS-only; no new deps
9. **Streaming shimmer for thinking block** — current `Reasoning` component already handles this
10. **Mobile-specific layout for ArtifactCard** — current design works on mobile; dedicated mobile variant deferred

---

## 10. References

### Backend refactor (commit history)

The data-* persistence and HITL extensions (top of the table) are still the load-bearing changes this UI work exposes. The workflow-level agentic-loop commits at the bottom were reverted — the AI SDK's native `maxSteps: 30` now drives the loop inside `assistantStep` and `continuationAssistantStep`.

| Commit | Subject | Status |
|---|---|---|
| `136b70a` | feat(workflow): persist data-awaitValidation via writeDataPart | Kept |
| `062ab16` | feat(workflow): persist data-selectOption via writeDataPart | Kept |
| `044ea69` | feat(workflow): persist disambiguation parts via writeDataPart | Kept |
| `564ea1a` | feat(workflow): persist committed part via writeDataPart | Kept |
| `db26991` | feat(workflow): emit pdf/notification/selectOption via writeDataPart | Kept |
| `50d5051` | feat(workflow): rate-limit transient via writeDataPart | Kept |
| `fd7cd37` | feat(workflow): extend awaitValidationStep schema (dropdownOptionId + cancel) | Kept |
| `59c3f9e` | feat(workflow): validate-marksheet auto-fix retry cap + permissionGrant | Kept |
| `c0150b9` | feat(workflow): server-side /api/chat/cancel endpoint | Kept |
| `67c4c93` | feat(workflow): agentLoopOutputSchema + AGENT_LOOP_MAX_ITERATIONS=8 | Reverted in `32dced1` |
| `698c61a` | feat(workflow): agentLoopStep with maxSteps=1 | Reverted in `32dced1` |
| `db71cf4` | feat(workflow): passthroughStep terminal no-op | Reverted in `32dced1` |
| `797d498` | refactor(workflow): replace linear chain with .dountil() + .branch() | Reverted in `32dced1` |
| `dcc4431` | chore(workflow): delete assistant-step + continuation-assistant-step | Undone by `32dced1` (assistant-step + continuation-assistant-step restored) |
| `32dced1` | revert(workflow): restore the legacy assistantStep linear chain (maxSteps: 30) | Current state — see header note |

### Key file paths

| Path | Role |
|---|---|
| `src/lib/components/chat.svelte` | Main chat orchestrator (modified) |
| `src/lib/components/chat-header.svelte` | Global controls (modified — F2) |
| `src/lib/components/ChatComposer.svelte` | Input + send (modified — F2) |
| `src/lib/components/chat/ToolGroup.svelte` | NEW — F4 wrapper |
| `src/lib/components/tool-message.svelte` | Per-tool renderer (modified — F4) |
| `src/lib/components/ArtifactCard.svelte` | RENAMED from ShimmerArtifactCard — F5 |
| `src/lib/components/workspace/ArtifactViewer.svelte` | Workspace renderer (modified — F5 import) |
| `src/lib/components/workspace/editor-canvas.svelte` | embedPDF integration (unchanged) |
| `src/lib/components/shared/ErrorAlert.svelte` | Friendly error display (modified — F6) |
| `src/lib/errors/friendly-ai-error.ts` | Error categorization (modified — F6) |
| `src/lib/components/pdf-preview.svelte` | DELETED — F1 |
| `src/lib/components/activity-popover.svelte` | PRESERVED — F2 |
| `src/lib/state/background-tasks.svelte` | PRESERVED — F2 |
| `src/lib/types/background-tasks.ts` | PRESERVED — F2 |
| `src/lib/context/chat-context.svelte.ts` | `pendingGate`, `pendingAwaitingValidation`, `resumeWorkflow`, `cancelValidation` (unchanged) |
| `src/lib/server/mastra/workflows/index.ts` | Workflow chain (unchanged — already agentic loop) |
| `src/lib/server/mastra/workflows/chat/await-validation-step.ts` | HITL gate (unchanged — UI consumes via persisted data parts) |
| `src/lib/server/mastra/workflows/chat/agent-loop-step.ts` | Per-iteration agent (unchanged — UI consumes via tool-* parts) |
| `src/lib/server/mastra/workflows/chat/passthrough-step.ts` | Terminal no-op (unchanged) |
| `src/routes/api/chat/cancel/+server.ts` | Server-side cancel (unchanged) |
| `src/routes/+layout.svelte` | Toaster mount (modified — F3) |
| `static/artifact/artifact-loading.png` | Reference design — loading state (unchanged) |
| `static/artifact/artifact-done.png` | Reference design — done state (unchanged) |
| `docs/ARCHITECTURE.md` | High-level architecture (unchanged) |
| `docs/action-bar.md` | ActionBar API spec (unchanged — consumed by this redesign) |
| `docs/responsive_design.md` | Responsive guidelines (unchanged — this redesign adheres) |

### Prior session artifacts

- `docs/superpowers/plans/2026-07-08-workflow-hitl-loop-refactor.md` — the original backend plan
- `composer_wireframe.md` — composer wireframe (already shipped; this redesign complements it)
