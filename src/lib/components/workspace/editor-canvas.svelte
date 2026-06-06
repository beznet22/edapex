<script lang="ts">
	import { ScrollArea } from "$lib/components/ui/scroll-area";
	import WysiwygEditor from "$lib/components/editor/WysiwygEditor.svelte";
	import EditorModeToggle from "$lib/components/editor/EditorModeToggle.svelte";
	import { toast } from "svelte-sonner";

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
	}: {
		filename?: string;
		url?: string;
		saveUrl?: string;
		content?: string;
		type?: "text" | "image" | "pdf";
		editorMode?: "wysiwyg" | "raw";
		isSaving?: boolean;
		streaming?: boolean;
	} = $props();

	let textContent = $state("Loading...");
	let editContent = $state("");
	let containerWidth = $state(0);
	let containerRef = $state<HTMLDivElement | null>(null);

	const isMarkdownFile = $derived(
		filename.endsWith(".md") || filename.endsWith(".markdown"),
	);
	let wysiwygContent = $state("");

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
				textContent = "Loading...";
				editContent = "";
				fetch(url)
					.then((r) => r.text())
					.then((t) => {
						textContent = t;
						editContent = t;
					})
					.catch((e) => {
						textContent = `Error loading file: ${e.message}`;
						editContent = textContent;
					});
			} else if (content) {
				textContent = content;
				editContent = content;
			}
		}
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
</script>

{#if filename}
	<div class="flex flex-col w-full h-full relative pb-4 group">
		{#if type === "text"}
			{#if isMarkdownFile}
				<div
					class="absolute top-4 left-1/2 -translate-x-1/2 z-50 opacity-0 group-hover:opacity-100 transition-all duration-300 shadow-2xl rounded-full pointer-events-auto"
				>
					<EditorModeToggle bind:mode={editorMode} />
				</div>
			{/if}

			{#if isMarkdownFile && editorMode === "wysiwyg"}
				<div class="flex-1 min-h-0 overflow-hidden">
					{#if textContent !== "Loading..."}
						<WysiwygEditor
							content={textContent}
							onUpdate={handleWysiwygUpdate}
							class="h-full"
						/>
					{:else}
						<div
							class="flex items-center justify-center h-full text-muted-foreground text-sm"
						>
							Loading editor...
						</div>
					{/if}
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
					<div
						class="absolute inset-0 flex justify-center items-center text-sm font-medium text-muted-foreground"
					>
						Loading PDF Engine...
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
