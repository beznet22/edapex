# Chat Agentic UI Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan chunk-by-chunk. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Source spec:** `.superpowers/specs/2026-07-08-chat-agentic-ui-redesign.md` (read it first; this plan references its sections rather than duplicating them).

> **Companion artifacts:** `.superpowers/plans/2026-07-08-chat-agentic-ui-wireframe.md` (visual lifecycle) and `.superpowers/plans/2026-07-08-chat-agentic-ui-checklist.md` (living checklist — updated as each chunk lands).

**Goal:** Reshape the chat surface in `src/lib/components/` so users can actually see what the new agentic workflow does — render `tool-*` parts, swap the under-spec ShimmerArtifactCard for a redesigned ArtifactCard, expose the new agentic error surface, and relocate scattered controls — while shrinking the component graph by two files.

**Architecture:** Each fix is independent and lands as its own commit. Order is smallest-blast-radius first (single-attribute → single-file deletion → header swap → card rewrite → additive error union → wrapper wire-up). The wrapper for tool calls (`chat/ToolGroup.svelte`) is the highest-complexity change and lands last; it depends on the prior commits being merged so a partial migration never renders broken state.

**Tech Stack:** Svelte 5 (runes + snippets), TypeScript (strict), Tailwind v4 + `oklch` design tokens from `src/routes/layout.css`, AI SDK UI Message parts (`xUIMessagePart`), shadcn-svelte primitives (`Collapsible`, `Button`, `Alert`), `@lucide/svelte` icons, `svelte-sonner` toasts, libSQL-persisted `data-*` parts via existing `useChat` flow.

**Execution mode:** Subagent-driven (one Builder subagent per chunk with two-stage review). One PR, six ordered commits on a feature branch off `main`. Each commit ends with `Co-Authored-By: Kimchi <noreply@kimchi.dev>`.

**Baseline state (recorded 2026-07-09 in worktree at `~/.config/superpowers/worktrees/edapex/feat-chat-agentic-ui-redesign`, baseline SHA `67fa5f3f0fe16062fcd14529a6852b4b1306cb25`):** **99 type errors and 22 warnings across 37 files** (`pnpm run check`). Pre-existing, out of scope, frozen at this number. The spec claimed a baseline of 68 errors / 33 files; actual baseline is 31 errors higher across 4 more files because main HEAD = `67fa5f3` ("feat: add Platform settings tab…") was committed after the spec was written and added files with new type errors. The constraint updates to "zero NEW errors introduced beyond this 99-error baseline."

---

## Goal (one sentence)

Land the six UI fixes from spec section 3.1 so the chat surface exposes the new agentic workflow's `tool-*` parts, persists HITL signals, surfaces a friendly error surface, and moves scattered controls into a coherent header — without introducing new type errors and without adding new dependencies.

## Constraints

1. **No new dependencies.** Use only what's already in `package.json` (verified: `@lucide/svelte`, `svelte-sonner`, shadcn-svelte primitives, `tailwind-variants`, AI SDK types).
2. **Zero new type errors.** Final `pnpm run check` must still report 99 errors / 22 warnings (the recorded baseline). Every modified file must pass `pnpm run svelte-check --workspace <path>` individually. Any new errors introduced by a chunk must be fixed before the chunk's commit lands.
3. **Preserve activity files.** `activity-popover.svelte`, `state/background-tasks.svelte.ts`, `types/background-tasks.ts` stay on disk with TODO breadcrumbs; only their mount in `chat-header.svelte` is replaced.
4. **Reuse existing primitives.** `Collapsible`, `Button`, `Alert`, `Toast`, lucide icons. Do not introduce new shadcn components.
5. **Append-only on the error union.** F6 adds 6 new variants to `FriendlyAiError`; existing variants stay. Any `switch (err.kind)` consumers must be updated to remain exhaustive.
6. **CSS-only animations.** No new animation libraries; shimmer uses existing `ai-elements/shimmer` primitive.
7. **Adhere to `src/routes/layout.css`.** No new colors outside the `oklch` token set.
8. **Adhere to `docs/responsive_design.md`.** New components must render acceptably at mobile widths (verified manually; no dedicated mobile variant).
9. **No-op on backend.** This plan is UI-only. Backend workflow chain, HITL steps, and libSQL persistence are untouched.
10. **Net file count: −2.** Delete 1 (pdf-preview.svelte), create 1 (chat/ToolGroup.svelte), rename is net 0.

---

## Chunks

Chunks are ordered by blast radius. Each lands as one commit on the feature branch.

---

### Chunk 1 — Toaster position (spec §4.4, fix F3)

**Scope**: Move the global toast mount from `bottom-center` to `bottom-left` per design language.

**Files Changed**:
- Modify: `src/routes/+layout.svelte` — change `position="bottom-center"` → `position="bottom-left"` (line 48).

**Depends On**: nothing.

**Accept When**:
- `grep -n 'Toaster' src/routes/+layout.svelte` shows `position="bottom-left"`.
- `pnpm run svelte-check --workspace src/routes/+layout.svelte` reports zero new errors.
- Manual: trigger any toast in dev (e.g., rate-limit) and visually confirm lower-left placement.

**Test Coverage**: smoke only (no automated UI test exists for layout placement).

**Open Questions**: none.

**Commit**:
```
chore(ui): move toaster to bottom-left

Co-Authored-By: Kimchi <noreply@kimchi.dev>
```

---

### Chunk 2 — Delete pdf-preview modal (spec §4.2, fix F1)

**Scope**: Remove the redundant `<PreviewModal />` mount in `chat.svelte` and delete `pdf-preview.svelte`. Workspace panel already renders PDFs via embedPDF.

**Files Changed**:
- Delete: `src/lib/components/pdf-preview.svelte`
- Modify: `src/lib/components/chat.svelte`
  - Remove line 21: `import PreviewModal from "./pdf-preview.svelte";`
  - Remove line 365: `<PreviewModal />`

**Depends On**: Chunk 1 (so toaster fix is already merged; no risk of unrelated diffs).

**Accept When**:
- `grep -rn 'pdf-preview' src/` returns nothing.
- `ls src/lib/components/pdf-preview.svelte` fails (file deleted).
- `pnpm run svelte-check --workspace src/lib/components/chat.svelte` reports zero new errors.
- Manual: open workspace panel on a PDF artifact → embedPDF renders correctly. No regression.

**Test Coverage**: smoke only.

**Open Questions**: none.

**Commit**:
```
refactor(chat): remove pdf-preview.svelte (workspace handles PDFs)

Co-Authored-By: Kimchi <noreply@kimchi.dev>
```

---

### Chunk 3 — Hide activity icon, move ContextUsageIndicator to header (spec §4.3, fix F2)

**Scope**: Replace `<ActivityPopover />` in `chat-header.svelte` with `<ContextUsageIndicator />`; remove the same component from `ChatComposer.svelte`'s action tray. Preserve all three background-task files for future re-enablement.

**Files Changed**:
- Modify: `src/lib/components/chat-header.svelte`
  - Add import: `import ContextUsageIndicator from "$lib/components/ContextUsageIndicator.svelte";`
  - Remove import: `import ActivityPopover from "$lib/components/activity-popover.svelte";`
  - Replace the `<ActivityPopover />` mount (line 34) with the new indicator + TODO comment.
- Modify: `src/lib/components/ChatComposer.svelte`
  - Remove the `{#if currentModel} <ContextUsageIndicator ... /> {/if}` block (around line 1137–1139).
  - Keep the `currentModel` reference if it's used elsewhere in the file; remove only the indicator mount + its closing brace.

**Model state wiring** (the spec's pseudocode uses `selectedChatModelId` and `currentModelLimit`; the actual chat-context names are different — see Decision Log entry D2):
- The new mount in `chat-header.svelte` must source props the same way `ChatComposer.svelte` did. Read `src/lib/components/ChatComposer.svelte` lines around 1137 to confirm the exact `currentModel.id` / `maxContext` derivation before writing the header.
- The header currently has no `currentModel` / `maxContext` reference. Either (a) add a `$derived` over the chat context, mirroring composer's pattern, or (b) accept props from a parent. **Default: option (a)** — replicate the composer's `$derived` shape inside `chat-header.svelte` so the header is self-sufficient.

```svelte
<!-- TODO(background-tasks): Re-enable <ActivityPopover /> here when
     background-task feature ships (OCR worker, etc). Files to revisit:
     src/lib/components/activity-popover.svelte
     src/lib/state/background-tasks.svelte.ts
     src/lib/types/background-tasks.ts
     Note: state store and types remain consumed by routes/(chat)/filestore,
     lib/workers/task-worker, lib/server/service/ocr-batch,
     routes/api/file/[...path] — they are not orphaned. -->
<ContextUsageIndicator
  modelId={currentModel.id}
  maxTokens={maxContext}
/>
```

**Depends On**: Chunk 2 (chat.svelte changes already merged).

**Accept When**:
- `grep -n 'ActivityPopover' src/lib/components/chat-header.svelte` returns nothing.
- `grep -n 'ContextUsageIndicator' src/lib/components/ChatComposer.svelte` returns nothing.
- `ls src/lib/components/activity-popover.svelte src/lib/state/background-tasks.svelte.ts src/lib/types/background-tasks.ts` all succeed (files preserved).
- `pnpm run svelte-check --workspace src/lib/components/chat-header.svelte` and `--workspace src/lib/components/ChatComposer.svelte` both report zero new errors.
- Manual: open chat → header shows `ContextUsageIndicator`, no activity icon. Open `/filestore` → no console error from missing import (the store is still imported there).

**Test Coverage**: smoke only.

**Open Questions**: OQ-C3-1 — see Decision Log D2 for the prop-source resolution. Implementation should read `ChatComposer.svelte` first.

**Commit**:
```
refactor(chat-header): swap ActivityPopover for ContextUsageIndicator

Co-Authored-By: Kimchi <noreply@kimchi.dev>
```

---

### Chunk 4 — Rename ShimmerArtifactCard → ArtifactCard + redesign (spec §4.6, fix F5)

**Scope**: Rewrite the artifact card to match `static/artifact/artifact-{loading,done}.png`. Rename the file. The "Thinking completed >" wrapper stays out of the card (per spec 4.6 design constraint — rendered by parent in chat.svelte).

**Files Changed**:
- Rename: `src/lib/components/ShimmerArtifactCard.svelte` → `src/lib/components/ArtifactCard.svelte`
  - Replace the entire file with the redesigned implementation. Use the spec §4.6 code block as the source of truth. Props API:
    ```ts
    type ArtifactCardProps = {
      status: "processing" | "streaming" | "success" | "error";
      title: string;
      filename?: string;
      timestamp?: string;
    };
    ```
  - Dispatch `chat:openArtifact` event (not `window.dispatchEvent` like the old card). Use Svelte 5 typed dispatcher via `createEventDispatcher<{ "chat:openArtifact": { artifactId: string } }>()`.
- Modify: `src/lib/components/chat.svelte`
  - Replace `import ShimmerArtifactCard from "./ShimmerArtifactCard.svelte";` with `import ArtifactCard from "./ArtifactCard.svelte";`
  - Find the `<ShimmerArtifactCard ...>` mount (around line 298). Adapt the props: `id` → `artifactId`, `title` stays, `status` stays, drop `content`, drop `kind`, and read `filename` / `timestamp` from the message part / stream metadata. **The new card does not display byte count or `kind`-based icon; it only shows the gradient+sparkle (loading) or dark gray document mock + title + filename + timestamp (done) + eye icon.**
  - Update the event listener: add `onchat:openArtifact={(e) => openArtifactInWorkspace(e.detail.artifactId)}` (or wire to the existing workspace open path that the old `window` listener triggered — see Decision Log D3).
- Modify: `src/lib/components/workspace/ArtifactViewer.svelte`
  - Replace `import ShimmerArtifactCard from "$lib/components/ShimmerArtifactCard.svelte";` with `import ArtifactCard from "$lib/components/ArtifactCard.svelte";`
  - Update any JSX-style `<ShimmerArtifactCard>` mounts to `<ArtifactCard>` with the new prop names.

**Depends On**: Chunk 3 (header changes already merged).

**Accept When**:
- `grep -rn 'ShimmerArtifactCard' src/` returns nothing.
- `ls src/lib/components/ArtifactCard.svelte` succeeds; `ls src/lib/components/ShimmerArtifactCard.svelte` fails.
- `pnpm run svelte-check` on `chat.svelte`, `ArtifactCard.svelte`, `ArtifactViewer.svelte` reports zero new errors.
- Manual: trigger `data-streamDocument` and `data-generatePDF` parts in a dev session.
  - Loading state: gradient + sparkle icon + "You'll be informed immediately upon completion." text.
  - Done state: dark gray document mock + title + filename + timestamp; eye icon button dispatches `chat:openArtifact`.
- Manual: clicking the eye icon opens the workspace panel on the artifact (same as before).

**Test Coverage**: smoke only.

**Open Questions**:
- OQ-C4-1: Where does `chat.svelte` currently route `chat:openArtifact`? The old card used `window.dispatchEvent(new CustomEvent("chat:openArtifact", { detail: { ... } }))`. The new card uses `createEventDispatcher`. **Implementation must grep for `chat:openArtifact` listeners and update them to receive the typed Svelte event** (or fall back to `window.dispatchEvent` if external listeners still depend on it). See Decision Log D3.

**Commit**:
```
refactor(chat): rename ShimmerArtifactCard → ArtifactCard and redesign per static/artifact reference

Co-Authored-By: Kimchi <noreply@kimchi.dev>
```

---

### Chunk 5 — Add 6 friendly error categories (spec §4.7, fix F6)

**Scope**: Extend `categorizeAIError` to recognize the 6 new error codes the agent loop can emit, and update `describe()` for each. Possibly add one button to `ErrorAlert.svelte` for the new `edit_marksheet_then_retry` action.

**Files Changed**:
- Modify: `src/lib/errors/friendly-ai-error.ts`
  - Extend `FriendlyAction` union with 4 new actions:
    ```ts
    | 'edit_marksheet_then_retry'
    | 'mention_student'
    | 'rerun_format'
    | 'rephrase_request'
    ```
  - Append 6 new variants to `FriendlyAiError` (per spec §4.7 union members). Order: append at the **end** to minimize risk to existing `switch` exhaustiveness.
  - Append 6 new `case` blocks to `categorizeAIError` that match on error code/message patterns:
    - `AUTO_FIX_EXHAUSTED`: look for `Auto-fix exhausted` or `auto_fix_exhausted` in error message.
    - `STUDENT_ID_MISSING`: look for `student id missing` or `STUDENT_ID_MISSING`.
    - `PERSIST_PATH_MISSING`: look for `persist path missing` or `PERSIST_PATH_MISSING`.
    - `TOOL_NOT_REGISTERED`: look for `tool not registered` or `TOOL_NOT_REGISTERED`.
    - `AGENT_LOOP_EXHAUSTED`: look for `agent loop exhausted` or `AGENT_LOOP_EXHAUSTED`.
    - `BUN_PRECONDITION_FAILED`: look for `bun precondition` or `BUN_PRECONDITION_FAILED`.
  - Append 6 new `case` blocks to `describe()` mapping to the titles / messages / actions in spec §4.7.
- Modify: `src/lib/components/shared/ErrorAlert.svelte`
  - Add 4 new branches to the `presentation.action` switch inside `onAction`:
    - `edit_marksheet_then_retry` → call `goto('/workspace')` (or open the workspace panel focused on the marksheet — implementation must verify exact path).
    - `mention_student` → focus the chat input (call a chat context method or `document.querySelector('textarea')?.focus()`).
    - `rerun_format` → no-op for now; show "Format pending — feature coming soon" toast.
    - `rephrase_request` → focus the chat input.
  - Add button labels to the existing button-render `{#if/:else if}` chain: "Edit marksheet", "Mention a student", "Run /format", "Rephrase".
  - **Audit call site** before editing: confirm `categorizeAIError` is only called from `ErrorAlert.svelte` and the workflow's `parseFriendlyError` (if any). Other consumers must be updated to remain exhaustive.

**Depends On**: Chunk 4 (file-rename already merged).

**Accept When**:
- `pnpm run lint src/lib/errors/friendly-ai-error.ts` reports zero errors.
- `pnpm run svelte-check --workspace src/lib/components/shared/ErrorAlert.svelte` reports zero new errors.
- `pnpm run check` baseline still 68 errors / 22 warnings (no regression).
- Manual smoke per spec §8 verification checklist for `AUTO_FIX_EXHAUSTED`.

**Test Coverage**: smoke only (per user choice in interview).

**Open Questions**:
- OQ-C5-1: Exact matching strings for the 6 error codes. The spec doesn't show the server-side error throws. **Implementation must grep the workflow code (`src/lib/server/mastra/workflows/chat/*.ts`) for the error messages emitted** before writing the regex patterns. See Decision Log D4.

**Commit**:
```
feat(errors): add 6 friendly categories for new agentic workflow errors

Co-Authored-By: Kimchi <noreply@kimchi.dev>
```

---

### Chunk 6 — ToolGroup wrapper + tool copy icon (spec §4.5, fixes F4 + F4b)

**Scope**: Wire the orphaned `tool-message.svelte` so `tool-*` parts render under a "Tools (N)" collapsible group. Add copy-to-clipboard button to the raw JSON view inside `tool-message.svelte`.

**Files Changed**:
- Create: `src/lib/components/chat/ToolGroup.svelte` (~50 lines). Use the spec §4.5 code block as the source of truth. Props: `{ parts: xUIMessagePart[] }`. Filter internally for `part.type.startsWith("tool-")` for safety; the chat.svelte wrapper passes the precomputed `toolParts` so this is a defensive check.
- Modify: `src/lib/components/tool-message.svelte`
  - **F4**: Remove the outer `<div class="max-w-2xl space-y-6">` wrapper (final lines of the file). Keep all inner state machine logic, snippets, structured fields, and collapsible raw JSON.
  - **F4b**: Import `CopyIcon` from `@lucide/svelte/icons/copy` and `toast` from `svelte-sonner`. In the `defaultTool` snippet's existing `<Collapsible>` raw JSON section, add a copy button next to the "View raw output" trigger label:
    ```svelte
    <Collapsible class="rounded-md border">
      <CollapsibleTrigger
        class="text-muted-foreground hover:text-foreground flex w-full items-center justify-between px-3 py-2 text-xs font-medium"
      >
        <span>View raw output</span>
        <div class="flex items-center gap-2">
          <button
            type="button"
            onclick={(e) => {
              e.stopPropagation();
              navigator.clipboard.writeText(JSON.stringify(output, null, 2))
                .then(() => toast.success("Copied!"))
                .catch(() => toast.error("Could not copy to clipboard"));
            }}
            aria-label="Copy raw output"
            class="size-5 rounded-sm flex items-center justify-center hover:bg-muted/40 transition-colors"
          >
            <CopyIcon class="size-3" />
          </button>
          <ChevronDownIcon class="size-3.5 transition-transform group-data-[state=open]:rotate-180" />
          <!-- or use the existing trigger chevron pattern -->
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ToolOutput output={JSON.stringify(output, null, 2)} />
      </CollapsibleContent>
    </Collapsible>
    ```
    **Implementation note**: Implementation must match the existing button-styling pattern in `tool-message.svelte` and import any icon not already imported (e.g., `ChevronDownIcon` if not present).
- Modify: `src/lib/components/chat.svelte`
  - Add import: `import ToolGroup from "./chat/ToolGroup.svelte";`
  - Add a `$derived` block at the script level (per spec §4.5):
    ```ts
    const messagesWithToolSplit = $derived(
      chat.messages.map((m) => ({
        ...m,
        toolParts: m.parts.filter((p) => p.type.startsWith("tool-")),
        nonToolParts: m.parts.filter((p) => !p.type.startsWith("tool-")),
        hasArtifact: m.parts.some(
          (p) => p.type === "data-streamDocument" || p.type === "data-generatePDF",
        ),
      })),
    );
    ```
  - Replace the `{#each chat.messages as message, index}` loop with `{#each messagesWithToolSplit as message}` and use `{@const}` aliases inside the body for `toolParts`, `nonToolParts`, `hasArtifact` (per spec §4.5).
  - Render `<ToolGroup parts={toolParts} />` when `toolParts.length > 0`.
  - For F5 integration: wrap `<ArtifactCard>` in the "Thinking completed >" collapsible **only when** `message.hasArtifact` is true (per spec §4.6 routing rule). Implementation must lift the existing `inlineDocumentStreams` rendering into this conditional wrapper.

**Depends On**: Chunk 5 (errors handled gracefully in case tool calls throw).

**Accept When**:
- New file exists: `src/lib/components/chat/ToolGroup.svelte`.
- `pnpm run svelte-check --workspace src/lib/components/chat/ToolGroup.svelte`, `--workspace src/lib/components/tool-message.svelte`, `--workspace src/lib/components/chat.svelte` all report zero new errors.
- `pnpm run check` baseline still 68 errors / 22 warnings.
- Manual smoke per spec §8:
  - Trigger `tool-choose-document` → ToolGroup renders "Tools (1)" with tool input/output expandable.
  - Multiple tool calls in one message → ToolGroup shows "Tools (N)" with all expanded.
  - Raw JSON collapsible in `tool-message.svelte` shows copy icon; clicking copies `JSON.stringify(output, null, 2)` to clipboard; toast confirms.
  - `data-streamDocument` part → ArtifactCard wrapped in "Thinking completed >" collapsible.

**Test Coverage**: smoke only.

**Open Questions**:
- OQ-C6-1: The `inlineDocumentStreams` rendering and the new `hasArtifact` rule may overlap. Implementation must reconcile so each `tool-streamDocument` results in exactly one `ArtifactCard` (no duplicates). See Decision Log D5.

**Commit**:
```
feat(chat): render tool calls via ToolGroup collapsible wrapper

Co-Authored-By: Kimchi <noreply@kimchi.dev>
```

---

## Verification Strategy

### Per-chunk (during execution)
Each chunk runs the file-scoped svelte-check command for every file it touches:

```bash
pnpm run svelte-check --workspace <touched-file>
pnpm run lint <touched-ts-file>  # if applicable
```

Each chunk ends with a manual smoke test against the chunk's `Accept When` bullets before committing.

### Full-branch (before PR open)
After all 6 commits land on the feature branch:

```bash
# 1. Baseline preserved
pnpm run check
# Expected: 99 errors and 22 warnings across 37 files (no new errors beyond the recorded baseline)

# 2. Grep checks
grep -rn "pdf-preview" src/ || echo "OK: no references"
grep -rn "ShimmerArtifactCard" src/ || echo "OK: no references"

# 3. Files preserved
ls -la src/lib/components/activity-popover.svelte
ls -la src/lib/state/background-tasks.svelte.ts
ls -la src/lib/types/background-tasks.ts
# All three must succeed

# 4. New file exists
ls -la src/lib/components/chat/ToolGroup.svelte

# 5. Renamed file present
ls -la src/lib/components/ArtifactCard.svelte
ls src/lib/components/ShimmerArtifactCard.svelte 2>&1  # should fail
```

### Manual smoke (post-merge to staging-equivalent)
Per spec section 8 checklist (live checklist file: `.superpowers/plans/2026-07-08-chat-agentic-ui-checklist.md`).

---

## Decision Log

### D1 — Subagent-driven execution
**User choice**. Implementation runs via subagent-driven-development: one Builder subagent per chunk, two-stage review per chunk (spec compliance, then code quality). Rationale: cleaner context isolation per chunk, faster iteration. Controller (this session) coordinates; subagents implement.

### D2 — F2 prop-source resolution
**Spec says** `selectedChatModelId` / `currentModelLimit` from chat context. **Actual code** (per `ChatComposer.svelte` line 1137–1139) uses `currentModel.id` / `maxContext` (locally `$derived` over the chat context). Implementation must replicate the composer's pattern inside `chat-header.svelte` rather than introducing new context selectors. Read `ChatComposer.svelte` lines 1120–1145 first to confirm the exact `$derived` shape and any helpers imported.

### D3 — F5 event dispatch: `window` vs `createEventDispatcher`
The old `ShimmerArtifactCard` used `window.dispatchEvent(new CustomEvent("chat:openArtifact", { detail: ... }))`. The spec §4.6 redesign uses Svelte 5 `createEventDispatcher<{ "chat:openArtifact": { artifactId: string } }>()`. **Resolution:** Implementation must grep for `chat:openArtifact` listeners (likely in `chat.svelte` and possibly `workspace/`):
- If listeners are inside Svelte components, switch to the typed event.
- If listeners are outside the Svelte tree (e.g., `window.addEventListener`), keep the `window` dispatch as a fallback OR convert to a callback prop. **Default: use `createEventDispatcher` for in-Svelte listeners; preserve `window` dispatch as a fallback only if non-Svelte listeners exist.** Open Question OQ-C4-1 must be resolved before committing.

### D4 — F6 error code matching patterns
Spec §4.7 shows variant names (`AUTO_FIX_EXHAUSTED`, etc.) but not the exact error strings the workflow emits. **Resolution:** Implementation must `grep -rn` the workflow source for the strings:
```
src/lib/server/mastra/workflows/chat/await-validation-step.ts
src/lib/server/mastra/workflows/chat/validate-marksheet.ts  (or wherever auto-fix lives)
src/lib/server/mastra/tools/operations/reporting/marksheet/
```
…and match against the actual error class names or message prefixes. Patterns in the chunk spec are illustrative defaults — refine against the real source.

### D5 — F4+F5 reconciliation: `inlineDocumentStreams` vs `hasArtifact`
The current `chat.svelte` renders `ShimmerArtifactCard` per `inlineDocumentStreams` entry (around line 295–303). The F5 design renders `ArtifactCard` once per message that has artifact data parts (via the `hasArtifact` boolean). These overlap. **Resolution:** Implementation must collapse the rendering: iterate `inlineDocumentStreams` inside the `{#if hasArtifact}` wrapper so each artifact gets its own `ArtifactCard` under one "Thinking completed >" collapsible. Open Question OQ-C6-1.

### D6 — File extension correction
Spec section 3.1 row F2 references `src/lib/state/background-tasks.svelte`; the actual file is `src/lib/state/background-tasks.svelte.ts` (Svelte 5 runes file). Plan and verification reference the correct extension.

### D7 — Net file count
- Delete: 1 (`pdf-preview.svelte`)
- Create: 1 (`chat/ToolGroup.svelte`)
- Rename: 0 net (`ShimmerArtifactCard.svelte` → `ArtifactCard.svelte`)
- Preserve: 3 (`activity-popover.svelte`, `state/background-tasks.svelte.ts`, `types/background-tasks.ts`)
- **Total: −2 files.**

---

## Risks

| ID | Risk | Likelihood | Mitigation |
|----|------|-----------|------------|
| R1 | F4 wrapper-strip breaks internal layout in `tool-message.svelte` | Medium | Run svelte-check after refactor; manual smoke test on a known tool call (e.g., `choose-document`); visual diff via screenshot before/after. |
| R2 | F5 visual regression (complete rewrite) | Medium | Reference images in `static/artifact/artifact-{loading,done}.png` are exact; spec code block matches. Smoke test by triggering `data-streamDocument` and `data-generatePDF` in dev. |
| R3 | F2 hidden `ActivityPopover` doesn't fully isolate background-tasks state | Low | Audit imports before hiding: `routes/(chat)/filestore/+page.svelte`, `lib/workers/task-worker.ts`, `lib/server/service/ocr-batch.service.ts`, `routes/api/file/[...path]/+server.ts` all consume the store directly. The popover is purely a view; removing it is safe. TODO comment in the header explicitly notes these consumers. |
| R4 | F6 `switch` exhaustiveness breaks consumers | Medium | Audit consumers before adding: `categorizeAIError` and `describe()` are called from `ErrorAlert.svelte` and possibly `chat-context.svelte.ts` and the workflow server-side. Append-only ordering minimizes risk; verify with `pnpm run check` after each new variant. |
| R5 | F5 event-dispatch migration (D3) misses a listener | Medium | `grep -rn 'chat:openArtifact' src/` before and after. If any non-Svelte listener exists, keep `window.dispatchEvent` as a fallback. |
| R6 | F4+F5 reconciliation (D5) double-renders ArtifactCard | Medium | Render `ArtifactCard` exclusively inside the new `{#if hasArtifact}` wrapper; remove the original `{#each inlineDocumentStreams}` block. Test by triggering a tool call that emits both `tool-streamDocument` and a non-artifact tool call in the same message — count must equal 1 ArtifactCard. |
| R7 | Spec drift in prop names (`selectedChatModelId` vs `currentModel.id`) causes wrong type | Low | D2 captures the resolution; plan explicitly says "read `ChatComposer.svelte` first" so the implementer sees the actual names. |
| R8 | New error matching regexes miss the workflow's actual error strings | Medium | D4 captures the resolution; implementation greps the workflow source before writing patterns. |
| R9 | `pnpm run check` baseline (99 errors) shifts between plan approval and execution | Low | Re-run `pnpm run check` at chunk start if more than 24 hours have elapsed since plan approval; abort if delta is non-zero and reconcile. Baseline already recorded at SHA `67fa5f3` on the feature branch. |
| R10 | Out-of-scope drift: implementer expands scope into related areas | Medium | Chunk `Accept When` bullets are explicit; spec §3.2 out-of-scope list is referenced in the plan header. If a tempting improvement surfaces, file a follow-up note rather than expanding the chunk. |

---

## Open Questions

All open questions are surfaced here and resolved (or marked for in-chunk resolution) before the plan lands. None remain unresolved at plan-finalization time.

- **OQ-C3-1** (resolved in D2): F2 prop-source — replicate `ChatComposer`'s pattern. No further user input required.
- **OQ-C4-1** (resolved in D3): F5 event-dispatch — implementation greps first, uses `createEventDispatcher` for Svelte listeners, keeps `window` fallback only if non-Svelte listeners exist. No further user input required.
- **OQ-C5-1** (resolved in D4): F6 error patterns — implementation greps workflow source before writing regex. No further user input required.
- **OQ-C6-1** (resolved in D5): F4+F5 reconciliation — render `ArtifactCard` once per artifact under the "Thinking completed" wrapper. No further user input required.

---

## Execution handoff

**Mode:** Subagent-driven. Controller (this session) coordinates; Builder subagents implement chunks.

**Per chunk:**
1. Dispatch Builder subagent with: full chunk text + relevant Decision Log entries + relevant spec section references.
2. Builder implements, runs verifications, commits with the prescribed message, self-reviews, returns DONE | DONE_WITH_CONCERNS | NEEDS_CONTEXT | BLOCKED.
3. Dispatch Spec Reviewer subagent to confirm code matches spec.
4. If spec gaps found, dispatch Builder (same context) to fix; re-review.
5. Dispatch Code Quality Reviewer subagent.
6. If quality issues found, dispatch Builder to fix; re-review.
7. Mark chunk complete; update checklist file.

**After all 6 chunks:**
1. Dispatch final Code Reviewer subagent on the full feature branch.
2. Run the Full-branch verification block from the plan.
3. Update checklist to "complete" with all boxes ticked.
4. Open PR against `main` with the spec section 8 checklist as the PR description.

**Required sub-skills:**
- `superpowers:subagent-driven-development` (active)
- `superpowers:using-git-worktrees` (for isolation — applied via worktree on a feature branch)
- `superpowers:finishing-a-development-branch` (after all chunks land)
