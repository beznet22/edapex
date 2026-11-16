<script lang="ts">
	import { Button } from "$lib/components/ui/button";
	import { ScrollArea } from "$lib/components/ui/scroll-area";
	import FileIcon from "@lucide/svelte/icons/file";
	import FileTextIcon from "@lucide/svelte/icons/file-text";
	import FileImageIcon from "@lucide/svelte/icons/file-image";
	import BookTextIcon from "@lucide/svelte/icons/book-text";
	import FolderIcon from "@lucide/svelte/icons/folder";
	import type { Artifact } from "$lib/types/workspace-types";

	let {
		onSelect,
	}: {
		onSelect: (key: string, artifact: Artifact) => void;
	} = $props();

	type FileEntry = { name: string; type: "file" | "directory"; key: string; size?: number };

	let entries = $state<FileEntry[]>([]);
	let loading = $state(true);
	let error = $state<string | null>(null);
	let termDirectory = $state<string | null>(null);

	async function load() {
		loading = true;
		error = null;
		try {
			const res = await fetch("/api/file/exams/?action=list&recursive=true");
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const data = await res.json();
			const raw: FileEntry[] = data?.result?.items ?? [];
			const termDirs = new Set<string>();
			const files = raw.filter((entry) => {
				if (entry.type === "file") return true;
				if (entry.name.startsWith("examType-")) {
					termDirs.add(entry.name);
					return false;
				}
				return false;
			});
			termDirectory = Array.from(termDirs)[0] ?? null;
			entries = files;
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		load();
	});

	function fileIcon(name: string) {
		const ext = name.split(".").pop()?.toLowerCase() ?? "";
		if (["md", "markdown", "txt"].includes(ext)) return BookTextIcon;
		if (["png", "jpg", "jpeg", "svg", "webp", "gif", "avif", "bmp"].includes(ext)) return FileImageIcon;
		if (["pdf"].includes(ext)) return FileTextIcon;
		return FileIcon;
	}

	function deriveKindFromName(name: string): Artifact["kind"] {
		const ext = name.split(".").pop()?.toLowerCase() ?? "";
		if (ext === "pdf") return "pdf";
		if (["png", "jpg", "jpeg", "svg", "webp", "gif", "bmp", "avif"].includes(ext)) return "image";
		if (["md", "markdown", "txt", "json", "csv", "xml", "yaml", "yml", "tsv", "log"].includes(ext))
			return "document";
		return "unsupported";
	}

	function handleSelect(entry: FileEntry) {
		const key = entry.key;
		const artifact: Artifact = {
			id: key,
			title: entry.name,
			kind: deriveKindFromName(entry.name),
			url: `/api/file/${key}`,
			saveUrl: `/api/file/${key}`,
			size: entry.size,
		};
		onSelect(key, artifact);
	}
</script>

<div class="flex flex-col h-full bg-popover">
	<header class="flex items-center px-4 py-3 border-b border-border/60 shrink-0 gap-2">
		<FolderIcon class="size-4 text-primary/80 shrink-0" />
		<span class="text-[11px] font-bold text-foreground/70">
			{termDirectory ?? "Thread artifacts"}
		</span>
	</header>

	<ScrollArea class="flex-1">
		{#if loading}
			<div class="px-4 py-8 text-center text-[11px] text-muted-foreground">Loading…</div>
		{:else if error}
			<div class="px-4 py-8 text-center text-[11px] text-rose-400">{error}</div>
		{:else if entries.length === 0}
			<div class="flex flex-col items-center justify-center h-full text-center px-8 opacity-30 py-12">
				<FileTextIcon class="size-12 mb-4 text-muted-foreground/50" />
				<p class="text-[12px] font-black tracking-widest uppercase text-foreground mb-2">
					No artifacts yet
				</p>
				<p class="text-[10px] font-bold text-muted-foreground leading-relaxed max-w-[200px]">
					Thread artifacts saved from chat will appear here.
				</p>
			</div>
		{:else}
			<ul class="flex flex-col p-2 gap-1">
				{#each entries as entry (entry.key)}
					{@const Icon = fileIcon(entry.name)}
					<li>
						<Button
							variant="ghost"
							size="sm"
							class="w-full justify-start text-left h-auto py-2 px-3 hover:bg-muted/40"
							onclick={() => handleSelect(entry)}
						>
							<Icon class="size-4 text-primary/80 shrink-0" />
							<span class="truncate text-[12px] font-medium text-foreground flex-1 ml-2">
								{entry.name}
							</span>
						</Button>
					</li>
				{/each}
			</ul>
		{/if}
	</ScrollArea>
</div>
