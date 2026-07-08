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
