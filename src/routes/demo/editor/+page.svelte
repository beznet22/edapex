<script lang="ts">
	import { onMount } from "svelte";
	import { page } from "$app/state";
	import { normalizeMarkdown } from "$lib/components/editor/markdown-normalize";
	import WysiwygEditor from "$lib/components/editor/WysiwygEditor.svelte";

	let pathInput = $state("marksheets/adakole_jpg-0adbef75.md");
	let activePath = $state<string | null>(null);
	let rawMarkdown = $state("");
	let editorMarkdown = $state("");
	let editable = $state(true);
	let showJson = $state(false);
	let showDiagnostics = $state(true);
	let loadError = $state<string | null>(null);
	let loading = $state(false);
	let lastHttpStatus = $state<number | null>(null);
	let renderError = $state<string | null>(null);
	type LogEntry = { ts: string; level: "info" | "warn" | "error"; msg: string };
	let eventLog = $state<LogEntry[]>([]);

	function log(level: LogEntry["level"], msg: string): void {
		const ts = new Date().toISOString().slice(11, 23);
		eventLog = [...eventLog, { ts, level, msg }].slice(-200);
		console[level === "error" ? "error" : level === "warn" ? "warn" : "log"](
			"[demo]",
			msg,
		);
	}

	const bytes = $derived(new Blob([rawMarkdown]).size);
	const lines = $derived(rawMarkdown ? rawMarkdown.split("\n").length : 0);
	const tableRows = $derived(
		rawMarkdown
			? rawMarkdown.split("\n").filter((l) => /^\s*\|/.test(l)).length
			: 0,
	);
	const normalizedEqual = $derived(
		normalizeMarkdown(rawMarkdown) === normalizeMarkdown(editorMarkdown),
	);

	async function loadFile(path: string): Promise<void> {
		const trimmed = path.trim();
		log("info", `loadFile called path="${trimmed}"`);
		if (!trimmed) {
			log("warn", "loadFile: empty path, bailing");
			return;
		}
		loading = true;
		loadError = null;
		renderError = null;
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 10_000);
		const url = `/api/file/${encodeURIComponent(trimmed).replace(/%2F/g, "/")}`;
		log("info", `loadFile: fetching ${url}`);
		try {
			const res = await fetch(url, { signal: controller.signal });
			lastHttpStatus = res.status;
			log("info", `loadFile: response status=${res.status}`);
			if (!res.ok) {
				const body = await res.text().catch(() => "");
				loadError = `Failed to load ${trimmed}: HTTP ${res.status} — ${body || "(empty body)"}`;
				log("error", `loadFile: HTTP error ${loadError}`);
				return;
			}
			const text = await res.text();
			log("info", `loadFile: success bytes=${text.length}`);
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
			log("error", `loadFile: exception ${loadError}`);
		} finally {
			clearTimeout(timeoutId);
			loading = false;
		}
	}

	function handleEditorUpdate(markdown: string): void {
		log("info", `handleEditorUpdate bytes=${markdown.length}`);
		editorMarkdown = markdown;
	}

	function handleLoadClick(): void {
		void loadFile(pathInput);
	}

	function handleReloadClick(): void {
		if (activePath) void loadFile(activePath);
	}

	function previewSnippet(s: string, max = 80): string {
		const oneLine = s.replace(/\n/g, "\\n");
		return oneLine.length > max ? `${oneLine.slice(0, max)}...` : oneLine;
	}

	const diagnosticText = $derived.by(() => {
		const snapshot: string[] = [
			"=== DIAGNOSTIC SNAPSHOT ===",
			`timestamp: ${new Date().toISOString()}`,
			`activePath: ${activePath ?? "(none)"}`,
			`pathInput: ${pathInput}`,
			`lastHttpStatus: ${lastHttpStatus ?? "(none)"}`,
			`loadError: ${loadError ?? "(none)"}`,
			`renderError: ${renderError ?? "(none)"}`,
			`rawMarkdown bytes: ${rawMarkdown.length}`,
			`rawMarkdown first 120: ${previewSnippet(rawMarkdown, 120)}`,
			`rawMarkdown last 80: ${previewSnippet(rawMarkdown.slice(-80), 80)}`,
			`editorMarkdown bytes: ${editorMarkdown.length}`,
			`editorMarkdown first 120: ${previewSnippet(editorMarkdown, 120)}`,
			`round-trip stable: ${normalizedEqual}`,
			`newlines: ${lines}`,
			`tableRows: ${tableRows}`,
			``,
			`=== EVENT LOG (${eventLog.length} entries) ===`,
		];
		for (const e of eventLog) {
			snapshot.push(`[${e.ts}] ${e.level.padEnd(5)} ${e.msg}`);
		}
		return snapshot.join("\n");
	});

	function handleKeydown(e: KeyboardEvent): void {
		if (e.key === "Enter" && !e.shiftKey) {
			e.preventDefault();
			handleLoadClick();
		}
	}

	onMount(() => {
		log("info", "page mounted");
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
		<label
			for="demo-path"
			class="text-xs font-medium text-muted-foreground shrink-0"
		>
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
		<label
			class="flex items-center gap-2 text-xs text-muted-foreground shrink-0"
		>
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
				class="flex-1 min-h-0 overflow-auto p-4 text-xs font-mono leading-relaxed whitespace-pre-wrap break-words">{rawMarkdown ||
					"(empty)"}</pre>
		</section>

		<section class="min-h-0 flex flex-col" aria-label="Rendered editor">
			<div
				class="px-4 py-2 text-[10px] font-semibold tracking-widest uppercase text-muted-foreground border-b border-border/40"
			>
				Rendered
			</div>
			<div class="flex-1 min-h-0">
				{#if rawMarkdown}
					<svelte:boundary
						onerror={(e) => {
							renderError = e instanceof Error ? e.message : String(e);
							log("error", `WysiwygEditor render error: ${renderError}`);
						}}
					>
						<WysiwygEditor
							content={rawMarkdown}
							onUpdate={handleEditorUpdate}
							{editable}
							class="h-full"
						/>

						{#snippet failed(error, reset)}
							<div
								class="h-full flex flex-col items-center justify-center text-center px-6 gap-2"
							>
								<p class="text-xs font-semibold text-destructive">
									Editor render failed
								</p>
								<p
									class="text-[10px] font-mono text-muted-foreground max-w-md break-words whitespace-pre-wrap"
								>
									{error instanceof Error ? error.message : String(error)}
								</p>
								<button
									type="button"
									onclick={() => {
										reset();
										renderError = null;
									}}
									class="h-7 px-3 rounded border border-input text-xs font-medium hover:bg-muted/40"
								>
									Retry render
								</button>
							</div>
						{/snippet}
					</svelte:boundary>
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

	<footer
		class="border-t border-border/60 px-4 py-2 flex items-center gap-4 text-[10px] font-mono text-muted-foreground shrink-0 flex-wrap"
	>
		<span>bytes: <strong class="text-foreground">{bytes}</strong></span>
		<span>lines: <strong class="text-foreground">{lines}</strong></span>
		<span
			>table rows: <strong class="text-foreground">{tableRows}</strong
			></span
		>
		<span>
			round-trip: <strong
				class={normalizedEqual ? "text-foreground" : "text-destructive"}
			>
				{normalizedEqual ? "stable" : "differs"}
			</strong>
		</span>
		<span>
			path: <strong class="text-foreground"
				>{activePath ?? "(none)"}</strong
			>
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
		<button
			type="button"
			onclick={() => (showDiagnostics = !showDiagnostics)}
			class="h-6 px-2 rounded border border-input text-[10px] font-medium hover:bg-muted/40"
		>
			{showDiagnostics ? "Hide diag" : "Show diag"}
		</button>
	</footer>

	{#if showJson}
		<aside
			class="border-t border-border/60 max-h-64 overflow-auto bg-muted/20 px-4 py-2"
		>
			<pre
				class="text-[10px] font-mono leading-relaxed whitespace-pre-wrap break-words">{editorMarkdown}</pre>
		</aside>
	{/if}

	{#if showDiagnostics}
		<aside
			class="border-t border-border/60 max-h-80 overflow-auto bg-muted/10 px-4 py-3"
		>
			<div class="flex items-center justify-between mb-2">
				<strong class="text-[10px] font-bold tracking-widest uppercase">
					Diagnostic log ({eventLog.length} entries)
				</strong>
				<div class="flex gap-1">
					<button
						type="button"
						onclick={() => {
							navigator.clipboard.writeText(diagnosticText);
							log("info", "diagnostic text copied to clipboard");
						}}
						class="h-6 px-2 rounded border border-input text-[10px] font-medium hover:bg-muted/40"
					>
						Copy diagnostics
					</button>
					<button
						type="button"
						onclick={() => {
							eventLog = [];
							log("info", "event log cleared");
						}}
						class="h-6 px-2 rounded border border-input text-[10px] font-medium hover:bg-muted/40"
					>
						Clear log
					</button>
					<button
						type="button"
						onclick={() => (showDiagnostics = false)}
						class="h-6 px-2 rounded border border-input text-[10px] font-medium hover:bg-muted/40"
					>
						Hide
					</button>
				</div>
			</div>
			<pre
				class="text-[10px] font-mono leading-relaxed whitespace-pre-wrap break-words">{diagnosticText}</pre>
		</aside>
	{/if}
</div>
