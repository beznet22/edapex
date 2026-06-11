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
	import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
	import EditorCanvas from "./editor-canvas.svelte";
	import MarkdownPreview from "./markdown-preview.svelte";
	import EditorModeToggle from "$lib/components/editor/EditorModeToggle.svelte";
	import { useInspector } from "$lib/context/inspector-context.svelte";

	let {
		artifacts,
		activeId,
		mode,
		user,
	}: {
		artifacts: Artifact[];
		activeId?: string;
		mode: "chat" | "filestore";
		user?: { designation?: string };
	} = $props();

	const inspector = useInspector();

	let editorRef = $state<{ save: () => Promise<boolean> | void; copy: () => void } | undefined>(
		undefined,
	);
	let editing = $state(false);
	let editorMode = $state<"wysiwyg" | "raw">("wysiwyg");

	const viewingId = $derived(activeId ?? artifacts[0]?.id ?? null);
	const current = $derived(artifacts.find((a) => a.id === viewingId) ?? null);
	const isStreaming = $derived(current?.status === "processing" || current?.status === "streaming");
	const isMarkdown = $derived(
		current
			? current.title.toLowerCase().endsWith(".md") ||
				current.title.toLowerCase().endsWith(".markdown")
			: false,
	);
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
		class="flex items-center justify-between h-12 px-2 sm:px-4 shrink-0 gap-2 min-w-0 w-full"
	>
		<Tooltip.Root>
			<Tooltip.Trigger>
				{#snippet child({ props })}
					<Button
						{...props}
						variant="ghost"
						size="icon"
						class="size-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/40 shrink-0"
						onclick={() => inspector.close()}
						aria-label="Close workspace"
					>
						<ArrowLeftIcon class="size-4" />
					</Button>
				{/snippet}
			</Tooltip.Trigger>
			<Tooltip.Content>Close workspace</Tooltip.Content>
		</Tooltip.Root>

		<div class="flex items-center min-w-0 flex-1 gap-1">
			{#if artifacts.length > 1}
				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props })}
							<Button
								{...props}
								variant="ghost"
								size="sm"
								class="h-8 px-2 text-[13px] font-semibold text-foreground hover:bg-muted/40 hover:text-foreground flex items-center gap-2 min-w-0 max-w-full"
							>
								<FileIcon class="size-4 text-primary/80 shrink-0" />
								<span class="truncate text-left block min-w-0">{current?.title ?? "Untitled"}</span>
								<ChevronDownIcon class="size-3.5 text-muted-foreground shrink-0" />
							</Button>
						{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content
						align="start"
						class="w-64 bg-popover backdrop-blur-xl border border-border/60 rounded-xl shadow-2xl"
									>
						<DropdownMenu.Label class="text-[10px] uppercase tracking-wider text-muted-foreground px-2 py-1.5">
							{mode === "chat" ? "Artifacts in thread" : "Open file"}
						</DropdownMenu.Label>
						{#each artifacts as artifact (artifact.id)}
							<DropdownMenu.Item
								class={cn(
									"text-[12px] font-medium rounded-lg cursor-pointer my-0.5",
									viewingId === artifact.id
										? "bg-primary/15 text-foreground"
										: "text-muted-foreground hover:text-foreground hover:bg-muted/40",
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
					<span class="truncate text-[13px] font-semibold text-foreground">
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
								class="size-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/40"
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
								class="size-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/40"
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
									class="size-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/40"
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

			{#if effectiveEdit && isMarkdown}
				<EditorModeToggle bind:mode={editorMode} />
			{/if}
		</div>
	</header>

	<div class="flex-1 min-h-0 relative group">
		{#if !current}
			<div class="h-full flex flex-col items-center justify-center text-center px-8 opacity-50">
				<FileQuestionIcon class="size-12 text-muted-foreground/40 mb-3" />
				<p class="text-[11px] font-semibold tracking-widest uppercase text-muted-foreground">
					No artifact selected
				</p>
			</div>
		{:else if current.kind === "unsupported"}
			<div class="h-full flex flex-col items-center justify-center text-center px-8">
				<FileQuestionIcon class="size-14 text-muted-foreground/50 mb-4" />
				<p class="text-[13px] font-semibold text-foreground mb-1">{current.title}</p>
				{#if current.size}
					<p class="text-[10px] text-muted-foreground mb-4">{formatSize(current.size)}</p>
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
					bind:editorMode
					filename={current.title}
					url={current.url ?? ""}
					saveUrl={current.saveUrl ?? current.url}
					content={current.content ?? ""}
					type="text"
					streaming={isStreaming}
					user={user}
				/>
			{:else}
				<ScrollArea class="h-full">
					<div class="p-4 sm:p-6 max-w-3xl mx-auto">
						<MarkdownPreview
							content={current.content ?? ""}
							url={current.url ?? ""}
							filename={current.title}
						/>
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

		{#if showEditToggle}
			<Tooltip.Root>
				<Tooltip.Trigger>
					{#snippet child({ props })}
						<button
							{...props}
							type="button"
							onclick={() => (editing = !editing)}
							aria-label={editing ? "Preview" : "Edit"}
							class={cn(
								"absolute bottom-4 right-4 z-30 size-12 rounded-full bg-primary text-primary-foreground shadow-2xl active:scale-95 flex items-center justify-center transition-all duration-200 ease-out",
								editing
									? "opacity-100 scale-100 translate-y-0 hover:opacity-90"
									: "opacity-0 scale-90 translate-y-1 group-hover:opacity-100 group-hover:scale-100 group-hover:translate-y-0 group-focus-within:opacity-100 group-focus-within:scale-100 group-focus-within:translate-y-0 hover:opacity-90",
							)}
						>
							{#if editing}
								<EyeIcon class="size-5" />
							{:else}
								<PencilIcon class="size-5" />
							{/if}
						</button>
					{/snippet}
				</Tooltip.Trigger>
				<Tooltip.Content side="left">{editing ? "Preview" : "Edit"}</Tooltip.Content>
			</Tooltip.Root>
		{/if}
	</div>
</div>
