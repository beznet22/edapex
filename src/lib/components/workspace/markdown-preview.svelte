<script lang="ts">
	import { Streamdown } from "svelte-streamdown";
	import LoadingState from "./loading-state.svelte";
    import { Markdown } from "../prompt-kit/markdown";

	let {
		content = "",
		url = "",
		filename = "",
	}: { content?: string; url?: string; filename?: string } = $props();

	let fetched = $state<string | null>(null);
	let loading = $state(false);
	let error = $state<string | null>(null);

	$effect(() => {
		const c = content;
		const u = url;
		if (c) {
			fetched = null;
			loading = false;
			error = null;
			return;
		}
		if (!u) {
			fetched = null;
			loading = false;
			error = null;
			return;
		}
		let cancelled = false;
		loading = true;
		error = null;
		fetched = null;
		const timeoutId = setTimeout(() => {
			if (!cancelled) {
				error = "Request timed out";
				loading = false;
			}
		}, 10000);
		fetch(u)
			.then((r) => {
				if (!r.ok) throw new Error(`HTTP ${r.status}`);
				return r.text();
			})
			.then((t) => {
				clearTimeout(timeoutId);
				if (cancelled) return;
				fetched = t;
				loading = false;
			})
			.catch((e) => {
				clearTimeout(timeoutId);
				if (cancelled) return;
				error = e instanceof Error ? e.message : String(e);
				loading = false;
			});
		return () => {
			cancelled = true;
			clearTimeout(timeoutId);
		};
	});

	const resolved = $derived(content || fetched || "");
	const isMarkdown = $derived(
		filename.toLowerCase().endsWith(".md") || filename.toLowerCase().endsWith(".markdown"),
	);
</script>

{#if loading}
	<LoadingState />
{:else if error}
	<div class="text-rose-500 text-sm py-4">Failed to load: {error}</div>
{:else if isMarkdown}
		<Markdown content={resolved} />
{:else}
	<pre
		class="text-[12px] font-mono leading-relaxed whitespace-pre-wrap wrap-break-word text-foreground/90 bg-muted/30 rounded-lg p-4 border border-border/40"
	>{resolved}</pre>
{/if}
