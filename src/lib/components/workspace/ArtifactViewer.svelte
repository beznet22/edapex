<script lang="ts">
	import type { Artifact } from "$lib/types/workspace-types";
	import { Button } from "$lib/components/ui/button";
	import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
	import * as Tooltip from "$lib/components/ui/tooltip";
	import { ScrollArea } from "$lib/components/ui/scroll-area";
	import { cn } from "$lib/utils/shadcn";
	import FileIcon from "@lucide/svelte/icons/file";
	import FileTextIcon from "@lucide/svelte/icons/file-text";
	import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
	import CheckIcon from "@lucide/svelte/icons/check";
	import SaveIcon from "@lucide/svelte/icons/save";
	import CopyIcon from "@lucide/svelte/icons/copy";
	import DownloadIcon from "@lucide/svelte/icons/download";
	import PencilIcon from "@lucide/svelte/icons/pencil";
	import EyeIcon from "@lucide/svelte/icons/eye";
	import FileQuestionIcon from "@lucide/svelte/icons/file-question";
	import EditorCanvas from "./editor-canvas.svelte";
	import MarkdownPreview from "./markdown-preview.svelte";

	let {
		artifacts,
		activeId,
		mode,
	}: {
		artifacts: Artifact[];
		activeId?: string;
		mode: "chat" | "filestore";
	} = $props();

	let editorRef = $state<{ save: () => Promise<boolean> | void; copy: () => void } | undefined>(
		undefined,
	);
	let editing = $state(false);

	const viewingId = $derived(activeId ?? artifacts[0]?.id ?? null);
	const current = $derived(artifacts.find((a) => a.id === viewingId) ?? null);
	const isStreaming = $derived(current?.status === "processing" || current?.status === "streaming");
	const showEditToggle = $derived(current?.kind === "document" && !isStreaming);
	const effectiveEdit = $derived(showEditToggle && editing);

	$effect(() => {
		if (!showEditToggle && editing) editing = false;
	});

	async function handleSave() {
		if (editorRef) {
			await editorRef.save();
		}
	}

	function handleCopy() {
		if (editorRef) {
			editorRef.copy();
		} else if (current?.content) {
			navigator.clipboard.writeText(current.content);
		}
	}

	function handleDownload() {
		if (!current?.url) return;
		const a = document.createElement("a");
		a.href = current.url + (current.url.includes("?") ? "&" : "?") + "action=download";
		a.download = current.title;
		document.body.appendChild(a);
		a.click();
		document.body.removeChild(a);
	}

	function formatSize(bytes?: number): string {
		if (!bytes) return "";
		const k = 1024;
		if (bytes < k) return bytes + " B";
		if (bytes < k * k) return (bytes / k).toFixed(1) + " KB";
		return (bytes / (k * k)).toFixed(1) + " MB";
	}
</script>

<div class="flex flex-col h-full min-h-0 bg-background">
	<header
		class="flex items-center justify-between h-12 px-2 sm:px-4 shrink-0 gap-2 min-w-0 w-full border-b border-white/5"
	>
		<div class="flex items-center min-w-0 flex-1 gap-1">
			{#if artifacts.length > 1}
				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props })}
							<Button
								{...props}
								variant="ghost"
								size="sm"
								class="h-8 px-2 text-[13px] font-semibold text-white/90 hover:bg-white/5 hover:text-white flex items-center gap-2 min-w-0 max-w-full"
							>
								<FileIcon class="size-4 text-primary/80 shrink-0" />
								<span class="truncate text-left block min-w-0">{current?.title ?? "Untitled"}</span>
								<ChevronDownIcon class="size-3.5 text-white/40 shrink-0" />
							</Button>
						{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content
						align="start"
						class="w-64 bg-slate-950/95 backdrop-blur-xl border-white/10 rounded-xl shadow-2xl"
									>
						<DropdownMenu.Label class="text-[10px] uppercase tracking-wider text-white/40 px-2 py-1.5">
							{mode === "chat" ? "Artifacts in thread" : "Open file"}
						</DropdownMenu.Label>
						{#each artifacts as artifact (artifact.id)}
							<DropdownMenu.Item
								class={cn(
									"text-[12px] font-medium rounded-lg cursor-pointer my-0.5",
									viewingId === artifact.id
										? "bg-primary/20 text-white"
										: "text-white/60 hover:text-white hover:bg-white/5",
								)}
								onclick={() => {
									editing = false;
								}}
							>
								<FileTextIcon class="size-3 mr-2 shrink-0" />
								<span class="truncate">{artifact.title}</span>
								{#if viewingId === artifact.id}
									<CheckIcon class="size-3 ml-auto text-primary shrink-0" />
								{/if}
							</DropdownMenu.Item>
						{/each}
					</DropdownMenu.Content>
				</DropdownMenu.Root>
			{:else}
				<div class="flex items-center gap-2 min-w-0 px-2">
					<FileIcon class="size-4 text-primary/80 shrink-0" />
					<span class="truncate text-[13px] font-semibold text-white/90">
						{current?.title ?? "Untitled"}
					</span>
				</div>
			{/if}
		</div>

		<div class="flex items-center gap-1 shrink-0">
			{#if current && !isStreaming}
				<Tooltip.Root>
					<Tooltip.Trigger>
						{#snippet child({ props })}
							<Button
								{...props}
								variant="ghost"
								size="icon"
								class="size-8 rounded-lg text-white/60 hover:text-white hover:bg-white/5"
								onclick={handleSave}
								disabled={!effectiveEdit}
							>
								<SaveIcon class="size-4" />
							</Button>
						{/snippet}
					</Tooltip.Trigger>
					<Tooltip.Content>Save</Tooltip.Content>
				</Tooltip.Root>

				<Tooltip.Root>
					<Tooltip.Trigger>
						{#snippet child({ props })}
							<Button
								{...props}
								variant="ghost"
								size="icon"
								class="size-8 rounded-lg text-white/60 hover:text-white hover:bg-white/5"
								onclick={handleCopy}
							>
								<CopyIcon class="size-4" />
							</Button>
						{/snippet}
					</Tooltip.Trigger>
					<Tooltip.Content>Copy</Tooltip.Content>
				</Tooltip.Root>

				{#if current.url}
					<Tooltip.Root>
						<Tooltip.Trigger>
							{#snippet child({ props })}
								<Button
									{...props}
									variant="ghost"
									size="icon"
									class="size-8 rounded-lg text-white/60 hover:text-white hover:bg-white/5"
									onclick={handleDownload}
								>
									<DownloadIcon class="size-4" />
								</Button>
							{/snippet}
						</Tooltip.Trigger>
						<Tooltip.Content>Download</Tooltip.Content>
					</Tooltip.Root>
				{/if}
			{/if}

			{#if showEditToggle}
				<Tooltip.Root>
					<Tooltip.Trigger>
						{#snippet child({ props })}
							<Button
								{...props}
								variant="ghost"
								size="icon"
								class={cn(
									"size-8 rounded-lg transition-colors",
									editing
										? "text-primary bg-primary/10"
										: "text-white/60 hover:text-white hover:bg-white/5",
								)}
								onclick={() => (editing = !editing)}
							>
								{#if editing}
									<EyeIcon class="size-4" />
								{:else}
									<PencilIcon class="size-4" />
								{/if}
							</Button>
						{/snippet}
					</Tooltip.Trigger>
					<Tooltip.Content>{editing ? "Preview" : "Edit"}</Tooltip.Content>
				</Tooltip.Root>
			{/if}
		</div>
	</header>

	<div class="flex-1 min-h-0 relative">
		{#if !current}
			<div class="h-full flex flex-col items-center justify-center text-center px-8 opacity-50">
				<FileQuestionIcon class="size-12 text-white/30 mb-3" />
				<p class="text-[11px] font-semibold tracking-widest uppercase text-white/60">
					No artifact selected
				</p>
			</div>
		{:else if current.kind === "unsupported"}
			<div class="h-full flex flex-col items-center justify-center text-center px-8">
				<FileQuestionIcon class="size-14 text-white/40 mb-4" />
				<p class="text-[13px] font-semibold text-white/80 mb-1">{current.title}</p>
				{#if current.size}
					<p class="text-[10px] text-white/40 mb-4">{formatSize(current.size)}</p>
				{/if}
				{#if current.url}
					<Button
						variant="outline"
						size="sm"
						class="rounded-full text-xs"
						onclick={handleDownload}
					>
						<DownloadIcon class="size-3.5 mr-2" />
						Download
					</Button>
				{/if}
			</div>
		{:else if current.kind === "document"}
			{#if effectiveEdit}
				<EditorCanvas
					bind:this={editorRef}
					filename={current.title}
					url={current.url ?? ""}
					saveUrl={current.saveUrl ?? current.url}
					content={current.content ?? ""}
					type="text"
					streaming={isStreaming}
				/>
			{:else}
				<ScrollArea class="h-full">
					<div class="p-4 sm:p-6 max-w-3xl mx-auto">
						<MarkdownPreview content={current.content ?? ""} />
						{#if isStreaming}
							<div class="mt-2 inline-flex items-center gap-2 text-[11px] text-primary">
								<span class="size-1.5 rounded-full bg-primary animate-pulse"></span>
								<span class="font-semibold uppercase tracking-wider">Streaming…</span>
							</div>
						{/if}
					</div>
				</ScrollArea>
			{/if}
		{:else if current.kind === "pdf"}
			<EditorCanvas
				filename={current.title}
				url={current.url ?? ""}
				type="pdf"
				streaming={false}
			/>
		{:else if current.kind === "image"}
			<ScrollArea class="h-full">
				<div class="flex items-center justify-center p-4 min-h-full">
					{#if current.url}
						<img
							src={current.url}
							alt={current.title}
							class="max-w-full max-h-full rounded-md shadow-sm"
						/>
					{/if}
				</div>
			</ScrollArea>
		{/if}
	</div>
</div>
