<script lang="ts">
	import { onMount } from "svelte";
	import { page } from "$app/state";
	import { normalizeMarkdown } from "$lib/components/editor/markdown-normalize";
	import WysiwygEditor from "$lib/components/editor/WysiwygEditor.svelte";

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
</div>
