<script lang="ts">
	import type { Artifact } from "$lib/types/workspace-types";
	import { Button } from "$lib/components/ui/button";
	import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
	import * as Tooltip from "$lib/components/ui/tooltip";
	import * as AlertDialog from "$lib/components/ui/alert-dialog";
	import { ScrollArea } from "$lib/components/ui/scroll-area";
	import { cn } from "$lib/utils/shadcn";
	import FileIcon from "@lucide/svelte/icons/file";
	import FileTextIcon from "@lucide/svelte/icons/file-text";
	import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
	import CheckIcon from "@lucide/svelte/icons/check";
	import SaveIcon from "@lucide/svelte/icons/save";
	import CopyIcon from "@lucide/svelte/icons/copy";
	import DownloadIcon from "@lucide/svelte/icons/download";
	import MoreHorizontalIcon from "@lucide/svelte/icons/more-horizontal";
	import Share2Icon from "@lucide/svelte/icons/share-2";
	import PrinterIcon from "@lucide/svelte/icons/printer";
	import Trash2Icon from "@lucide/svelte/icons/trash-2";
	import FileQuestionIcon from "@lucide/svelte/icons/file-question";
	import ArrowLeftIcon from "@lucide/svelte/icons/arrow-left";
	import EditorCanvas from "./editor-canvas.svelte";
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

	const viewingId = $derived(activeId ?? artifacts[0]?.id ?? null);
	const current = $derived(artifacts.find((a) => a.id === viewingId) ?? null);
	const isStreaming = $derived(current?.status === "processing" || current?.status === "streaming");

	$effect(() => {
		console.log('[ArtifactViewer] current artifact', { ts: performance.now(), id: current?.id, status: current?.status, contentLength: current?.content?.length });
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

	async function handleShare() {
		if (!current?.url) return;
		const relPath = current.url.replace("/api/file/", "");
		const wsIdx = (current.id ?? "").indexOf("exams/");
		const workspace = wsIdx !== -1 ? (current.id ?? "").slice(0, wsIdx - 1) : "";
		try {
			const res = await fetch("/api/file/share", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ key: relPath, workspace }),
			});
			if (!res.ok) throw new Error("Share failed");
			const data = await res.json();
			if (data.url) {
				await navigator.clipboard.writeText(data.url);
				import("svelte-sonner").then((m) => m.toast.success("Share link copied to clipboard"));
			}
		} catch {
			import("svelte-sonner").then((m) => m.toast.error("Failed to generate share link"));
		}
	}

	function handlePrint() {
		if (!current?.content) return;
		const win = window.open("", "_blank");
		if (!win) return;
		win.document.write(`<!DOCTYPE html><html><head><title>${current.title}</title></head><body>${current.content}</body></html>`);
		win.document.close();
		win.focus();
		win.print();
	}

	let deleteOpen = $state(false);

	async function handleDelete() {
		if (!current?.url) return;
		try {
			const res = await fetch(current.url, { method: "DELETE" });
			if (!res.ok) throw new Error("Delete failed");
			inspector.close();
		} catch {
			import("svelte-sonner").then((m) => m.toast.error("Failed to delete file"));
		}
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
								onclick={() => inspector.openChatArtifact(artifact.id)}
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

				<DropdownMenu.Root>
					<DropdownMenu.Trigger>
						{#snippet child({ props })}
							<Button
								{...props}
								variant="ghost"
								size="icon"
								class="size-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/40"
							>
								<MoreHorizontalIcon class="size-4" />
							</Button>
						{/snippet}
					</DropdownMenu.Trigger>
					<DropdownMenu.Content align="end" class="w-44 bg-popover backdrop-blur-xl border border-border/60 rounded-xl shadow-2xl">
						<DropdownMenu.Item onclick={handleSave}>
							<SaveIcon class="size-3.5 mr-2" />
							Save
						</DropdownMenu.Item>
						<DropdownMenu.Item onclick={handleShare}>
							<Share2Icon class="size-3.5 mr-2" />
							Share
						</DropdownMenu.Item>
						<DropdownMenu.Item onclick={handlePrint}>
							<PrinterIcon class="size-3.5 mr-2" />
							Print
						</DropdownMenu.Item>
						<DropdownMenu.Separator />
						<DropdownMenu.Item onclick={() => (deleteOpen = true)} class="text-destructive focus:text-destructive">
							<Trash2Icon class="size-3.5 mr-2" />
							Delete
						</DropdownMenu.Item>
					</DropdownMenu.Content>
				</DropdownMenu.Root>
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
			<EditorCanvas
				bind:this={editorRef}
				editorMode="wysiwyg"
				filename={current.title}
				url={current.url ?? ""}
				saveUrl={current.saveUrl ?? current.url}
				content={current.content ?? ""}
				type="text"
				streaming={isStreaming}
				user={user}
			/>
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

<AlertDialog.Root bind:open={deleteOpen}>
	<AlertDialog.Content>
		<AlertDialog.Header>
			<AlertDialog.Title>Delete this file?</AlertDialog.Title>
			<AlertDialog.Description>
				This action cannot be undone.
			</AlertDialog.Description>
		</AlertDialog.Header>
		<AlertDialog.Footer>
			<AlertDialog.Cancel>Cancel</AlertDialog.Cancel>
			<AlertDialog.Action onclick={handleDelete}>Delete</AlertDialog.Action>
		</AlertDialog.Footer>
	</AlertDialog.Content>
</AlertDialog.Root>
