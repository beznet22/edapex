<script lang="ts">
	import { useChat } from "$lib/context/chat-context.svelte";
	import CheckCircleIcon from "@lucide/svelte/icons/check-circle";
	import XCircleIcon from "@lucide/svelte/icons/x-circle";
	import LoaderCircleIcon from "@lucide/svelte/icons/loader-circle";
	import ArrowRightIcon from "@lucide/svelte/icons/arrow-right";
	import FileTextIcon from "@lucide/svelte/icons/file-text";
	import FileIcon from "@lucide/svelte/icons/file";
	import { cn } from "$lib/utils/shadcn";
	import { Shimmer } from "$lib/components/ai-elements/shimmer";

	type Status = "processing" | "streaming" | "success" | "error";

	let {
		id,
		title,
		status,
		content,
		kind = "document"
	}: {
		id: string;
		title?: string;
		status: Status;
		content?: string;
		kind?: "document" | "pdf";
	} = $props();
	const chat = useChat();

	const stateMeta: Record<Status, { label: string; tone: string }> = {
		processing: { label: "Preparing", tone: "text-amber-400" },
		streaming: { label: "Extracting", tone: "text-primary" },
		success: { label: "Ready", tone: "text-emerald-400" },
		error: { label: "Failed", tone: "text-destructive" }
	};

	let meta = $derived(stateMeta[status] ?? stateMeta.processing);
	let isWorking = $derived(status === "processing" || status === "streaming");
	let byteCount = $derived(content?.length ?? 0);
	let displayTitle = $derived(title ?? (kind === "pdf" ? "PDF" : "Document"));
	const skeletonLength = $derived(kind === "pdf" ? 14 : 18);

	function open(e: MouseEvent | KeyboardEvent) {
		e.preventDefault();
		if (typeof window !== "undefined") {
			window.dispatchEvent(
				new CustomEvent("chat:openArtifact", {
					detail: { id, content: content ?? "", title: displayTitle, status, kind }
				})
			);
		}
	}
</script>

<button
	type="button"
	onclick={open}
	aria-label={`${displayTitle} — ${meta.label}`}
	class={cn(
		"group relative flex items-center gap-3 w-full max-w-[280px] rounded-2xl",
		"border border-primary/20 bg-primary/5 hover:bg-primary/10 hover:border-primary/40",
		"transition-all duration-300 px-3 py-2.5 text-left",
		"shadow-sm hover:shadow-lg hover:shadow-primary/5",
		isWorking && "animate-in fade-in slide-in-from-bottom-1"
	)}
>
	<div
		class="relative size-9 shrink-0 rounded-lg bg-background/40 flex items-center justify-center border border-white/5"
	>
		{#if kind === "pdf"}
			<FileIcon class="size-4 text-rose-300/80" />
		{:else}
			<FileTextIcon class="size-4 text-primary/80" />
		{/if}
		{#if isWorking}
			<div class="absolute inset-0 rounded-lg border-2 border-primary/30 animate-pulse"></div>
		{/if}
	</div>

	<div class="flex-1 min-w-0">
		{#if status === "processing"}
			<Shimmer
				as="div"
				class="text-[12px] font-bold tracking-tight text-foreground"
				spread={2}
				duration={1.4}
				content_length={skeletonLength}
			>
				{#snippet children()}{/snippet}
			</Shimmer>
			<div class="flex items-center gap-1.5 mt-1.5">
				<Shimmer
					as="span"
					class="text-[10px] font-semibold uppercase"
					spread={2}
					duration={1.4}
					content_length={10}
				>
					{#snippet children()}{/snippet}
				</Shimmer>
			</div>
		{:else}
			<div class="text-[12px] font-bold tracking-tight text-foreground truncate">
				{displayTitle}
			</div>
			<div class="flex items-center gap-1.5 mt-0.5">
				{#if isWorking}
					<LoaderCircleIcon class={cn("size-3 animate-spin", meta.tone)} />
				{:else if status === "success"}
					<CheckCircleIcon class={cn("size-3", meta.tone)} />
				{:else if status === "error"}
					<XCircleIcon class={cn("size-3", meta.tone)} />
				{/if}
				<span class={cn("text-[10px] font-semibold tracking-wide uppercase", meta.tone)}>
					{meta.label}
				</span>
				{#if isWorking && byteCount > 0}
					<span class="text-[9px] text-muted-foreground/60 font-mono">
						· {byteCount.toLocaleString()} chars
					</span>
				{/if}
			</div>
		{/if}
	</div>

	<div
		role="button"
		tabindex={-1}
		aria-label="Open in workspace"
		class="size-7 shrink-0 rounded-full flex items-center justify-center bg-primary/10 group-hover:bg-primary/30 border border-primary/30 transition-all"
	>
		<ArrowRightIcon class="size-3.5 text-primary" />
	</div>
</button>
