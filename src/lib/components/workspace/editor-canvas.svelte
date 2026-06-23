<script lang="ts">
	import { ScrollArea } from "$lib/components/ui/scroll-area";
	import WysiwygEditor from "$lib/components/editor/WysiwygEditor.svelte";
	import LoadingState from "./loading-state.svelte";
	import { Markdown } from "$lib/components/prompt-kit/markdown";
	import { Spinner } from "$lib/components/ui/spinner/index.js";
	import AlertCircleIcon from "@lucide/svelte/icons/alert-circle";
	import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";
	import { Button } from "$lib/components/ui/button/index.js";
	import { toast } from "svelte-sonner";
	import { SelectedClass } from "$lib/context/sync.svelte";
	import { useChat } from "$lib/context/chat-context.svelte";
	import { DESIGNATIONS } from "$lib/types/sms-types";

	import { usePdfiumEngine } from "@embedpdf/engines/svelte";
	import { EmbedPDF } from "@embedpdf/core/svelte";
	import { createPluginRegistration } from "@embedpdf/core";
	import {
		ViewportPluginPackage,
		Viewport,
	} from "@embedpdf/plugin-viewport/svelte";
	import {
		Scroller,
		ScrollPluginPackage,
		type RenderPageProps,
	} from "@embedpdf/plugin-scroll/svelte";
	import {
		DocumentManagerPluginPackage,
		DocumentContent,
	} from "@embedpdf/plugin-document-manager/svelte";
	import {
		RenderLayer,
		RenderPluginPackage,
	} from "@embedpdf/plugin-render/svelte";

	let {
		filename = "",
		url = "",
		saveUrl = "",
		content = "",
		type = "text",
		editorMode = $bindable("wysiwyg"),
		isSaving = $bindable(false),
		streaming = false,
		user,
		artifactId = "",
		title = "",
		examTypeId = null,
	}: {
		filename?: string;
		url?: string;
		saveUrl?: string;
		content?: string;
		type?: "text" | "image" | "pdf";
		editorMode?: "wysiwyg" | "raw";
		isSaving?: boolean;
		streaming?: boolean;
		user?: { designation?: string };
		artifactId?: string;
		title?: string;
		examTypeId?: number | null;
	} = $props();

	let textContent = $state("Loading...");
	let editContent = $state("");
	let containerWidth = $state(0);
	let containerRef = $state<HTMLDivElement | null>(null);
	let pdfFetchState = $state<"idle" | "fetching" | "ready" | "error">("idle");
	let pdfFetchError = $state<string | null>(null);
	let editorSkeletonVisible = $state(false);
	let pdfUrlReady = $state(false);
	let pdfUrlError = $state<string | null>(null);
	let skeletonVisible = $state(true);

	const selectedClass = SelectedClass.fromContext();
	const chat = useChat();
	const designationId = $derived(
		(DESIGNATIONS.indexOf((user?.designation as any) ?? 'it') || 1)
	);
  const selectedClassId = $derived(selectedClass?.data?.classId ?? null);
  const selectedSectionId = $derived(selectedClass?.data?.sectionId ?? null);
  const selectedClassName = $derived(selectedClass?.data?.className ?? '');
  const selectedSectionName = $derived(selectedClass?.data?.sectionName ?? '');

	const editable = $derived.by(() => {
		if (!artifactId) return true;
		if (chat?.lastCommittedArtifactId === artifactId) return true;
		if (chat?.pendingValidationArtifactId === artifactId) return false;
		return true;
	});

	const isMarkdownFile = $derived(
		filename.endsWith(".md") || filename.endsWith(".markdown"),
	);
	let wysiwygContent = $state("");
	let lastSavedContent = $state<string>("");
	let saveDebounceTimer: ReturnType<typeof setTimeout> | null = null;

	function handleWysiwygUpdate(markdown: string) {
		wysiwygContent = markdown;
		editContent = markdown;
	}

	export async function save(): Promise<boolean> {
		const target = saveUrl || url;
		if (!target) return false;
		isSaving = true;
		try {
			const body = editorMode === "wysiwyg" ? wysiwygContent : editContent;
			const res = await fetch(target, {
				method: "PUT",
				body: new Blob([body], { type: "text/plain" }),
			});
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			textContent = body;
			toast.success("File saved successfully");
			return true;
		} catch (err) {
			console.error("Save error:", err);
			toast.error("Failed to save file");
			return false;
		} finally {
			isSaving = false;
		}
	}

	export function copy() {
		const body = editorMode === "wysiwyg" && isMarkdownFile ? wysiwygContent : editContent;
		if (body) {
			navigator.clipboard.writeText(body);
			toast.success("Copied to clipboard");
		}
	}

	export function toggleMode() {
		editorMode = editorMode === "wysiwyg" ? "raw" : "wysiwyg";
	}

	const pdfEngine = usePdfiumEngine();

	let plugins = $derived(
		url
			? [
					createPluginRegistration(DocumentManagerPluginPackage, {
						initialDocuments: [{ url: url }],
					}),
					createPluginRegistration(ViewportPluginPackage),
					createPluginRegistration(ScrollPluginPackage),
					createPluginRegistration(RenderPluginPackage),
				]
			: [],
	);

	$effect(() => {
		if (type === "text") {
			if (streaming) {
				textContent = content ?? "";
				editContent = content ?? "";
			} else if (url) {
				const targetUrl = url;
				textContent = "Loading...";
				editContent = "";
				let cancelled = false;
				const timeoutId = setTimeout(() => {
					if (!cancelled) {
						textContent = "Error: Request timed out after 10s";
						editContent = textContent;
					}
				}, 10000);
				fetch(targetUrl)
					.then((r) => {
						if (!r.ok) throw new Error(`HTTP ${r.status}`);
						return r.text();
					})
					.then((t) => {
						clearTimeout(timeoutId);
						if (cancelled) return;
						textContent = t;
						editContent = t;
						lastSavedContent = t;
					})
					.catch((e) => {
						clearTimeout(timeoutId);
						if (cancelled) return;
						const msg = e instanceof Error ? e.message : String(e);
						textContent = `Error loading file: ${msg}`;
						editContent = textContent;
					});
				return () => {
					cancelled = true;
					clearTimeout(timeoutId);
				};
			} else if (content) {
				textContent = content;
				editContent = content;
				lastSavedContent = content;
			}
		}
	});

	$effect(() => {
		const md = wysiwygContent;
		if (!md || md === lastSavedContent) return;
		if (streaming) return;
		if (!artifactId) return;

		if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
		saveDebounceTimer = setTimeout(async () => {
			const safeTitle = title.replace(/[^a-zA-Z0-9._-]/g, "_");
			const path = examTypeId
				? `exams/examType-${examTypeId}/${safeTitle}.md`
				: null;
			if (!path) return;
			try {
				const res = await fetch(`/api/file/${path}`, {
					method: "PUT",
					body: new Blob([md], { type: "text/markdown" }),
				});
				if (res.ok) lastSavedContent = md;
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				console.error("Auto-save failed:", msg);
			}
		}, 2000);

		return () => {
			if (saveDebounceTimer) {
				clearTimeout(saveDebounceTimer);
				saveDebounceTimer = null;
			}
		};
	});

	$effect(() => {
		if (containerRef) {
			const observer = new ResizeObserver((entries) => {
				containerWidth = entries[0].contentRect.width;
			});
			observer.observe(containerRef);
			return () => observer.disconnect();
		}
	});

	$effect(() => {
		if (!streaming) {
			skeletonVisible = false;
			return;
		}
		if (textContent && textContent.length > 0) {
			skeletonVisible = false;
			return;
		}
		skeletonVisible = true;
		const t = setTimeout(() => {
			skeletonVisible = false;
		}, 200);
		return () => clearTimeout(t);
	});

	$effect(() => {
		if (type !== "pdf" || !url) {
			pdfUrlReady = false;
			pdfUrlError = null;
			return;
		}
		let cancelled = false;
		pdfUrlReady = false;
		pdfUrlError = null;
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 8000);
		fetch(url, { method: "HEAD", signal: controller.signal })
			.then((r) => {
				if (cancelled) return;
				if (!r.ok) {
					pdfUrlError = `HTTP ${r.status}`;
					pdfUrlReady = false;
				} else {
					pdfUrlReady = true;
					pdfUrlError = null;
				}
			})
			.catch((e) => {
				if (cancelled) return;
				pdfUrlError = e instanceof Error ? e.message : String(e);
				pdfUrlReady = false;
			})
			.finally(() => clearTimeout(timeout));
		return () => {
			cancelled = true;
			clearTimeout(timeout);
			controller.abort();
		};
	});
</script>

{#if filename}
	<div class="flex flex-col w-full h-full relative pb-4 group">
		<header
			class="flex items-center justify-between h-11 px-3 sm:px-4 border-b border-border/30 bg-background/60 backdrop-blur-sm shrink-0"
		>
			<span class="text-[12px] font-semibold text-foreground truncate">
				{filename || "Untitled"}
			</span>
			{#if streaming}
				<span
					class="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20 text-[10px] font-bold text-primary uppercase tracking-widest"
				>
					<span class="size-1.5 rounded-full bg-primary animate-pulse"></span>
					Streaming…
				</span>
			{/if}
		</header>
		{#if type === "text"}
			{#if streaming && isMarkdownFile && editorMode === "wysiwyg"}
				{#if skeletonVisible}
					<ScrollArea class="flex-1 w-full bg-background overflow-hidden p-4">
						<div class="space-y-2 max-w-3xl">
							{#each [60, 80, 45, 75, 55, 70, 40] as w, i (i)}
								<div
									class="h-3 rounded-md bg-muted-foreground/15"
									style:width="{w}%"
								></div>
							{/each}
						</div>
					</ScrollArea>
				{:else}
					<ScrollArea class="flex-1 w-full bg-background overflow-hidden p-4">
						<div class="prose prose-sm max-w-none dark:prose-invert">
							<Markdown content={textContent} />
						</div>
					</ScrollArea>
				{/if}
			{:else if textContent === "Loading..." || textContent.startsWith("Error loading")}
				<LoadingState label={textContent === "Loading..." ? "Loading file content" : textContent} />
			{:else if isMarkdownFile && editorMode === "wysiwyg"}
				<div class="flex-1 min-h-0 overflow-hidden">
				<WysiwygEditor
					content={textContent}
					onUpdate={handleWysiwygUpdate}
					class="h-full"
					designationId={designationId}
					selectedClassId={selectedClassId}
					selectedSectionId={selectedSectionId}
					selectedClassName={selectedClassName}
					selectedSectionName={selectedSectionName}
					editable={editable}
				/>
				</div>
			{:else}
				<ScrollArea class="flex-1 w-full bg-background overflow-hidden relative">
					<textarea
						bind:value={editContent}
						readonly={streaming}
						class="w-full min-h-full absolute inset-0 p-4 text-[0.7rem] font-mono leading-relaxed bg-transparent resize-none outline-none border-none focus:ring-0"
					></textarea>
				</ScrollArea>
			{/if}
		{:else if type === "image"}
			<ScrollArea class="flex-1">
				<div class="flex items-center justify-center p-4">
					<img
						src={url}
						alt={filename}
						class="max-w-full rounded-md shadow-sm"
					/>
				</div>
			</ScrollArea>
		{:else if type === "pdf"}
			<div
				class="flex-1 overflow-hidden relative bg-white"
				bind:this={containerRef}
			>
				{#if pdfEngine.isLoading || !pdfEngine.engine}
					<LoadingState label="Loading PDF engine" />
				{:else if pdfUrlError}
					<div
						class="h-full flex flex-col items-center justify-center gap-3 text-center px-6"
					>
						<AlertCircleIcon class="size-10 text-destructive/70" />
						<p class="text-sm font-semibold text-foreground">PDF not ready</p>
						<p class="text-[11px] text-muted-foreground max-w-xs">{pdfUrlError}</p>
						<Button size="sm" variant="outline" onclick={() => location.reload()}>
							<RefreshCwIcon class="size-3.5 mr-1" /> Retry
						</Button>
					</div>
				{:else if !pdfUrlReady}
					<div class="h-full flex flex-col items-center justify-center gap-3">
						<Spinner class="size-8 text-primary" />
						<p
							class="text-[10px] font-bold uppercase tracking-widest text-muted-foreground"
						>
							Loading PDF…
						</p>
					</div>
				{:else}
					<EmbedPDF engine={pdfEngine.engine} {plugins}>
						{#snippet children({ activeDocumentId })}
							{#if activeDocumentId}
								{@const documentId = activeDocumentId}
								<DocumentContent {documentId}>
									{#snippet children(documentContent)}
										{#if documentContent.isLoaded}
											{#snippet renderPage(page: RenderPageProps)}
												{@const pageScale = containerWidth
													? containerWidth / page.width
													: 1}
												<div
													style:width="{page.width * pageScale}px"
													style:height="{page.height * pageScale}px"
													class="bg-white origin-top transition-all duration-300"
												>
													<RenderLayer
														{documentId}
														pageIndex={page.pageIndex}
														scale={pageScale}
													/>
												</div>
											{/snippet}
											<Viewport
												{documentId}
												class="w-full h-full overflow-x-hidden relative"
											>
												<Scroller {documentId} {renderPage} />
											</Viewport>
										{/if}
									{/snippet}
								</DocumentContent>
							{/if}
						{/snippet}
					</EmbedPDF>
				{/if}
			</div>
		{/if}

		{#if streaming}
			<div
				class="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-primary/10 border border-primary/30 backdrop-blur-md flex items-center gap-2"
			>
				<span class="size-1.5 rounded-full bg-primary animate-pulse"></span>
				<span class="text-[11px] font-bold text-primary uppercase tracking-wider">Streaming…</span>
			</div>
		{/if}
	</div>
{/if}
