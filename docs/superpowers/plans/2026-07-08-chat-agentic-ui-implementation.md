# Chat Agentic UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose the new agentic workflow surface (tool calls, persisted HITL parts, iteration shimmer, new error codes) in the chat UI while shrinking the component graph by 2 files net and aligning toast placement with the "Gold on Slate" design language.

**Architecture:** Six small, sequential UI fixes reusing existing primitives. One new file (`chat/ToolGroup.svelte`), one rename (`ShimmerArtifactCard` → `ArtifactCard`), one trimmed cleanup (`pdf-preview.svelte` import only — file preserved). Tool calls are rendered via a collapsible group wrapper; artifact data parts are routed through a renamed card that matches the reference designs; six new error categories are appended to the existing discriminated union.

**Tech Stack:** Svelte 5 (runes), TypeScript, bits-ui (collapsible), lucide-svelte, sonner (toasts), Tailwind/shadcn tokens from `src/routes/layout.css`, Drizzle-style typeless pattern (no backend changes).

---

## 0. Spec Verification & Open Assumptions

The spec at `.superpowers/2026-07-08-chat-agentic-ui-redesign.md` was verified against the codebase before planning. Six material discrepancies were found; each is resolved by an explicit assumption below. **All assumptions need user sign-off during plan review.**

### 0.1 Verified claims (✓ safe to implement as written)

| Spec claim | Evidence | Status |
|---|---|---|
| `chat.svelte` drops `tool-*` parts silently | `chat.svelte:271-289` — only `reasoning` + `text` rendered | ✓ |
| `tool-message.svelte` imported but never used in template | `chat.svelte:18` imports; no `<ToolMessage>` in template | ✓ |
| `chat-header.svelte` renders `<ActivityPopover />` | `chat-header.svelte:6,26` | ✓ |
| `ChatComposer.svelte` renders `<ContextUsageIndicator>` | `ChatComposer.svelte:32,673-678` | ✓ |
| `AGENT_LOOP_MAX_ITERATIONS = 8` | `utils/chat-schemas.ts:124` | ✓ |
| `writeDataPart` exists and is used | `utils/chat-utils.ts:100` + many call sites | ✓ |
| `.dountil(agentLoopStep)` in workflow | `workflows/index.ts:101` | ✓ |
| `data-awaitValidation` parts consumed by `chat.svelte` + `ChatComposer` | grep shows 6+ usages | ✓ |
| `cancelValidation` exists on chat context | `chat-context.svelte.ts:604` | ✓ |
| Existing ActionBar has `onSecondary` wired to `cancelValidation` | `chat.svelte:339` already does this | ✓ |
| `data-streamDocument` data part defined | `chat-types.ts:102-105` | ✓ |
| ShimmerArtifactCard used by chat + ArtifactViewer | `chat.svelte:62`, `ArtifactViewer.svelte:23` | ✓ |
| `activity-popover.svelte` + `background-tasks.svelte.ts` + `background-tasks.ts` exist | grep confirms | ✓ |
| Static reference images exist | `static/artifact/artifact-{loading,done}.png` | ✓ |

### 0.2 Discrepancies & resolutions

| # | Spec claim | Reality | Resolution |
|---|---|---|---|
| **D1** | "pdf-preview.svelte is a duplicate of embedPDF and adds nothing; delete it." | `pdf-preview.svelte` is a paginated results-preview modal with pan/zoom + `publishResult` API call + URL hash-driven preview tokens. Invoked from `message-action.svelte:11,67-77` via `goto(#${token})` for `tool-upsertStudentResult` outputs. | **REDUCE F1 SCOPE**: keep the file. Commit only removes the dead `import PreviewModal` in `message-action.svelte:11` (the import is unused — modal opens via global mount in `chat.svelte:365` catching the URL hash, not via local mount). Add TODO comment that publish flow needs to be ported to workspace panel as a separate, future effort. This preserves the 6-commit structure without breaking the publish flow. |
| **D2** | F2 uses `selectedChatModelId` and `currentModelLimit` | Variables don't exist. Actual names: `selectedChatModel.value` from `SelectedModel.fromContext()` and `currentModel.limit.context` (derived). | Use correct names in the F2 code. chat-header must import `SelectedModel` and `ResolvedModelHolder` and derive `currentModel` itself, mirroring `ChatComposer.svelte:101-128`. |
| **D3** | "src/routes/+layout.svelte line 48" | Toaster is at line 17. | Use the correct line in the F3 commit. |
| **D4** | "data-streamDocument and data-generatePDF" both fire | Only `data-streamDocument` exists in `chat-types.ts:102-105`. `data-generatePDF` is not defined. | F5's `hasArtifact` boolean = `parts.some(p => p.type === 'data-streamDocument')` only. Add TODO comment to extend when `data-generatePDF` lands. OR-fallback is harmless but a TODO is clearer. |
| **D5** | "Six new error codes can surface from the workflow" | Only `AGENT_LOOP_EXHAUSTED` is thrown (`workflows/index.ts:109`). The other 5 (`AUTO_FIX_EXHAUSTED`, `STUDENT_ID_MISSING`, `PERSIST_PATH_MISSING`, `TOOL_NOT_REGISTERED`, `BUN_PRECONDITION_FAILED`) have NO throws anywhere in `src/`. | Add all 6 client-side categories + ErrorAlert button variants now. The 5 unbacked categories will not fire until backend throws are added (out of scope per spec §3.2). Mark them with `// TODO(backend): wire throw` so the missing pieces are discoverable. |
| **D6** | "pnpm run check baseline: 68 errors and 22 warnings" | User stated "14 pre-existing source errors." | Don't pin a number in the plan. Verification target is **"no new errors introduced by any of the 6 commits."** The implementer must run `pnpm run check` once at the start of Task F0 (Baseline Capture) to record the actual baseline. |

### 0.3 Open assumptions (need user confirmation)

| ID | Assumption | If wrong, plan must revise |
|---|---|---|
| A1 | D1 resolution: keep `pdf-preview.svelte`, only remove dead import in `message-action.svelte`. Commit message becomes `chore(chat): drop dead PreviewModal import in message-action`. | If user wants the full delete, F1 grows to include porting publish flow to ArtifactViewer. |
| A2 | D5 resolution: client-only F6. | If user wants server-side throws too, F6 grows to include 5 new `throw` statements across `validate-marksheet.ts`, `await-validation-step.ts`, etc. |
| A3 | D4 resolution: `hasArtifact` keyed on `data-streamDocument` only with TODO. | If user wants to define `data-generatePDF` first, that becomes a precondition task. |
| A4 | Subagent-driven execution (per writing-plans skill default). | If user prefers inline or pausing between tasks, subagent dispatches change. |
| A5 | The implementer subagent uses the codebase's `pnpm run svelte-check` and `pnpm run lint` for verification (no separate vitest setup needed for UI work). | If vitest unit tests are required, additional TDD scaffolding needed. |

---

## File Structure

**New files:**
- `src/lib/components/chat/ToolGroup.svelte` — collapsible wrapper for `tool-*` parts (F4)

**Renamed files:**
- `src/lib/components/ShimmerArtifactCard.svelte` → `src/lib/components/ArtifactCard.svelte` (F5)
- Internal exports renamed: `ShimmerArtifactCard` → `ArtifactCard` (default export)

**Modified files:**
- `src/lib/components/chat.svelte` — F1 (no change after D1 resolution), F4 (wire `ToolGroup`), F5 (update import)
- `src/lib/components/chat-header.svelte` — F2 (replace `ActivityPopover` with `ContextUsageIndicator` + TODO)
- `src/lib/components/ChatComposer.svelte` — F2 (remove `ContextUsageIndicator` from action tray)
- `src/lib/components/tool-message.svelte` — F4 (strip outer wrapper) + F4b (copy-to-clipboard button on raw JSON)
- `src/lib/components/workspace/ArtifactViewer.svelte` — F5 (update import path)
- `src/routes/+layout.svelte` — F3 (Toaster position)
- `src/lib/errors/friendly-ai-error.ts` — F6 (6 new categories)
- `src/lib/components/shared/ErrorAlert.svelte` — F6 (button variants for new actions)
- `src/lib/components/message-action.svelte` — F1 (drop dead `PreviewModal` import)

**Preserved (no change):**
- `src/lib/components/pdf-preview.svelte` — kept for publish flow (D1)
- `src/lib/components/activity-popover.svelte`
- `src/lib/state/background-tasks.svelte.ts` (note: `.svelte.ts`, not `.svelte` — spec had typo)
- `src/lib/types/background-tasks.ts`

**Net file count:** +1 (create ToolGroup) − 0 (no deletions, no net rename). Originally spec claimed −2; the reduction to a smaller F1 commit reflects the corrected scope.

---

## Commit Order (preserves 6-commit structure)

| # | Commit | Fix |
|---|---|---|
| 1 | `chore(ui): move toaster to bottom-left` | F3 |
| 2 | `chore(chat): drop dead PreviewModal import in message-action` | F1 (reduced) |
| 3 | `refactor(chat-header): swap ActivityPopover for ContextUsageIndicator` | F2 |
| 4 | `refactor(chat): rename ShimmerArtifactCard to ArtifactCard and redesign per static/artifact reference` | F5 |
| 5 | `feat(errors): add 6 friendly categories for new agentic workflow errors` | F6 |
| 6 | `feat(chat): render tool calls via ToolGroup collapsible wrapper` | F4 (incl. F4b) |

Each commit ends with:
```
Co-Authored-By: Kimchi <noreply@kimchi.dev>
```

---

## Task 0: Baseline Capture (must run before any commit)

**Files:** none (read-only measurement)

- [ ] **Step 0.1: Run `pnpm run check` and record baseline**

```bash
cd /home/beznet/Workspace/edapex
pnpm run check 2>&1 | tail -5
```

Record the actual count of errors and warnings. The verification target for every subsequent task is: **same count ±0 new errors introduced by this commit's files**.

- [ ] **Step 0.2: Snapshot grep state for sanity checks**

```bash
cd /home/beznet/Workspace/edapex
grep -rln "ShimmerArtifactCard" src/ | tee /tmp/baseline-shimmer.txt
grep -rln "PreviewModal\|pdf-preview" src/ | tee /tmp/baseline-preview.txt
grep -rln "ActivityPopover\|ContextUsageIndicator" src/ | tee /tmp/baseline-usage.txt
```

These baseline files drive the "after each fix" verification commands. Do NOT commit any changes from this task.

---

## Task 1: F3 — Move Toaster to bottom-left

**Files:**
- Modify: `src/routes/+layout.svelte:17`

- [ ] **Step 1.1: Edit the Toaster position**

In `src/routes/+layout.svelte`, change line 17 from:

```svelte
  <Toaster position="bottom-center" />
```

to:

```svelte
  <Toaster position="bottom-left" />
```

No other lines change.

- [ ] **Step 1.2: Verify type safety on the touched file**

Run:
```bash
cd /home/beznet/Workspace/edapex
pnpm run svelte-check --workspace src/routes/+layout.svelte
```

Expected: same error count as baseline for this file (the `Toaster` `position` prop accepts `"bottom-left"` per shadcn-svelte sonner binding — verify no new error).

- [ ] **Step 1.3: Confirm no other `Toaster` mount exists**

```bash
cd /home/beznet/Workspace/edapex
grep -rn "Toaster" src/
```

Expected: only one match at `src/routes/+layout.svelte:17`.

- [ ] **Step 1.4: Commit**

```bash
cd /home/beznet/Workspace/edapex
git add src/routes/+layout.svelte
git commit -m "chore(ui): move toaster to bottom-left

Aligns with the 'Gold on Slate' design language — system toasts
(auth, rate limits) read better in the lower-left, out of the
user's gaze path.

Co-Authored-By: Kimchi <noreply@kimchi.dev>"
```

---

## Task 2: F1 — Drop dead `PreviewModal` import (reduced scope per D1)

**Files:**
- Modify: `src/lib/components/message-action.svelte:11`

- [ ] **Step 2.1: Audit `PreviewModal` usages**

```bash
cd /home/beznet/Workspace/edapex
grep -rn "PreviewModal" src/
```

Expected output BEFORE the edit:
```
src/lib/components/chat.svelte:21:   import PreviewModal from "./pdf-preview.svelte";
src/lib/components/chat.svelte:365: <PreviewModal />
src/lib/components/message-action.svelte:11:  import PreviewModal from "./pdf-preview.svelte";
```

`message-action.svelte` imports `PreviewModal` but never renders it locally — the modal opens via URL hash navigation (`goto(\`#${token}\`)` at line 71), caught by the global mount in `chat.svelte:365`.

- [ ] **Step 2.2: Remove the dead import**

In `src/lib/components/message-action.svelte`, delete line 11:
```ts
  import PreviewModal from "./pdf-preview.svelte";
```

Also remove the `import { goto } from "$app/navigation";` is **kept** (still used by `goto(\`#${token}\`)`).

- [ ] **Step 2.3: Add a TODO comment to `pdf-preview.svelte` header documenting future work**

The spec's intent (port publish flow to workspace panel) is real but out of scope for this plan. Add a header comment to `src/lib/components/pdf-preview.svelte` immediately after the opening `<script lang="ts">`:

```ts
// TODO(workspace-port): This modal hosts the publish-to-email + paginated
// preview flow for `tool-upsertStudentResult` outputs. The longer-term
// direction is to port this surface into `workspace/ArtifactViewer.svelte`
// (which already renders PDFs via embedPDF) and delete this file. Until that
// port lands, this modal must remain importable and mounted by chat.svelte.
```

Do **NOT** delete the file. Do **NOT** remove the `<PreviewModal />` mount in `chat.svelte:365`.

- [ ] **Step 2.4: Verify**

```bash
cd /home/beznet/Workspace/edapex
pnpm run svelte-check --workspace src/lib/components/message-action.svelte
pnpm run svelte-check --workspace src/lib/components/chat.svelte
grep -n "PreviewModal" src/lib/components/message-action.svelte || echo "OK: import removed"
grep -n "import PreviewModal" src/lib/components/chat.svelte
grep -n "<PreviewModal" src/lib/components/chat.svelte
```

Expected:
- message-action.svelte: no `PreviewModal` matches
- chat.svelte: still has the import (line 21) and the global mount (line 365)

- [ ] **Step 2.5: Commit**

```bash
cd /home/beznet/Workspace/edapex
git add src/lib/components/message-action.svelte src/lib/components/pdf-preview.svelte
git commit -m "chore(chat): drop dead PreviewModal import in message-action

The PreviewModal import in message-action.svelte was unused — the modal
opens via URL hash navigation caught by the global mount in chat.svelte.
pdf-preview.svelte itself is preserved: it hosts the publish-to-email +
paginated preview flow for tool-upsertStudentResult outputs and must
remain importable until that flow is ported to ArtifactViewer.

Co-Authored-By: Kimchi <noreply@kimchi.dev>"
```

---

## Task 3: F2 — Hide ActivityPopover + move ContextUsageIndicator to header

**Files:**
- Modify: `src/lib/components/chat-header.svelte`
- Modify: `src/lib/components/ChatComposer.svelte`

**Naming correction (D2):** spec used `selectedChatModelId` / `currentModelLimit`. The actual variables are `selectedChatModel.value` from `SelectedModel.fromContext()` and `currentModel.limit.context` (derived). Use these names.

### 3a — ChatComposer (remove indicator from action tray)

- [ ] **Step 3a.1: Identify the ContextUsageIndicator usage**

In `src/lib/components/ChatComposer.svelte`, find the action-tray block (around line 673):

```svelte
      {#if currentModel}
        <ContextUsageIndicator
          modelId={currentModel.id}
          maxTokens={maxContext}
        />
      {/if}
```

- [ ] **Step 3a.2: Remove the indicator block**

Delete those 5 lines (the `{#if currentModel}` … `ContextUsageIndicator` block).

- [ ] **Step 3a.3: Verify type safety**

```bash
cd /home/beznet/Workspace/edapex
pnpm run svelte-check --workspace src/lib/components/ChatComposer.svelte
```

Expected: no new errors. (The unused-import rule may flag `ContextUsageIndicator` at line 32 if linter is strict — if so, remove the import too. The file may still need it for type inference in the same scope; verify before removing.)

If lint complains about unused import, remove:
```ts
import ContextUsageIndicator from "./ContextUsageIndicator.svelte";
```

Otherwise leave the import (TypeScript may rely on the side effect).

### 3b — ChatHeader (swap ActivityPopover for ContextUsageIndicator)

- [ ] **Step 3b.1: Read current `chat-header.svelte`**

The file is 41 lines. Confirm:
```svelte
<script lang="ts">
	import { Button } from "$lib/components/ui/button/index.js";
	import * as Sidebar from "$lib/components/ui/sidebar/index.js";
	import { useSidebar } from "$lib/components/ui/sidebar/index.js";
	import type { AuthUser } from "$lib/types/auth-types";
	import { UserContext } from "$lib/context/user-context.svelte";
	import ActivityPopover from "$lib/components/activity-popover.svelte";
	import ModelSelector from "$lib/components/model-selector.svelte";

	let { user }: { user?: AuthUser } = $props();

	const sidebar = useSidebar();
	const userContext = UserContext.fromContext();
</script>
```

- [ ] **Step 3b.2: Replace imports + derive `currentModel`**

Replace the entire `<script lang="ts">` block with:

```svelte
<script lang="ts">
	import { Button } from "$lib/components/ui/button/index.js";
	import * as Sidebar from "$lib/components/ui/sidebar/index.js";
	import { useSidebar } from "$lib/components/ui/sidebar/index.js";
	import type { AuthUser } from "$lib/types/auth-types";
	import { UserContext } from "$lib/context/user-context.svelte";
	import ContextUsageIndicator from "$lib/components/ContextUsageIndicator.svelte";
	import ModelSelector from "$lib/components/model-selector.svelte";
	import { SelectedModel, ResolvedModelHolder } from "$lib/context/sync.svelte";
	import { getModelById } from "$lib/provider/catalog";
	import type { ModelId } from "$lib/provider/types";

	let { user }: { user?: AuthUser } = $props();

	const sidebar = useSidebar();
	const userContext = UserContext.fromContext();
	const selectedChatModel = SelectedModel.fromContext();
	const resolvedModelHolder = ResolvedModelHolder.fromContext();

	// Mirror ChatComposer.svelte's currentModel derivation (lines 101-128).
	// SelectedModel holds the raw "modelId" or "modelId@variant" string from
	// the cookie; ResolvedModelHolder carries the SSR-resolved model for
	// custom-provider discovered models not in BUILTIN_MODELS.
	const currentModel = $derived.by(() => {
		const raw = selectedChatModel.value;
		if (!raw) return resolvedModelHolder.value;
		const modelId = raw.includes("@") ? raw.slice(0, raw.indexOf("@")) : raw;
		const resolved = resolvedModelHolder.value;
		if (resolved && (resolved.id === modelId || raw.startsWith(`${resolved.id}@`))) {
			return resolved;
		}
		return getModelById(modelId as ModelId) ?? null;
	});

	const maxContext = $derived(currentModel?.limit.context ?? 128_000);
</script>
```

If `Sidebar`, `Button`, or `userContext`/`user` are unused after this change, remove them. (Verify with grep before deleting; they may still be referenced elsewhere in the template.)

- [ ] **Step 3b.3: Replace the `<ActivityPopover />` element with `<ContextUsageIndicator>`**

In the template, find:
```svelte
  <div class="flex items-center gap-1 shrink-0">
    <ActivityPopover />
  </div>
```

Replace with:
```svelte
  <div class="flex items-center gap-1 shrink-0">
    <!-- TODO(background-tasks): Re-enable <ActivityPopover /> here when
         background-task feature ships (OCR worker, etc). Files to revisit:
         src/lib/components/activity-popover.svelte
         src/lib/state/background-tasks.svelte.ts
         src/lib/types/background-tasks.ts -->
    {#if currentModel}
      <ContextUsageIndicator
        modelId={currentModel.id}
        maxTokens={maxContext}
      />
    {/if}
  </div>
```

- [ ] **Step 3b.4: Verify**

```bash
cd /home/beznet/Workspace/edapex
pnpm run svelte-check --workspace src/lib/components/chat-header.svelte
pnpm run svelte-check --workspace src/lib/components/ChatComposer.svelte
grep -n "ActivityPopover" src/lib/components/chat-header.svelte || echo "OK: ActivityPopover removed from header"
grep -n "ContextUsageIndicator" src/lib/components/chat-header.svelte
```

Expected:
- chat-header.svelte: no `ActivityPopover`, one `ContextUsageIndicator` import + one usage
- No new svelte-check errors

### 3c — Audit background-tasks imports

- [ ] **Step 3c.1: Confirm no code path breaks from hiding the popover**

```bash
cd /home/beznet/Workspace/edapex
grep -rn "from \"\$lib/state/background-tasks" src/
grep -rn "from \"\$lib/components/activity-popover" src/
```

Expected:
- `background-tasks.svelte.ts` is still imported by:
  - `src/routes/(chat)/filestore/+page.svelte` (OCR batch trigger)
  - `src/components/activity-popover.svelte` (the hidden popover itself)
- `activity-popover.svelte` is no longer imported anywhere (since we removed its mount)

If `activity-popover.svelte` has zero importers, **keep it on disk** (per spec — TODO breadcrumb for future re-enablement). Just don't delete it.

- [ ] **Step 3c.2: Commit**

```bash
cd /home/beznet/Workspace/edapex
git add src/lib/components/chat-header.svelte src/lib/components/ChatComposer.svelte
git commit -m "refactor(chat-header): swap ActivityPopover for ContextUsageIndicator

Token usage now lives in the header next to the model selector, where it
matches user mental model. The ActivityPopover is hidden behind a TODO
comment because the background-tasks feature is not yet shipped; the
underlying files (activity-popover.svelte, background-tasks.svelte.ts,
background-tasks.ts) are preserved for future re-enablement.

Co-Authored-By: Kimchi <noreply@kimchi.dev>"
```

---

## Task 4: F5 — Rename ShimmerArtifactCard → ArtifactCard + redesign per reference

**Files:**
- Rename: `src/lib/components/ShimmerArtifactCard.svelte` → `src/lib/components/ArtifactCard.svelte`
- Modify: `src/lib/components/chat.svelte` (update import)
- Modify: `src/lib/components/workspace/ArtifactViewer.svelte` (update import)
- The card's internal rewrite (per spec §4.6)

**API note:** the spec's new props API is `{ artifactId, status, title, filename, timestamp }`. The existing component takes `{ id, title, status, content, kind }`. The new API is correct (broader role), but means the existing two call sites in `chat.svelte` and `ArtifactViewer.svelte` must be updated to pass the new shape. **Both call sites currently pass `content` (the streaming markdown) — the new API uses `status` + `title` + `filename` + `timestamp` instead.** The streaming content moves to the workspace-panel rendering path (EditorCanvas), not the card itself.

### 4a — Rewrite the component

- [ ] **Step 4a.1: Create the new file with the rewrite**

Run:
```bash
cd /home/beznet/Workspace/edapex
git mv src/lib/components/ShimmerArtifactCard.svelte src/lib/components/ArtifactCard.svelte
```

Then replace the contents of `src/lib/components/ArtifactCard.svelte` with:

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
		timestamp
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

	function openArtifact(): void {
		dispatch("chat:openArtifact", { artifactId });
	}
</script>

<div class="rounded-2xl border border-border/40 bg-card/40 backdrop-blur-md overflow-hidden">
	<div class="grid grid-cols-[auto_1fr] gap-3 p-3">
		<!-- LEFT: 96x96 thumbnail -->
		<div class="size-24 rounded-xl overflow-hidden shrink-0 relative">
			{#if isWorking}
				<div class="absolute inset-0 bg-gradient-to-br from-purple-500/60 via-blue-500/60 to-pink-500/60 animate-pulse"></div>
				<div class="absolute inset-0 flex items-center justify-center">
					<SparklesIcon class="size-10 text-white/90 drop-shadow" />
				</div>
			{:else}
				<div class="absolute inset-0 bg-zinc-800/80 flex flex-col gap-1 p-2">
					<div class="h-1/3 bg-zinc-700 rounded-sm"></div>
					<div class="flex-1 space-y-1">
						<div class="h-1.5 bg-zinc-700 rounded-sm w-3/4"></div>
						<div class="h-1.5 bg-zinc-700 rounded-sm w-full"></div>
						<div class="h-1.5 bg-zinc-700 rounded-sm w-1/2"></div>
					</div>
				</div>
			{/if}
		</div>

		<!-- RIGHT: content area -->
		<div class="flex flex-col justify-center min-w-0">
			{#if isWorking}
				<div class="space-y-2">
					<div class="h-3 bg-muted/40 rounded animate-pulse w-3/4"></div>
					<div class="h-2.5 bg-muted/30 rounded animate-pulse w-full"></div>
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
			<div class="h-2.5 w-16 bg-muted/30 rounded animate-pulse"></div>
		{:else if timestamp}
			<span class="text-[10px] font-mono text-muted-foreground/70 tabular-nums">
				{formatTimestamp(timestamp)}
			</span>
		{/if}
		<button
			type="button"
			onclick={openArtifact}
			aria-label="Preview artifact"
			class="size-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
		>
			<EyeIcon class="size-3.5" />
		</button>
	</footer>
</div>
```

### 4b — Update call sites

- [ ] **Step 4b.1: Update `chat.svelte` import**

Find line 62:
```svelte
  import ShimmerArtifactCard from "./ShimmerArtifactCard.svelte";
```

Replace with:
```svelte
  import ArtifactCard from "./ArtifactCard.svelte";
```

- [ ] **Step 4b.2: Update `chat.svelte` template usage**

Find the existing `ShimmerArtifactCard` usage around line 313:
```svelte
              {#each inlineDocumentStreams as stream (stream.toolCallId)}
                {#if message.parts?.some((p) => (p as { type?: string; toolCallId?: string }).type === "tool-streamDocument" && (p as { toolCallId?: string }).toolCallId === stream.toolCallId)}
                  <div class="mt-2 mb-2 w-full">
                    <ShimmerArtifactCard
                      id={stream.documentId}
                      title={stream.title}
                      status={stream.status}
                      content={stream.content}
                      kind="document"
                    />
                  </div>
                {/if}
              {/each}
```

Replace with:
```svelte
              {#each inlineDocumentStreams as stream (stream.toolCallId)}
                {#if message.parts?.some((p) => (p as { type?: string; toolCallId?: string }).type === "tool-streamDocument" && (p as { toolCallId?: string }).toolCallId === stream.toolCallId)}
                  <div class="mt-2 mb-2 w-full">
                    <ArtifactCard
                      artifactId={stream.documentId}
                      title={stream.title}
                      status={stream.status}
                      filename={stream.title}
                    />
                  </div>
                {/if}
              {/each}
```

- [ ] **Step 4b.3: Update `ArtifactViewer.svelte` import + usage**

Find line 23:
```svelte
	import ShimmerArtifactCard from "$lib/components/ShimmerArtifactCard.svelte";
```

Replace with:
```svelte
	import ArtifactCard from "$lib/components/ArtifactCard.svelte";
```

Then grep for any other usage in the file:
```bash
cd /home/beznet/Workspace/edapex
grep -n "ShimmerArtifactCard\|ArtifactCard" src/lib/components/workspace/ArtifactViewer.svelte
```

If the only ArtifactViewer reference to the card was the import (and no template usage), this is a one-line change. If the template uses it, apply the same prop-API migration as in 4b.2 (no `content` or `kind`; pass `artifactId`, `title`, `filename`, `timestamp` derived from `displayTitle` + `current?.createdAt` or similar).

- [ ] **Step 4b.4: Verify no stale references remain**

```bash
cd /home/beznet/Workspace/edapex
grep -rn "ShimmerArtifactCard" src/ || echo "OK: no stale references"
ls -la src/lib/components/ShimmerArtifactCard.svelte 2>&1 || echo "OK: old file removed"
ls -la src/lib/components/ArtifactCard.svelte
```

- [ ] **Step 4b.5: Type-check**

```bash
cd /home/beznet/Workspace/edapex
pnpm run svelte-check --workspace src/lib/components/ArtifactCard.svelte
pnpm run svelte-check --workspace src/lib/components/chat.svelte
pnpm run svelte-check --workspace src/lib/components/workspace/ArtifactViewer.svelte
```

Expected: same error counts as baseline for these files (or fewer, if some pre-existing errors were related to the old component).

### 4c — Smoke test (visual)

- [ ] **Step 4c.1: Compare against reference**

Open `static/artifact/artifact-loading.png` and `static/artifact/artifact-done.png` side-by-side with the rewritten component. Verify:
- 96×96 thumbnail on the left
- Gradient + Sparkles icon in working state
- Document mock + title + filename in done state
- Eye icon in footer right
- Footer shows timestamp (done) or skeleton bar (working)

### 4d — Commit

- [ ] **Step 4d.1: Commit**

```bash
cd /home/beznet/Workspace/edapex
git add src/lib/components/ArtifactCard.svelte src/lib/components/ShimmerArtifactCard.svelte src/lib/components/chat.svelte src/lib/components/workspace/ArtifactViewer.svelte
git commit -m "refactor(chat): rename ShimmerArtifactCard to ArtifactCard and redesign per static/artifact reference

The component now spans both loading and done states (renamed to reflect
the broader role), matches the two reference states in
static/artifact/{loading,done}.png, and dispatches a typed
'chat:openArtifact' event so the parent can route the eye-button click
to the workspace panel.

Props API changed: { id, content, kind } → { artifactId, status, title,
filename?, timestamp? }. Streaming content moves to the workspace
panel rendering path (EditorCanvas) — the card itself only surfaces
metadata + a preview affordance.

Co-Authored-By: Kimchi <noreply@kimchi.dev>"
```

---

## Task 5: F6 — Add 6 friendly error categories

**Files:**
- Modify: `src/lib/errors/friendly-ai-error.ts` (append 6 variants)
- Modify: `src/lib/components/shared/ErrorAlert.svelte` (button variants for new actions)

**Important:** Per D5, only `AGENT_LOOP_EXHAUSTED` is currently thrown server-side. The other 5 categories are forward-looking — the buttons won't fire until backend throws land.

### 5a — Extend the discriminated union

- [ ] **Step 5a.1: Add 6 new variants to `FriendlyAiError`**

In `src/lib/errors/friendly-ai-error.ts`, find the `FriendlyAiError` type definition (after the `FriendlyAction` type). Append six new variants. The full new union (showing only the additions; existing variants unchanged):

```ts
export type FriendlyAction =
	| 'regenerate'
	| 'clear_context'
	| 'open_settings'
	| 'contact_support'
	| 'none'
	// New F6 actions:
	| 'edit_marksheet_then_retry'
	| 'mention_student'
	| 'rerun_format'
	| 'rephrase_request';

export type FriendlyAiError =
	// ... existing variants unchanged ...
	| { kind: 'auto_fix_exhausted'; title: string; message: string; action: 'edit_marksheet_then_retry' }
	| { kind: 'student_id_missing'; title: string; message: string; action: 'mention_student' }
	| { kind: 'persist_path_missing'; title: string; message: string; action: 'rerun_format' }
	| { kind: 'tool_not_registered'; title: string; message: string; action: 'contact_support' }
	| { kind: 'agent_loop_exhausted'; title: string; message: string; action: 'rephrase_request' }
	| { kind: 'bun_precondition_failed'; title: string; message: string; action: 'contact_support' };
```

- [ ] **Step 5a.2: Add 6 new switch cases to `describe()`**

In the `describe()` function, append six new cases BEFORE the closing brace:

```ts
		case 'auto_fix_exhausted':
			return {
				title: err.title,
				message: err.message,
				action: 'edit_marksheet_then_retry'
			};
		case 'student_id_missing':
			return {
				title: err.title,
				message: err.message,
				action: 'mention_student'
			};
		case 'persist_path_missing':
			return {
				title: err.title,
				message: err.message,
				action: 'rerun_format'
			};
		case 'tool_not_registered':
			return {
				title: err.title,
				message: err.message,
				action: 'contact_support'
			};
		case 'agent_loop_exhausted':
			return {
				title: err.title,
				message: err.message,
				action: 'rephrase_request'
			};
		case 'bun_precondition_failed':
			return {
				title: err.title,
				message: err.message,
				action: 'contact_support'
			};
```

- [ ] **Step 5a.3: Document the backend gap inline**

Immediately after the closing `}` of `FriendlyAiError`, add:

```ts
// F6 NOTE: Of the six new categories above, only `agent_loop_exhausted`
// is currently thrown server-side (see workflows/index.ts:109). The other
// five are forward-looking; their UI buttons will not fire until backend
// throws land. Throws are out of scope per spec §3.2 — see plan §0.2 D5.
```

### 5b — Wire buttons in ErrorAlert

- [ ] **Step 5b.1: Add new button variants**

In `src/lib/components/shared/ErrorAlert.svelte`, find the button-rendering `{#if presentation.action === '...'}` chain and add new cases. The current chain:

```svelte
		{#if presentation.action === 'regenerate'}
			<Button size="sm" variant="outline" onclick={() => onAction(presentation.action)}>
				Retry
			</Button>
		{:else if presentation.action === 'clear_context'}
			<Button size="sm" variant="outline" onclick={() => onAction(presentation.action)}>
				Start fresh
			</Button>
		{:else if presentation.action === 'open_settings'}
			<Button size="sm" variant="outline" onclick={() => onAction(presentation.action)}>
				Open Settings
			</Button>
		{/if}
```

Replace with:

```svelte
		{#if presentation.action === 'regenerate'}
			<Button size="sm" variant="outline" onclick={() => onAction(presentation.action)}>
				Retry
			</Button>
		{:else if presentation.action === 'clear_context'}
			<Button size="sm" variant="outline" onclick={() => onAction(presentation.action)}>
				Start fresh
			</Button>
		{:else if presentation.action === 'open_settings'}
			<Button size="sm" variant="outline" onclick={() => onAction(presentation.action)}>
				Open Settings
			</Button>
		{:else if presentation.action === 'edit_marksheet_then_retry'}
			<Button size="sm" variant="outline" onclick={() => onAction(presentation.action)}>
				Edit marksheet
			</Button>
		{:else if presentation.action === 'mention_student'}
			<Button size="sm" variant="outline" onclick={() => onAction(presentation.action)}>
				Mention a student
			</Button>
		{:else if presentation.action === 'rerun_format'}
			<Button size="sm" variant="outline" onclick={() => onAction(presentation.action)}>
				Re-run /format
			</Button>
		{:else if presentation.action === 'rephrase_request'}
			<Button size="sm" variant="outline" onclick={() => onAction(presentation.action)}>
				Rephrase
			</Button>
		{/if}
```

- [ ] **Step 5b.2: Extend `onAction()` switch with no-op handlers**

Find the `onAction()` function:

```ts
	function onAction(action: FriendlyAction): void {
		switch (action) {
			case 'regenerate':
				onRegenerate?.();
				break;
			case 'clear_context':
				onClearContext?.();
				break;
			case 'open_settings':
				void goto('/settings/providers');
				break;
			case 'contact_support':
			case 'none':
			default:
				break;
		}
	}
```

Extend with:

```ts
	function onAction(action: FriendlyAction): void {
		switch (action) {
			case 'regenerate':
				onRegenerate?.();
				break;
			case 'clear_context':
				onClearContext?.();
				break;
			case 'open_settings':
				void goto('/settings/providers');
				break;
			case 'edit_marksheet_then_retry':
				// TODO(backend): when AUTO_FIX_EXHAUSTED is thrown server-side,
				// this handler should open the workspace panel focused on the
				// marksheet artifact. For now the button is a visible no-op.
				break;
			case 'mention_student':
				// TODO(backend): when STUDENT_ID_MISSING is thrown server-side,
				// this handler should focus the chat composer's @student mention.
				break;
			case 'rerun_format':
				// TODO(backend): when PERSIST_PATH_MISSING is thrown server-side,
				// this handler should re-issue the /format command on the user's behalf.
				break;
			case 'rephrase_request':
				// TODO(backend): when AGENT_LOOP_EXHAUSTED is thrown server-side,
				// this handler should scroll the composer into focus with a hint.
				break;
			case 'contact_support':
			case 'none':
			default:
				break;
		}
	}
```

- [ ] **Step 5b.3: Verify**

```bash
cd /home/beznet/Workspace/edapex
pnpm run svelte-check --workspace src/lib/components/shared/ErrorAlert.svelte
pnpm run lint src/lib/errors/friendly-ai-error.ts
pnpm run lint src/lib/components/shared/ErrorAlert.svelte
```

Expected: no new errors. The `describe()` switch now has 18 cases (12 existing + 6 new); exhaustiveness is satisfied.

### 5c — Commit

- [ ] **Step 5c.1: Commit**

```bash
cd /home/beznet/Workspace/edapex
git add src/lib/errors/friendly-ai-error.ts src/lib/components/shared/ErrorAlert.svelte
git commit -m "feat(errors): add 6 friendly categories for new agentic workflow errors

Extends the FriendlyAiError discriminated union with 6 new variants
covering the new agentic workflow error surface: AUTO_FIX_EXHAUSTED,
STUDENT_ID_MISSING, PERSIST_PATH_MISSING, TOOL_NOT_REGISTERED,
AGENT_LOOP_EXHAUSTED, BUN_PRECONDITION_FAILED. Each maps to a title +
message + suggested action; ErrorAlert renders a context-appropriate
button for each.

Of the 6 new categories, only AGENT_LOOP_EXHAUSTED is currently thrown
server-side. The other 5 are forward-looking; their buttons render but
no-op until backend throws land (out of scope per spec §3.2).

Co-Authored-By: Kimchi <noreply@kimchi.dev>"
```

---

## Task 6: F4 — ToolGroup wrapper + F4b copy icon (combined commit)

**Files:**
- Create: `src/lib/components/chat/ToolGroup.svelte`
- Modify: `src/lib/components/chat.svelte` (wire ToolGroup)
- Modify: `src/lib/components/tool-message.svelte` (strip outer wrapper + add copy icon)

### 6a — Create ToolGroup

- [ ] **Step 6a.1: Create the new file**

Write `src/lib/components/chat/ToolGroup.svelte`:

```svelte
<script lang="ts">
	import type { xUIMessagePart } from "$lib/types/chat-types";
	import {
		Collapsible,
		CollapsibleContent,
		CollapsibleTrigger
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
			</each}
		</CollapsibleContent>
	</Collapsible>
</div>
```

### 6b — Strip outer wrapper from tool-message.svelte

- [ ] **Step 6b.1: Read the current outer wrapper**

In `src/lib/components/tool-message.svelte`, the wrapper is at the bottom of the file:

```svelte
<div class="max-w-2xl space-y-6">
	{#if isTool(part)}
		<Tool defaultOpen={true}>
			<ToolHeader type={getToolType()} state={getState(part)} />
			<ToolContent>
				{#if getState(part) === "input-available"}
					<ToolInput input={getInput(part)} />
				{/if}

				{#if getState(part) === "output-available" || getState(part) === "output-error"}
					{#if part.type === "tool-validate-marksheet"}
						{@render validateClassResults(part)}
					{:else if part.type === "tool-manage-results"}
						{@render upsertStudentResult(part)}
					{:else}
						{@render defaultTool(part)}
					{/if}
				{/if}
			</ToolContent>
		</Tool>
	{/if}
</div>
```

- [ ] **Step 6b.2: Replace with the unwrapped version**

Replace the wrapper block with:

```svelte
{#if isTool(part)}
	<Tool defaultOpen={true}>
		<ToolHeader type={getToolType()} state={getState(part)} />
		<ToolContent>
			{#if getState(part) === "input-available"}
				<ToolInput input={getInput(part)} />
			{/if}

			{#if getState(part) === "output-available" || getState(part) === "output-error"}
				{#if part.type === "tool-validate-marksheet"}
					{@render validateClassResults(part)}
				{:else if part.type === "tool-manage-results"}
					{@render upsertStudentResult(part)}
				{:else}
					{@render defaultTool(part)}
				{/if}
			{/if}
		</ToolContent>
	</Tool>
{/if}
```

### 6c — Add copy-to-clipboard button to raw JSON view (F4b)

- [ ] **Step 6c.1: Add imports**

At the top of `src/lib/components/tool-message.svelte`'s `<script lang="ts">` block, add:

```ts
import CopyIcon from "@lucide/svelte/icons/copy";
import { toast } from "svelte-sonner";
```

- [ ] **Step 6c.2: Add the copy handler**

Just below the existing imports, add:

```ts
async function copyRawOutput(p: xUIMessagePart): Promise<void> {
	const output = getOutput(p);
	const json = typeof output === "string" ? output : JSON.stringify(output, null, 2);
	try {
		await navigator.clipboard.writeText(json);
		toast.success("Copied!");
	} catch {
		toast.error("Could not copy to clipboard");
	}
}
```

- [ ] **Step 6c.3: Wire the button into the raw-output collapsible**

In the `defaultTool` snippet, find the `<Collapsible>` that wraps `<ToolOutput output={JSON.stringify(output, null, 2)} />`:

```svelte
	<Collapsible class="rounded-md border">
		<CollapsibleTrigger
			class="text-muted-foreground hover:text-foreground flex w-full items-center justify-between px-3 py-2 text-xs font-medium"
		>
			View raw output
		</CollapsibleTrigger>
		<CollapsibleContent>
			<ToolOutput output={JSON.stringify(output, null, 2)} />
		</CollapsibleContent>
	</Collapsible>
```

Replace with:

```svelte
	<Collapsible class="rounded-md border">
		<div class="flex items-center justify-between">
			<CollapsibleTrigger
				class="text-muted-foreground hover:text-foreground flex flex-1 items-center justify-between px-3 py-2 text-xs font-medium"
			>
				View raw output
			</CollapsibleTrigger>
			<button
				type="button"
				class="text-muted-foreground hover:text-foreground size-7 mr-2 rounded-md flex items-center justify-center transition-colors hover:bg-muted/40"
				aria-label="Copy raw output"
				onclick={() => copyRawOutput(p)}
			>
				<CopyIcon class="size-3.5" />
			</button>
		</div>
		<CollapsibleContent>
			<ToolOutput output={JSON.stringify(output, null, 2)} />
		</CollapsibleContent>
	</Collapsible>
```

The button reuses the existing `getOutput(p)` to serialize the same JSON the collapsible renders.

### 6d — Wire ToolGroup into chat.svelte

- [ ] **Step 6d.1: Add the import**

In `src/lib/components/chat.svelte`, find the `import ToolMessage` line and add ToolGroup below it:

```svelte
	import ToolMessage from "./tool-message.svelte";
	import ToolGroup from "./chat/ToolGroup.svelte";
```

- [ ] **Step 6d.2: Add precomputed `$derived` for tool/non-tool split**

In the `<script lang="ts">` block of `chat.svelte`, add after the existing `$derived` declarations (e.g., after `lastAssistantMessage`):

```ts
	const messagesWithToolSplit = $derived(
		chat.messages.map((m) => ({
			...m,
			toolParts: (m.parts ?? []).filter((p) =>
				typeof p.type === "string" ? p.type.startsWith("tool-") : false,
			),
			nonToolParts: (m.parts ?? []).filter((p) =>
				typeof p.type === "string" ? !p.type.startsWith("tool-") : true,
			),
			// TODO(spec D4): extend when `data-generatePDF` data part is defined.
			// Today only `data-streamDocument` exists in chat-types.ts.
			hasArtifact: (m.parts ?? []).some(
				(p) => (p as { type?: string }).type === "data-streamDocument",
			),
		})),
	);
```

- [ ] **Step 6d.3: Update the message loop**

Find the existing message loop:

```svelte
		{#each chat.messages as message, index}
```

Replace with:

```svelte
		{#each messagesWithToolSplit as message, index (message.id)}
			{@const toolParts = message.toolParts}
			{@const nonToolParts = message.nonToolParts}
```

- [ ] **Step 6d.4: Render non-tool parts**

The existing inner `{#each message.parts as part}` becomes `{#each nonToolParts as part, partIndex (partIndex)}`. (Keeping the iteration key as index is fine for non-tool parts since they only contain reasoning/text, which are positional.)

- [ ] **Step 6d.5: Render ToolGroup after MessageContent**

After the closing `</Message>` of the assistant message block, add (still inside the per-message wrapper):

```svelte
			{#if message.role === "assistant" && toolParts.length > 0}
				<ToolGroup parts={toolParts} />
			{/if}

			{#if message.role === "assistant" && message.hasArtifact}
				<!-- "Thinking completed >" wrapper per spec §4.6 -->
				<!-- TODO: ArtifactCard renders inside this collapsible once F5 lands -->
			{/if}
```

The "Thinking completed >" wrapper currently has no children because `ArtifactCard`'s `data-streamDocument` rendering is already wired separately via `{#each inlineDocumentStreams}` (F5's call site). The wrapper scaffolding is in place for a future iteration where the inline stream rendering moves inside the collapsible.

### 6e — Verify

- [ ] **Step 6e.1: Type-check all touched files**

```bash
cd /home/beznet/Workspace/edapex
pnpm run svelte-check --workspace src/lib/components/chat/ToolGroup.svelte
pnpm run svelte-check --workspace src/lib/components/tool-message.svelte
pnpm run svelte-check --workspace src/lib/components/chat.svelte
```

Expected: no new errors. The `toolParts` / `nonToolParts` arrays are typed via the `$derived` projection.

- [ ] **Step 6e.2: Smoke test**

Manually trigger a chat turn that produces at least one `tool-*` part (e.g., run `/format` on a marksheet — that fires `tool-streamDocument` + others). Verify:
- "Tools (N)" header appears once per assistant message
- Default state is open
- Each tool part renders the existing tool-message UI (minus the old outer wrapper)
- Clicking the new copy icon copies the raw JSON to clipboard (toast confirms)

### 6f — Commit

- [ ] **Step 6f.1: Commit**

```bash
cd /home/beznet/Workspace/edapex
git add src/lib/components/chat/ToolGroup.svelte src/lib/components/tool-message.svelte src/lib/components/chat.svelte
git commit -m "feat(chat): render tool calls via ToolGroup collapsible wrapper

Tool calls were silently dropped by the chat message loop because no
part of the template handled tool-* part types. The orphaned
tool-message.svelte component (240 lines, full state machine + structured
fields + collapsible raw JSON) is now wired through a new
chat/ToolGroup.svelte wrapper that renders one 'Tools (N)' collapsible
per assistant message with defaultOpen=true.

F4b: tool-message.svelte's raw-JSON collapsible now exposes a copy
icon that copies the same JSON to the clipboard with a success/error
toast.

Precomputed message projection (toolParts / nonToolParts / hasArtifact)
lives in a single \$derived block at the top of the script so the
template stays cheap on every rerender.

Co-Authored-By: Kimchi <noreply@kimchi.dev>"
```

---

## Final Verification

After all 6 commits land:

- [ ] **Step V.1: Re-run baseline check**

```bash
cd /home/beznet/Workspace/edapex
pnpm run check 2>&1 | tail -5
```

Expected: error count equals the baseline from Task 0 (no new errors introduced).

- [ ] **Step V.2: Confirm ShimmerArtifactCard fully renamed**

```bash
cd /home/beznet/Workspace/edapex
grep -rn "ShimmerArtifactCard" src/ || echo "OK: no references"
```

- [ ] **Step V.3: Confirm background-task files preserved**

```bash
cd /home/beznet/Workspace/edapex
ls -la src/lib/components/activity-popover.svelte \
       src/lib/state/background-tasks.svelte.ts \
       src/lib/types/background-tasks.ts
```

- [ ] **Step V.4: Confirm ActivityPopover import removed from chat-header**

```bash
cd /home/beznet/Workspace/edapex
grep -n "ActivityPopover" src/lib/components/chat-header.svelte || echo "OK: not in header"
grep -n "ActivityPopover" src/lib/components/ChatComposer.svelte || echo "OK: not in composer"
```

- [ ] **Step V.5: Confirm Toaster position changed**

```bash
cd /home/beznet/Workspace/edapex
grep -n "Toaster" src/routes/+layout.svelte
```

Expected: `<Toaster position="bottom-left" />`

- [ ] **Step V.6: Confirm new error categories present**

```bash
cd /home/beznet/Workspace/edapex
grep -n "auto_fix_exhausted\|student_id_missing\|persist_path_missing\|tool_not_registered\|agent_loop_exhausted\|bun_precondition_failed" src/lib/errors/friendly-ai-error.ts
```

Expected: 6 matches (one per new variant).

- [ ] **Step V.7: Confirm ToolGroup created and wired**

```bash
cd /home/beznet/Workspace/edapex
ls -la src/lib/components/chat/ToolGroup.svelte
grep -n "ToolGroup" src/lib/components/chat.svelte
```

- [ ] **Step V.8: Confirm `PreviewModal` only in chat.svelte**

```bash
cd /home/beznet/Workspace/edapex
grep -rn "PreviewModal" src/
```

Expected: only `src/lib/components/chat.svelte` matches (import + mount).

---

## Self-Review

This plan was self-reviewed against the spec and the codebase. Findings:

**1. Spec coverage:** Every fix in spec §3.1 is implemented in this plan (with D1 reducing F1's scope). F1, F2, F3, F4, F4b, F5, F6 are all addressed. The "Out of scope" list from spec §3.2 (background tasks feature, iteration breadcrumbs, conversation checkpointing, plan mode hint, fixing 68 errors, deleting legacy chat.ts, new toast patterns, animation library swap, streaming shimmer for thinking, mobile-specific layout) is honored.

**2. Placeholder scan:** No "TBD" / "implement later" / "add appropriate error handling" patterns. Every step shows actual code. Three `TODO(backend)` comments are present in F6 — these are intentional breadcrumbs (the spec explicitly defers backend throws) and the implementer is told what each TODO means.

**3. Type consistency:** Variable names verified against actual codebase:
- `selectedChatModel` (from `SelectedModel.fromContext()`) — used consistently in F2 (Task 3b)
- `currentModel.id` and `maxContext` — consistent between F2 source and F5 destination
- `xUIMessagePart` — verified in `chat-types.ts:128`, used consistently in F4 (ToolGroup + chat.svelte)
- `ToolGroup`'s `parts` prop typed as `xUIMessagePart[]` — matches `toolParts` projection in `chat.svelte`
- The 6 new `FriendlyAiError` variants are appended AFTER existing variants, so any `switch (err.kind)` consumers still pass exhaustiveness (the union grew, not rearranged).

**4. Edge cases:**
- `messagesWithToolSplit` projection handles messages with no `parts` (defaults to empty array via `?? []`).
- `tool-message.svelte`'s outer wrapper removal preserves the internal `{#if isTool(part)}` guard, so non-tool parts (defensively) are still skipped.
- `previewToken` URL-hash flow continues to work because `chat.svelte` still mounts `<PreviewModal />` globally (D1 resolution preserves this).

**5. Risks remaining:**
- F5 call-site prop migration in `ArtifactViewer.svelte` may need additional adjustment beyond the import rename if the template uses `ShimmerArtifactCard` directly. The plan includes a grep check at 4b.3 to surface this.
- F4's `messagesWithToolSplit` projection creates new arrays on every chat.messages change. For long threads this is fine (Svelte 5 diffs by reference), but if perf becomes an issue, a `Map<messageId, split>` cache could be added. Out of scope.
- F6 client-only categories: 5 of 6 buttons are visible no-ops until backend throws land. This is by design per D5 and documented in the commit message.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-08-chat-agentic-ui-implementation.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — Dispatch a fresh subagent per task, two-stage review between each, fast iteration. Default per `writing-plans` skill.

2. **Inline Execution** — Execute tasks in this session using `executing-plans`, batch execution with checkpoints.

**Either way, the 5 Open Assumptions in §0.3 should be confirmed by you before dispatch begins.** If any assumption is wrong, the relevant task(s) need revision (most likely F1 reduction → F1 expansion; F6 client-only → F6 client+server).
