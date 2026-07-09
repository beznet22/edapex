# Demo Editor Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a `/demo/editor` route that loads any `.md` file from the workspace and renders it side-by-side as raw markdown and in the real `WysiwygEditor` (Tiptap), to isolate whether the streaming-→-editor switch bug lives in Tiptap parsing or in `ArtifactViewer.svelte`.

**Architecture:** Single SvelteKit route. Public, `ssr=false`, `prerender=false`. Side-by-side CSS grid (stacks below 768 px). Reads `?file=` URL param, fetches via existing `/api/file/[...path]` GET, passes content directly to `WysiwygEditor` (no wrapper, no chat/inspector context). No PUT/save.

**Tech Stack:** SvelteKit 2, Svelte 5 runes, Tiptap via `WysiwygEditor.svelte`, shadcn-svelte UI primitives, lucide-svelte icons.

**Spec:** `docs/superpowers/specs/2026-07-08-editor-rendering-isolation-design.md`

---

## File Structure

| File | Responsibility |
|---|---|
| `src/routes/demo/editor/+page.ts` | SvelteKit page module: `ssr=false`, `prerender=false` |
| `src/routes/demo/editor/+page.svelte` | The page: state, fetch logic, markup, styles |

No modifications to any other file. No new dependencies. No changes to `WysiwygEditor`, `editor-canvas`, contexts, API routes, or styles.

---

## Task 1: Create the SSR config module

**Files:**
- Create: `src/routes/demo/editor/+page.ts`

- [ ] **Step 1: Create the directory**

```bash
mkdir -p src/routes/demo/editor
```

- [ ] **Step 2: Write `+page.ts`**

```ts
// Disables SSR + prerendering so the demo never tries to pre-render or
// server-render the WysiwygEditor instance — it's a client-only playground.
export const ssr = false;
export const prerender = false;
```

- [ ] **Step 3: Verify file exists**

```bash
test -f src/routes/demo/editor/+page.ts && echo OK
```

Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add src/routes/demo/editor/+page.ts
git commit -m "feat(demo): add /demo/editor SSR config (ssr=false, prerender=false)"
```

---

## Task 2: Create the page skeleton with state + fetch logic

**Files:**
- Create: `src/routes/demo/editor/+page.svelte`

- [ ] **Step 1: Write the skeleton**

```svelte
<script lang="ts">
	import { onMount } from "svelte";
	import { page } from "$app/state";
	import { normalizeMarkdown } from "$lib/components/editor/markdown-normalize";

	let pathInput = $state("");
	let activePath = $state<string | null>(null);
	let rawMarkdown = $state("");
	let editorMarkdown = $state("");
	let editable = $state(true);
	let showJson = $state(false);
	let loadError = $state<string | null>(null);
	let loading = $state(false);

	const bytes = $derived(new Blob([rawMarkdown]).size);
	const lines = $derived(rawMarkdown ? rawMarkdown.split("\n").length : 0);
	const tableRows = $derived(
		rawMarkdown ? rawMarkdown.split("\n").filter((l) => /^\s*\|/.test(l)).length : 0,
	);
	const normalizedEqual = $derived(
		normalizeMarkdown(rawMarkdown) === normalizeMarkdown(editorMarkdown),
	);

	async function loadFile(path: string): Promise<void> {
		const trimmed = path.trim();
		if (!trimmed) return;
		loading = true;
		loadError = null;
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 10_000);
		try {
			const res = await fetch(
				`/api/file/${encodeURIComponent(trimmed).replace(/%2F/g, "/")}`,
				{ signal: controller.signal },
			);
			if (!res.ok) {
				const body = await res.text().catch(() => "");
				loadError = `Failed to load ${trimmed}: HTTP ${res.status} — ${body || "(empty body)"}`;
				return;
			}
			const text = await res.text();
			rawMarkdown = text;
			editorMarkdown = text;
			activePath = trimmed;
			pathInput = trimmed;
		} catch (err) {
			if (err instanceof DOMException && err.name === "AbortError") {
				loadError = `Request timed out after 10 s: ${trimmed}`;
			} else {
				const msg = err instanceof Error ? err.message : String(err);
				loadError = `Network error: ${msg}`;
			}
		} finally {
			clearTimeout(timeoutId);
			loading = false;
		}
	}

	function handleEditorUpdate(markdown: string): void {
		editorMarkdown = markdown;
	}

	function handleLoadClick(): void {
		void loadFile(pathInput);
	}

	function handleReloadClick(): void {
		if (activePath) void loadFile(activePath);
	}

	function handleKeydown(e: KeyboardEvent): void {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			handleLoadClick();
		}
	}

	onMount(() => {
		const initial = page.url.searchParams.get("file");
		if (initial) {
			pathInput = initial;
			void loadFile(initial);
		}
	});
</script>

<!-- Markup added in Task 3 -->
```

- [ ] **Step 2: Verify file exists**

```bash
test -f src/routes/demo/editor/+page.svelte && echo OK
```

Expected: `OK`

- [ ] **Step 3: Typecheck**

Run: `pnpm run svelte-check --workspace src/routes/demo/editor/+page.svelte`
Expected: 0 errors (warnings about unused state vars `editable`, `showJson` are OK — those get used in Tasks 3–4)

- [ ] **Step 4: Commit**

```bash
git add src/routes/demo/editor/+page.svelte
git commit -m "feat(demo): add /demo/editor page skeleton with state + fetch logic"
```

---

## Task 3: Add toolbar markup

**Files:**
- Modify: `src/routes/demo/editor/+page.svelte` (replace the `<!-- Markup added in Task 3 -->` comment)

- [ ] **Step 1: Append toolbar + error banner markup**

Replace the line:

```svelte
<!-- Markup added in Task 3 -->
```

with:

```svelte
<div class="min-h-screen bg-background text-foreground flex flex-col">
	<header
		class="flex items-center gap-2 px-4 py-3 border-b border-border/60 shrink-0"
	>
		<label for="demo-path" class="text-xs font-medium text-muted-foreground shrink-0">
			File path
		</label>
		<input
			id="demo-path"
			type="text"
			bind:value={pathInput}
			onkeydown={handleKeydown}
			placeholder="marksheets/adakole_jpg-0adbef75.md"
			class="flex-1 min-w-0 h-8 px-2 rounded-md border border-input bg-background text-xs font-mono focus:outline-none focus:ring-2 focus:ring-ring"
		/>
		<button
			type="button"
			onclick={handleLoadClick}
			disabled={loading}
			class="h-8 px-3 rounded-md bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-50"
		>
			{loading ? "Loading…" : "Load"}
		</button>
		<button
			type="button"
			onclick={handleReloadClick}
			disabled={!activePath || loading}
			class="h-8 px-3 rounded-md border border-input text-xs font-medium hover:bg-muted/40 disabled:opacity-50"
		>
			Reload
		</button>
		<label class="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
			<input type="checkbox" bind:checked={editable} class="size-3.5" />
			editable
		</label>
	</header>

	{#if loadError}
		<div
			role="alert"
			class="px-4 py-2 bg-destructive/10 border-b border-destructive/40 text-destructive text-xs font-mono"
		>
			{loadError}
		</div>
	{/if}

	<!-- Pane grid + diagnostics added in Tasks 4 & 5 -->
</div>
```

- [ ] **Step 2: Typecheck**

Run: `pnpm run svelte-check --workspace src/routes/demo/editor/+page.svelte`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add src/routes/demo/editor/+page.svelte
git commit -m "feat(demo): add toolbar with file input, Load, Reload, editable toggle"
```

---

## Task 4: Add the raw markdown + rendered panes

**Files:**
- Modify: `src/routes/demo/editor/+page.svelte` (replace `<!-- Pane grid + diagnostics added in Tasks 4 & 5 -->`)

- [ ] **Step 1: Add imports + pane markup**

First, add this import to the `<script>` block (right after the existing `normalizeMarkdown` import):

```ts
	import WysiwygEditor from "$lib/components/editor/WysiwygEditor.svelte";
```

Then replace the comment:

```svelte
<!-- Pane grid + diagnostics added in Tasks 4 & 5 -->
```

with:

```svelte
	<main class="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-2 gap-0">
		<section
			class="border-r border-border/60 min-h-0 flex flex-col"
			aria-label="Raw markdown"
		>
			<div
				class="px-4 py-2 text-[10px] font-semibold tracking-widest uppercase text-muted-foreground border-b border-border/40"
			>
				Raw
			</div>
			<pre
				class="flex-1 min-h-0 overflow-auto p-4 text-xs font-mono leading-relaxed whitespace-pre-wrap break-words"
			>{rawMarkdown || "(empty)"}</pre>
		</section>

		<section
			class="min-h-0 flex flex-col"
			aria-label="Rendered editor"
		>
			<div
				class="px-4 py-2 text-[10px] font-semibold tracking-widest uppercase text-muted-foreground border-b border-border/40"
			>
				Rendered
			</div>
			<div class="flex-1 min-h-0">
				{#if rawMarkdown}
					<WysiwygEditor
						content={rawMarkdown}
						onUpdate={handleEditorUpdate}
						{editable}
						class="h-full"
					/>
				{:else}
					<div
						class="h-full flex items-center justify-center text-xs text-muted-foreground"
					>
						Load a file to render.
					</div>
				{/if}
			</div>
		</section>
	</main>
```

- [ ] **Step 2: Typecheck**

Run: `pnpm run svelte-check --workspace src/routes/demo/editor/+page.svelte`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add src/routes/demo/editor/+page.svelte
git commit -m "feat(demo): add raw + rendered split panes with WysiwygEditor"
```

---

## Task 5: Add diagnostics strip + Show JSON + Copy as markdown

**Files:**
- Modify: `src/routes/demo/editor/+page.svelte` (close the wrapping `<div>` and add diagnostics footer)

- [ ] **Step 1: Add the diagnostics footer**

Find the closing `</main>` tag and add this markup right after it (still inside the wrapping `<div class="min-h-screen ...">` from Task 3, so before its `</div>`):

```svelte
	<footer
		class="border-t border-border/60 px-4 py-2 flex items-center gap-4 text-[10px] font-mono text-muted-foreground shrink-0 flex-wrap"
	>
		<span>bytes: <strong class="text-foreground">{bytes}</strong></span>
		<span>lines: <strong class="text-foreground">{lines}</strong></span>
		<span>table rows: <strong class="text-foreground">{tableRows}</strong></span>
		<span>
			round-trip: <strong class={normalizedEqual ? "text-foreground" : "text-destructive"}>
				{normalizedEqual ? "stable" : "differs"}
			</strong>
		</span>
		<span>
			path: <strong class="text-foreground">{activePath ?? "(none)"}</strong>
		</span>
		<button
			type="button"
			onclick={() => (showJson = !showJson)}
			class="ml-auto h-6 px-2 rounded border border-input text-[10px] font-medium hover:bg-muted/40"
		>
			{showJson ? "Hide JSON" : "Show JSON"}
		</button>
		<button
			type="button"
			onclick={() => navigator.clipboard.writeText(editorMarkdown)}
			disabled={!editorMarkdown}
			class="h-6 px-2 rounded border border-input text-[10px] font-medium hover:bg-muted/40 disabled:opacity-50"
		>
			Copy as markdown
		</button>
	</footer>

	{#if showJson}
		<aside
			class="border-t border-border/60 max-h-64 overflow-auto bg-muted/20 px-4 py-2"
		>
			<pre class="text-[10px] font-mono leading-relaxed whitespace-pre-wrap break-words">{editorMarkdown}</pre>
		</aside>
	{/if}
</div>
```

- [ ] **Step 2: Typecheck**

Run: `pnpm run svelte-check --workspace src/routes/demo/editor/+page.svelte`
Expected: 0 errors

- [ ] **Step 3: Commit**

```bash
git add src/routes/demo/editor/+page.svelte
git commit -m "feat(demo): add diagnostics strip with bytes/lines/table rows/round-trip"
```

---

## Task 6: Smoke test against the corrupted .md

**Files:** none (manual test)

- [ ] **Step 1: Start dev server**

Run: `pnpm run dev` (in background)
Expected: server boots on `http://localhost:5173`

- [ ] **Step 2: Navigate to demo with corrupted file**

Open: `http://localhost:5173/demo/editor?file=marksheets/adakole_jpg-0adbef75.md`
Expected:
- Left pane shows raw markdown
- Right pane shows WysiwygEditor rendering
- Diagnostics strip shows non-zero `bytes`, `lines`, `table rows`
- No console errors in DevTools

- [ ] **Step 3: Verify pass/fail verdict**

| Verdict | What it means |
|---|---|
| The editor renders the corruption the same way the production `<Markdown>` does | Bug is in Tiptap / tiptap-markdown parsing. Fix in `WysiwygEditor.svelte` or `controller.syncExternalContent`. |
| The editor renders the table cleanly (rows align, columns match header) | Bug is in the `ArtifactViewer` switch path. Fix in `ArtifactViewer.svelte` / `chat-context.svelte.ts`. |

Record the verdict in the commit message of the next step.

- [ ] **Step 4: Stop dev server**

Send SIGINT (Ctrl+C).

- [ ] **Step 5: Commit verdict (no code change) if useful**

```bash
git commit --allow-empty -m "chore(demo): verified demo page against adakole_jpg-0adbef75.md — verdict: <PASS|FAIL>"
```

---

## Task 7: Final lint + typecheck pass

**Files:** none (verification only)

- [ ] **Step 1: svelte-check**

Run: `pnpm run svelte-check --workspace src/routes/demo/editor/+page.svelte`
Expected: 0 errors, 0 warnings

- [ ] **Step 2: Lint**

Run: `pnpm run lint src/routes/demo/editor/+page.svelte src/routes/demo/editor/+page.ts`
Expected: exit 0, no output

- [ ] **Step 3: Final commit if any tweaks**

```bash
git add src/routes/demo/editor/
git commit -m "chore(demo): address lint + svelte-check warnings"
```

---

## Acceptance gate

After Task 7, the demo page satisfies the spec's 12 acceptance criteria. The next step is **out of scope for this plan**:

- If the demo verdict (Task 6 Step 3) shows the corruption in the editor: write a followup spec targeting `WysiwygEditor.svelte` / `controller.syncExternalContent`.
- If the demo verdict shows clean editor rendering: write a followup spec targeting `ArtifactViewer.svelte` and the streaming → `<EditorCanvas>` switch path.

Both followups go through their own brainstorm → spec → plan → implementation cycle.
