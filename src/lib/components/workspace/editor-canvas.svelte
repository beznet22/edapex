<script lang="ts">
	import { ScrollArea } from "$lib/components/ui/scroll-area";
	import WysiwygEditor from "$lib/components/editor/WysiwygEditor.svelte";
	import { normalizeMarkdown } from "$lib/components/editor/markdown-normalize";
	import BottomToolbar from "$lib/components/editor/BottomToolbar.svelte";
	import MobileAISheet from "$lib/components/editor/MobileAISheet.svelte";
	import {
		breakpointFromWidth,
		type ContainerBreakpoint,
	} from "$lib/components/editor/useContainerBreakpoint.svelte";
	import LoadingState from "./loading-state.svelte";
	import { Markdown } from "$lib/components/prompt-kit/markdown";
	import { Spinner } from "$lib/components/ui/spinner/index.js";
	import AlertCircleIcon from "@lucide/svelte/icons/alert-circle";
	import RefreshCwIcon from "@lucide/svelte/icons/refresh-cw";
	import { Button } from "$lib/components/ui/button/index.js";
	import { toast } from "svelte-sonner";
	import { SelectedClass } from "$lib/context/sync.svelte";
	import { DESIGNATIONS } from "$lib/types/sms-types";
	import { parseMarksheetMarkdown, autoFixStructure } from "$lib/utils/marksheet-ast-parser";

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
	let textContainerRef = $state<HTMLDivElement | null>(null);
	let textContainerWidth = $state(0);
	const containerBreakpoint = $derived<ContainerBreakpoint>(
		breakpointFromWidth(textContainerWidth),
	);
	let mobileSheetOpen = $state(false);
	let pdfFetchState = $state<"idle" | "fetching" | "ready" | "error">("idle");
	let pdfFetchError = $state<string | null>(null);
	let editorSkeletonVisible = $state(false);
	let pdfUrlReady = $state(false);
	let pdfUrlError = $state<string | null>(null);
	let skeletonVisible = $state(true);

	const selectedClass = SelectedClass.fromContext();
	const designationId = $derived(
		DESIGNATIONS.indexOf((user?.designation as any) ?? "it") || 1,
	);
	const selectedClassId = $derived(selectedClass?.data?.classId ?? null);
	const selectedSectionId = $derived(selectedClass?.data?.sectionId ?? null);
	const selectedClassName = $derived(selectedClass?.data?.className ?? "");
	const selectedSectionName = $derived(
		selectedClass?.data?.sectionName ?? "",
	);

	// Editor is always editable; validation approval is handled via the tool
	// approval flow (ActionBar) and does not lock the canvas.
	const editable = $derived(true);

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
			const body =
				editorMode === "wysiwyg" ? wysiwygContent : editContent;
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
		const body =
			editorMode === "wysiwyg" && isMarkdownFile
				? wysiwygContent
				: editContent;
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
			} else if (content) {
				textContent = content;
				editContent = content;
				lastSavedContent = content;
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
			}
		}
	});

	let parseStatus = $state<"idle" | "ok" | "error">("idle");

	$effect(() => {
		const md = wysiwygContent;
		if (!md || normalizeMarkdown(md) === normalizeMarkdown(lastSavedContent)) return;
		if (streaming) return;
		if (!artifactId) return;
		if (!url) return;

		if (saveDebounceTimer) clearTimeout(saveDebounceTimer);
		saveDebounceTimer = setTimeout(async () => {
			try {
				const res = await fetch(url, {
					method: "PUT",
					body: new Blob([md], { type: "text/markdown" }),
				});
				if (!res.ok) return;
				lastSavedContent = md;

				// Parse — auto-fix structural issues if template is corrupted
				try {
					const parsed = parseMarksheetMarkdown(md);
					parseStatus = "ok";
					const rawJsonUrl = url.replace(/\.md$/, ".raw.json");
					await fetch(rawJsonUrl, {
						method: "PUT",
						body: new Blob([JSON.stringify(parsed, null, 2)], { type: "application/json" }),
					}).catch(() => {});
				} catch (parseErr) {
					// Parser failed — template corrupted. Auto-fix structure.
					const result = autoFixStructure(md);
					if (result.fixes.length > 0 && result.fixedMd !== md) {
						// Replace editor content with fixed version
						wysiwygContent = result.fixedMd;
						editContent = result.fixedMd;
						const rawJsonUrl = url.replace(/\.md$/, ".raw.json");
						const reparsed = parseMarksheetMarkdown(result.fixedMd);
						await fetch(rawJsonUrl, {
							method: "PUT",
							body: new Blob([JSON.stringify(reparsed, null, 2)], { type: "application/json" }),
						}).catch(() => {});
						parseStatus = "ok";
					} else {
						parseStatus = "error";
					}
				}
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
		if (textContainerRef) {
			const observer = new ResizeObserver((entries) => {
				textContainerWidth = entries[0].contentRect.width;
			});
			observer.observe(textContainerRef);
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
	{#if type === "text"}
		{#if streaming && isMarkdownFile && editorMode === "wysiwyg"}
			{#if skeletonVisible}
				<ScrollArea
					class="flex-1 w-full bg-background overflow-hidden p-4"
				>
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
				<ScrollArea
					class="flex-1 w-full bg-background overflow-hidden p-4"
				>
					<div class="prose prose-sm max-w-none dark:prose-invert">
						<Markdown content={textContent} />
					</div>
				</ScrollArea>
			{/if}
		{:else if textContent === "Loading..." || textContent.startsWith("Error loading")}
			<LoadingState
				label={textContent === "Loading..."
					? "Loading file content"
					: textContent}
			/>
		{:else if isMarkdownFile && editorMode === "wysiwyg"}
			<div class="flex-1 min-h-0 overflow-hidden flex flex-col">
				<div
					class="flex-1 min-h-0 overflow-hidden"
					bind:this={textContainerRef}
				>
					{#key url}
						<WysiwygEditor
							content={textContent}
							onUpdate={handleWysiwygUpdate}
							class="h-full"
							{designationId}
							{selectedClassId}
							{selectedSectionId}
							{selectedClassName}
							{selectedSectionName}
							{editable}
						/>
					{/key}
				</div>
				{#if parseStatus !== "idle"}
					<div
						class="h-5 px-3 flex items-center gap-1.5 text-[10px] font-medium border-t {parseStatus === 'ok' ? 'bg-green-50/50' : 'bg-red-50/50'}"
					>
						<div
							class="size-1.5 rounded-full {parseStatus === 'ok' ? 'bg-green-500' : 'bg-red-500'}"
						></div>
						<span
							class={parseStatus === "ok" ? "text-green-700" : "text-red-700"}
						>
							{parseStatus === "ok" ? "Template OK" : "Template error — could not auto-fix"}
						</span>
					</div>
				{/if}
			</div>
		{:else}
			<ScrollArea
				class="flex-1 w-full bg-background overflow-hidden relative"
			>
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
					<p class="text-sm font-semibold text-foreground">
						PDF not ready
					</p>
					<p class="text-[11px] text-muted-foreground max-w-xs">
						{pdfUrlError}
					</p>
					<Button
						size="sm"
						variant="outline"
						onclick={() => location.reload()}
					>
						<RefreshCwIcon class="size-3.5 mr-1" /> Retry
					</Button>
				</div>
			{:else if !pdfUrlReady}
				<div
					class="h-full flex flex-col items-center justify-center gap-3"
				>
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
										{#snippet renderPage(
											page: RenderPageProps,
										)}
											{@const pageScale = containerWidth
												? containerWidth / page.width
												: 1}
											<div
												style:width="{page.width *
													pageScale}px"
												style:height="{page.height *
													pageScale}px"
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
											<Scroller
												{documentId}
												{renderPage}
											/>
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
{/if}
